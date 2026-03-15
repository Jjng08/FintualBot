/**
 * Market API Client
 * Validates: Requirements 7.1, 7.2, 7.3, 7.4
 *
 * Fuente primaria: Yahoo Finance (precio en tiempo real del ETF en NYSE)
 * Fuente secundaria: Fintual API (precio del fondo equivalente, con retraso)
 *
 * La lógica de arbitraje se basa en que Yahoo Finance refleja el precio
 * actual del mercado, mientras que Fintual actualiza sus precios con retraso.
 * Cuando el ETF sube ≥1.5% en NYSE, hay una ventana para comprar en Fintual
 * antes de que actualice su precio.
 */

import yahooFinance from 'yahoo-finance2';
import { CircuitBreaker, retryWithBackoff, CategorizedError, ErrorCategory } from '../utils/errorHandling';

export interface IMarketAPIClient {
  getPrice(symbol: string): Promise<number>;
  getPrices(symbols: string[]): Promise<Map<string, number>>;
  validateSymbol(symbol: string): Promise<boolean>;
  getFintualPrice(symbol: string): Promise<number | null>;
  getFintualAssets(): Promise<FintualAsset[]>;
}

export interface FintualAsset {
  id: string;
  name: string;
  symbol: string;
  nav: number;       // Net Asset Value (precio actual del fondo)
  date: string;
}

interface FintualTokenResponse {
  data: {
    id: string;
    type: string;
    attributes: {
      token: string;
      email: string;
    };
  };
}

interface FintualRealAsset {
  id: string;
  attributes: {
    name: string;
    symbol: string;
    last_day: {
      net_asset_value: number;
      date: string;
    };
  };
}

const FINTUAL_BASE_URL = 'https://fintual.cl/api';

export class MarketAPIClient implements IMarketAPIClient {
  private fintualEmail?: string;
  private fintualPassword?: string;
  private fintualToken?: string;
  private fintualTokenExpiry?: Date;
  private primaryCircuitBreaker: CircuitBreaker;
  private secondaryCircuitBreaker: CircuitBreaker;

  constructor(_primaryApiKey?: string, _secondaryApiKey?: string, fintualEmail?: string, fintualPassword?: string) {
    this.fintualEmail = fintualEmail;
    this.fintualPassword = fintualPassword;
    this.primaryCircuitBreaker = new CircuitBreaker(5, 60000);
    this.secondaryCircuitBreaker = new CircuitBreaker(5, 60000);
  }

  /**
   * Obtiene el precio actual de un símbolo.
   * Primaria: Yahoo Finance. Secundaria: Fintual.
   */
  async getPrice(symbol: string): Promise<number> {
    let lastError: Error | null = null;

    // Primaria: Yahoo Finance
    try {
      const price = await this.primaryCircuitBreaker.execute(async () => {
        return await retryWithBackoff(
          async () => await this.fetchFromYahooFinance(symbol),
          3,
          1000
        );
      });

      if (!this.isValidPrice(price)) {
        throw new CategorizedError(`Precio inválido de Yahoo Finance: ${price}`, ErrorCategory.VALIDATION, symbol);
      }

      console.log(`[MarketAPIClient] Yahoo Finance ${symbol}: $${price}`);
      return price;
    } catch (error) {
      console.warn(`[MarketAPIClient] Yahoo Finance falló para ${symbol}:`, (error as Error).message);
      lastError = error as Error;
    }

    // Secundaria: Fintual
    try {
      const price = await this.secondaryCircuitBreaker.execute(async () => {
        return await retryWithBackoff(
          async () => {
            const p = await this.getFintualPrice(symbol);
            if (p === null) throw new Error(`Sin fondo Fintual para ${symbol}`);
            return p;
          },
          3,
          1000
        );
      });

      if (!this.isValidPrice(price)) {
        throw new CategorizedError(`Precio inválido de Fintual: ${price}`, ErrorCategory.VALIDATION, symbol);
      }

      console.log(`[MarketAPIClient] Fintual fallback ${symbol}: $${price}`);
      return price;
    } catch (error) {
      console.error(`[MarketAPIClient] Fintual también falló para ${symbol}:`, (error as Error).message);
      lastError = error as Error;
    }

    throw new CategorizedError(
      `No se pudo obtener precio para ${symbol}: ${lastError?.message}`,
      ErrorCategory.NETWORK,
      symbol,
      lastError || undefined
    );
  }

  /**
   * Obtiene precios para múltiples símbolos en paralelo.
   */
  async getPrices(symbols: string[]): Promise<Map<string, number>> {
    const prices = new Map<string, number>();
    const results = await Promise.allSettled(
      symbols.map(async (symbol) => ({ symbol, price: await this.getPrice(symbol) }))
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        prices.set(result.value.symbol, result.value.price);
      } else {
        console.error(`[MarketAPIClient] Error obteniendo precio:`, result.reason);
      }
    }

    return prices;
  }

  /**
   * Valida si un símbolo existe en Yahoo Finance.
   */
  async validateSymbol(symbol: string): Promise<boolean> {
    try {
      const quote = await yahooFinance.quote(symbol, {}, { validateResult: false });
      return !!(quote as { regularMarketPrice?: number })?.regularMarketPrice;
    } catch {
      return /^[A-Z]{1,5}$/.test(symbol);
    }
  }

  /**
   * Obtiene el precio NAV del fondo Fintual más cercano al símbolo dado.
   * Busca entre todos los real_assets disponibles por nombre.
   */
  async getFintualPrice(symbol: string): Promise<number | null> {
    try {
      const assets = await this.getFintualAssets();
      // Busca el fondo cuyo nombre o símbolo contenga el símbolo del ETF
      const match = assets.find(a =>
        a.symbol?.toUpperCase().includes(symbol.toUpperCase()) ||
        a.name?.toUpperCase().includes(symbol.toUpperCase())
      );
      return match ? match.nav : null;
    } catch (error) {
      console.error(`[MarketAPIClient] Error buscando precio Fintual para ${symbol}:`, (error as Error).message);
      return null;
    }
  }

  /**
   * Obtiene todos los activos disponibles en Fintual con su precio NAV actual.
   * Requiere autenticación si las credenciales están configuradas.
   */
  async getFintualAssets(): Promise<FintualAsset[]> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };

    // Autenticar si hay credenciales
    if (this.fintualEmail && this.fintualPassword) {
      const token = await this.getFintualToken();
      if (token) headers['Authorization'] = `Bearer ${token}`;
    }

    // Obtener todos los real_assets (fondos con precio NAV)
    const response = await fetch(`${FINTUAL_BASE_URL}/real_assets`, { headers });

    if (!response.ok) {
      // Si falla con auth, intentar sin auth (datos públicos)
      const publicResponse = await fetch(`${FINTUAL_BASE_URL}/real_assets`);
      if (!publicResponse.ok) throw new Error(`Fintual API error: ${publicResponse.status}`);
      return this.parseFintualAssets(await publicResponse.json() as { data?: FintualRealAsset[] });
    }

    return this.parseFintualAssets(await response.json() as { data?: FintualRealAsset[] });
  }

  // ─── Métodos privados ────────────────────────────────────────────────────────

  private async fetchFromYahooFinance(symbol: string): Promise<number> {
    const quote = await yahooFinance.quote(symbol, {}, { validateResult: false }) as {
      regularMarketPrice?: number;
      ask?: number;
      bid?: number;
    };

    const price = quote?.regularMarketPrice ?? quote?.ask ?? quote?.bid;
    if (!price) throw new Error(`Sin precio disponible para ${symbol} en Yahoo Finance`);
    return price;
  }

  /**
   * Obtiene o renueva el token de autenticación de Fintual.
   */
  private async getFintualToken(): Promise<string | null> {
    // Reusar token si aún es válido (tokens duran ~24h, renovamos cada 12h)
    if (this.fintualToken && this.fintualTokenExpiry && new Date() < this.fintualTokenExpiry) {
      return this.fintualToken;
    }

    try {
      const response = await fetch(`${FINTUAL_BASE_URL}/access_tokens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user: {
            email: this.fintualEmail,
            password: this.fintualPassword
          }
        })
      });

      if (!response.ok) {
        console.error(`[MarketAPIClient] Fintual auth falló: ${response.status}`);
        return null;
      }

      const data = await response.json() as FintualTokenResponse;
      this.fintualToken = data?.data?.attributes?.token;

      // Token válido por 12 horas
      this.fintualTokenExpiry = new Date(Date.now() + 12 * 60 * 60 * 1000);

      console.log(`[MarketAPIClient] Autenticado en Fintual como ${this.fintualEmail}`);
      return this.fintualToken ?? null;
    } catch (error) {
      console.error(`[MarketAPIClient] Error autenticando en Fintual:`, (error as Error).message);
      return null;
    }
  }

  private parseFintualAssets(data: { data?: FintualRealAsset[] }): FintualAsset[] {
    if (!data?.data || !Array.isArray(data.data)) return [];

    return data.data
      .filter(asset => asset?.attributes?.last_day?.net_asset_value)
      .map(asset => ({
        id: asset.id,
        name: asset.attributes.name,
        symbol: asset.attributes.symbol,
        nav: asset.attributes.last_day.net_asset_value,
        date: asset.attributes.last_day.date
      }));
  }

  private isValidPrice(price: number): boolean {
    return typeof price === 'number' && !isNaN(price) && isFinite(price) && price > 0;
  }
}

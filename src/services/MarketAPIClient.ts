/**
 * Market API Client
 * Validates: Requirements 7.1, 7.2, 7.3, 7.4
 * 
 * Obtains market price data from external APIs with fallback support.
 * Validates prices and symbols to ensure data quality.
 */

import { CircuitBreaker, retryWithBackoff, CategorizedError, ErrorCategory } from '../utils/errorHandling';

/**
 * Interface for Market API Client
 * Defines the contract for obtaining market data
 */
export interface IMarketAPIClient {
  getPrice(symbol: string): Promise<number>;
  getPrices(symbols: string[]): Promise<Map<string, number>>;
  validateSymbol(symbol: string): Promise<boolean>;
}

/**
 * MarketAPIClient class
 * Obtains market prices from external APIs with fallback support
 * 
 * Validates: Requirements 7.1, 7.2, 7.3, 7.4
 */
export class MarketAPIClient implements IMarketAPIClient {
  private _primaryApiKey: string;
  private secondaryApiKey?: string;
  private primaryCircuitBreaker: CircuitBreaker;
  private secondaryCircuitBreaker: CircuitBreaker;

  /**
   * Creates a new MarketAPIClient instance
   * 
   * @param primaryApiKey - API key for primary market data source
   * @param secondaryApiKey - Optional API key for fallback source
   */
  constructor(primaryApiKey: string, secondaryApiKey?: string) {
    this._primaryApiKey = primaryApiKey;
    this.secondaryApiKey = secondaryApiKey;
    this.primaryCircuitBreaker = new CircuitBreaker(5, 60000);
    this.secondaryCircuitBreaker = new CircuitBreaker(5, 60000);
  }

  /**
   * Gets the current price for a single symbol
   * Attempts primary API first, falls back to secondary if available
   * Uses circuit breaker and retry mechanisms for resilience
   * 
   * Validates: Requirements 7.1, 7.2, 7.3, 7.4
   * 
   * @param symbol - Asset symbol (e.g., "VTI", "SPY")
   * @returns Current price of the asset
   * @throws Error if price cannot be obtained or is invalid
   */
  async getPrice(symbol: string): Promise<number> {
    let lastError: Error | null = null;

    // Try primary API first with circuit breaker and retry (Requirement 7.1, 7.2)
    try {
      console.log(`[MarketAPIClient] Fetching price for ${symbol} from primary API`);
      
      const price = await this.primaryCircuitBreaker.execute(async () => {
        return await retryWithBackoff(
          async () => await this.fetchPriceFromPrimaryAPI(symbol),
          3,
          1000
        );
      });
      
      // Validate price is positive number > 0 (Requirement 7.3)
      if (!this.isValidPrice(price)) {
        throw new CategorizedError(
          `Invalid price received from primary API: ${price}`,
          ErrorCategory.VALIDATION,
          symbol
        );
      }
      
      console.log(`[MarketAPIClient] Successfully fetched ${symbol} price from primary API: ${price}`);
      return price;
    } catch (error) {
      console.warn(`[MarketAPIClient] Primary API failed for ${symbol}:`, error);
      lastError = error as Error;
    }

    // Try secondary API if available (Requirement 7.2)
    if (this.secondaryApiKey) {
      try {
        console.log(`[MarketAPIClient] Fetching price for ${symbol} from secondary API`);
        
        const price = await this.secondaryCircuitBreaker.execute(async () => {
          return await retryWithBackoff(
            async () => await this.fetchPriceFromSecondaryAPI(symbol),
            3,
            1000
          );
        });
        
        // Validate price is positive number > 0 (Requirement 7.3)
        if (!this.isValidPrice(price)) {
          throw new CategorizedError(
            `Invalid price received from secondary API: ${price}`,
            ErrorCategory.VALIDATION,
            symbol
          );
        }
        
        console.log(`[MarketAPIClient] Successfully fetched ${symbol} price from secondary API: ${price}`);
        return price;
      } catch (error) {
        console.error(`[MarketAPIClient] Secondary API also failed for ${symbol}:`, error);
        lastError = error as Error;
      }
    }

    // Both APIs failed (Requirement 7.4)
    throw new CategorizedError(
      `Failed to fetch price for ${symbol}: ${lastError?.message || 'Unknown error'}`,
      ErrorCategory.NETWORK,
      symbol,
      lastError || undefined
    );
  }

  /**
   * Gets current prices for multiple symbols in batch
   * Processes each symbol independently - failures don't affect other symbols
   * 
   * Validates: Requirements 7.1, 7.2, 7.5
   * 
   * @param symbols - Array of asset symbols
   * @returns Map of symbol to price for successfully fetched prices
   */
  async getPrices(symbols: string[]): Promise<Map<string, number>> {
    const prices = new Map<string, number>();
    
    // Process each symbol independently (Requirement 7.5)
    const results = await Promise.allSettled(
      symbols.map(async (symbol) => {
        const price = await this.getPrice(symbol);
        return { symbol, price };
      })
    );

    // Collect successful results
    for (const result of results) {
      if (result.status === 'fulfilled') {
        prices.set(result.value.symbol, result.value.price);
      } else {
        console.error(`[MarketAPIClient] Failed to fetch price:`, result.reason);
      }
    }

    return prices;
  }

  /**
   * Validates if a symbol is valid and tradeable
   * 
   * Validates: Requirement 1.3
   * 
   * @param symbol - Asset symbol to validate
   * @returns true if symbol is valid, false otherwise
   */
  async validateSymbol(symbol: string): Promise<boolean> {
    try {
      console.log(`[MarketAPIClient] Validating symbol: ${symbol}`);
      const isValid = await this.validateSymbolWithAPI(symbol);
      console.log(`[MarketAPIClient] Symbol ${symbol} validation result: ${isValid}`);
      return isValid;
    } catch (error) {
      console.error(`[MarketAPIClient] Error validating symbol ${symbol}:`, error);
      return false;
    }
  }

  /**
   * Validates if a price is a positive number greater than zero
   * 
   * Validates: Requirement 7.3
   * 
   * @param price - Price value to validate
   * @returns true if price is valid, false otherwise
   */
  private isValidPrice(price: number): boolean {
    return typeof price === 'number' && 
           !isNaN(price) && 
           isFinite(price) && 
           price > 0;
  }

  /**
   * Fetches price from primary API
   * This is a placeholder implementation - should be replaced with actual API integration
   * 
   * @param _symbol - Asset symbol
   * @returns Price from primary API
   */
  private async fetchPriceFromPrimaryAPI(_symbol: string): Promise<number> {
    // TODO: Implement actual API integration (e.g., Alpha Vantage, Yahoo Finance)
    // For now, this is a placeholder that simulates API behavior
    // The _primaryApiKey will be used in the actual implementation
    void this._primaryApiKey; // Placeholder - will be used in actual API integration
    
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // This is a mock implementation - replace with actual API call
    // Example for Alpha Vantage:
    // const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${_symbol}&apikey=${this._primaryApiKey}`;
    // const response = await fetch(url);
    // const data = await response.json();
    // return parseFloat(data['Global Quote']['05. price']);
    
    throw new Error('Primary API not implemented - replace with actual API integration');
  }

  /**
   * Fetches price from secondary API
   * This is a placeholder implementation - should be replaced with actual API integration
   * 
   * @param _symbol - Asset symbol
   * @returns Price from secondary API
   */
  private async fetchPriceFromSecondaryAPI(_symbol: string): Promise<number> {
    // TODO: Implement actual API integration for fallback source
    // For now, this is a placeholder that simulates API behavior
    
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // This is a mock implementation - replace with actual API call
    throw new Error('Secondary API not implemented - replace with actual API integration');
  }

  /**
   * Validates symbol with API
   * This is a placeholder implementation - should be replaced with actual API integration
   * 
   * @param symbol - Asset symbol to validate
   * @returns true if symbol is valid
   */
  private async validateSymbolWithAPI(symbol: string): Promise<boolean> {
    // TODO: Implement actual symbol validation with API
    // For now, use basic validation rules
    
    // Basic validation: 1-5 uppercase letters
    const symbolRegex = /^[A-Z]{1,5}$/;
    return symbolRegex.test(symbol);
  }
}

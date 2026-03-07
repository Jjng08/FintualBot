/**
 * Asset Monitor Service
 * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 7.3, 7.4, 7.5
 * 
 * Monitors prices for multiple assets during the trading window.
 * Maintains base prices and current prices in memory cache.
 * Handles errors per asset without affecting other assets.
 */

import { IMarketAPIClient } from './MarketAPIClient';
import { PriceUpdate } from '../types';
import { Logger } from './Logger';

/**
 * Interface for Asset Monitor
 * Defines the contract for monitoring asset prices
 */
export interface IAssetMonitor {
  initializeBasePrices(): Promise<Map<string, number>>;
  updateCurrentPrices(): Promise<Map<string, PriceUpdate>>;
  getBasePrice(asset: string): number | null;
  getCurrentPrice(asset: string): number | null;
}

/**
 * AssetMonitor class
 * Obtains and tracks prices for multiple assets independently
 * 
 * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 7.3, 7.4, 7.5
 */
export class AssetMonitor implements IAssetMonitor {
  private marketAPIClient: IMarketAPIClient;
  private assetList: string[];
  private basePrices: Map<string, number>;
  private currentPrices: Map<string, number>;
  private lastUpdate: Map<string, Date>;
  private logger: Logger;

  /**
   * Creates a new AssetMonitor instance
   * 
   * @param marketAPIClient - Client for obtaining market prices
   * @param assetList - List of asset symbols to monitor
   */
  constructor(marketAPIClient: IMarketAPIClient, assetList: string[]) {
    this.marketAPIClient = marketAPIClient;
    this.assetList = assetList;
    this.basePrices = new Map<string, number>();
    this.currentPrices = new Map<string, number>();
    this.lastUpdate = new Map<string, Date>();
    this.logger = new Logger('AssetMonitor');
  }

  /**
   * Initializes base prices for all assets at 11:30
   * Obtains and stores the Base_Price for each asset in Asset_List
   * 
   * Validates: Requirements 2.1, 2.5
   * 
   * @returns Map of asset symbol to base price for successfully initialized assets
   */
  async initializeBasePrices(): Promise<Map<string, number>> {
    this.logger.info(`Initializing base prices for ${this.assetList.length} assets`);
    
    const results = new Map<string, number>();

    // Process each asset independently (Requirement 2.4)
    for (const asset of this.assetList) {
      try {
        this.logger.debug('Fetching base price', asset);
        const price = await this.marketAPIClient.getPrice(asset);
        
        // Validate price is positive (Requirement 7.3)
        if (!this.isValidPrice(price)) {
          this.logger.error('Invalid base price', asset, { price });
          continue;
        }

        // Store base price (Requirement 2.1, 2.5)
        this.basePrices.set(asset, price);
        this.currentPrices.set(asset, price);
        this.lastUpdate.set(asset, new Date());
        results.set(asset, price);
        
        this.logger.info('Base price initialized', asset, { basePrice: price });
      } catch (error) {
        // Log error but continue with other assets (Requirement 2.4, 7.5)
        this.logger.error('Failed to initialize base price', asset, {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined
        });
      }
    }

    this.logger.info(`Base prices initialized for ${results.size}/${this.assetList.length} assets`);
    return results;
  }

  /**
   * Updates current prices for all assets
   * Obtains Current_Price for each asset every 5 minutes during monitoring window
   * 
   * Validates: Requirements 2.2, 2.3, 2.4, 7.5
   * 
   * @returns Map of asset symbol to price update for successfully updated assets
   */
  async updateCurrentPrices(): Promise<Map<string, PriceUpdate>> {
    this.logger.debug(`Updating current prices for ${this.assetList.length} assets`);
    
    const results = new Map<string, PriceUpdate>();
    const timestamp = new Date();

    // Process each asset independently (Requirement 2.4, 7.5)
    for (const asset of this.assetList) {
      try {
        this.logger.debug('Fetching current price', asset);
        const price = await this.marketAPIClient.getPrice(asset);
        
        // Validate price is positive (Requirement 7.3)
        if (!this.isValidPrice(price)) {
          this.logger.error('Invalid current price', asset, { price });
          continue;
        }

        // Store current price (Requirement 2.2)
        this.currentPrices.set(asset, price);
        this.lastUpdate.set(asset, timestamp);
        
        const priceUpdate: PriceUpdate = {
          asset,
          price,
          timestamp,
          source: 'market'
        };
        
        results.set(asset, priceUpdate);
        
        this.logger.debug('Current price updated', asset, { price });
      } catch (error) {
        // Log error but continue with other assets (Requirement 2.4, 7.5)
        this.logger.error('Failed to update current price', asset, {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined
        });
      }
    }

    this.logger.debug(`Current prices updated for ${results.size}/${this.assetList.length} assets`);
    return results;
  }

  /**
   * Gets the base price for a specific asset
   * Base price remains immutable throughout the Gap_Window
   * 
   * Validates: Requirement 2.5
   * 
   * @param asset - Asset symbol
   * @returns Base price if available, null otherwise
   */
  getBasePrice(asset: string): number | null {
    return this.basePrices.get(asset) ?? null;
  }

  /**
   * Gets the current price for a specific asset
   * 
   * @param asset - Asset symbol
   * @returns Current price if available, null otherwise
   */
  getCurrentPrice(asset: string): number | null {
    return this.currentPrices.get(asset) ?? null;
  }

  /**
   * Validates if a price is a positive number greater than zero
   * 
   * Validates: Requirement 7.3, 7.4
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
}

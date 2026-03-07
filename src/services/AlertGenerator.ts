/**
 * Alert Generator Service
 * Validates: Requirements 3.1, 3.2, 4.1, 4.4, 8.1, 8.2, 8.3
 * 
 * Evaluates price changes and generates trading signals when conditions are met.
 * Calculates percentage changes, checks alert status, and estimates Fintual prices.
 */

import { IPriceTracker, SignalData } from './PriceTracker';
import { Logger } from './Logger';

/**
 * Interface for Alert Generator
 * Defines the contract for alert evaluation and signal generation
 */
export interface IAlertGenerator {
  evaluateAsset(asset: string, basePrice: number, currentPrice: number): Promise<SignalData | null>;
  calculatePercentageChange(basePrice: number, currentPrice: number): number;
  hasAlertedToday(asset: string): Promise<boolean>;
}

/**
 * AlertGenerator class
 * Handles evaluation of price changes and generation of trading signals
 * 
 * Validates: Requirements 3.1, 3.2, 4.1, 4.4, 8.1, 8.2, 8.3
 */
export class AlertGenerator implements IAlertGenerator {
  private priceTracker: IPriceTracker;
  private threshold: number;
  private logger: Logger;

  /**
   * Creates a new AlertGenerator instance
   * 
   * @param priceTracker - PriceTracker instance for signal persistence and queries
   * @param threshold - Price change threshold percentage (default: 1.5)
   */
  constructor(priceTracker: IPriceTracker, threshold: number = 1.5) {
    this.priceTracker = priceTracker;
    this.threshold = threshold;
    this.logger = new Logger('AlertGenerator');
  }

  /**
   * Calculates the percentage change between base price and current price
   * Formula: ((current - base) / base) * 100
   * 
   * Validates: Requirements 3.1, 3.2
   * 
   * @param basePrice - Base price at 11:30
   * @param currentPrice - Current market price
   * @returns Percentage change rounded to 2 decimal places
   */
  calculatePercentageChange(basePrice: number, currentPrice: number): number {
    const change = ((currentPrice - basePrice) / basePrice) * 100;
    return Math.round(change * 100) / 100; // Round to 2 decimal places
  }

  /**
   * Checks if an alert has already been generated today for the specified asset
   * 
   * Validates: Requirement 4.4
   * 
   * @param asset - Asset symbol to check
   * @returns true if alert was already generated today, false otherwise
   */
  async hasAlertedToday(asset: string): Promise<boolean> {
    return await this.priceTracker.hasSignalToday(asset);
  }

  /**
   * Evaluates an asset and creates a signal if conditions are met:
   * - Percentage change >= threshold
   * - No alert generated today for this asset
   * 
   * Validates: Requirements 3.1, 3.2, 4.1, 4.4, 8.1, 8.2, 8.3
   * 
   * @param asset - Asset symbol
   * @param basePrice - Base price at 11:30
   * @param currentPrice - Current market price
   * @returns Signal data if conditions are met, null otherwise
   */
  async evaluateAsset(
    asset: string,
    basePrice: number,
    currentPrice: number
  ): Promise<SignalData | null> {
    try {
      // Calculate percentage change
      const diff = this.calculatePercentageChange(basePrice, currentPrice);

      // Check if threshold is met
      if (diff < this.threshold) {
        this.logger.debug('Below threshold', asset, { 
          diff, 
          threshold: this.threshold 
        });
        return null;
      }

      // Check if already alerted today
      const alreadyAlerted = await this.hasAlertedToday(asset);
      if (alreadyAlerted) {
        this.logger.info('Already alerted today, skipping', asset);
        return null;
      }

      // Estimate Fintual price
      const lastFintualPrice = await this.priceTracker.getLastFintualPrice(asset);
      const fintualPrice = lastFintualPrice !== null 
        ? lastFintualPrice * (1 + diff / 100)  // Use last known price with percentage change
        : basePrice;  // Use base price if no previous Fintual price exists

      // Create signal
      const signal: SignalData = {
        asset,
        marketPrice: currentPrice,
        fintualPrice,
        diff,
        createAt: new Date()
      };

      this.logger.info('Signal created', asset, {
        marketPrice: currentPrice,
        fintualPrice,
        diff,
        basePrice
      });
      return signal;

    } catch (error) {
      this.logger.error('Error evaluating asset', asset, {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }
}

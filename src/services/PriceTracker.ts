/**
 * Price Tracker Service
 * Validates: Requirements 4.2, 9.2, 9.3, 9.5
 * 
 * Manages persistence and querying of trading signals.
 * Provides methods to save signals, query historical data, and check alert status.
 */

import { Model } from 'mongoose';
import { ISignal } from '../models/Signal';
import { retryWithBackoff, CategorizedError, ErrorCategory } from '../utils/errorHandling';

/**
 * Signal data interface for creating new signals
 * Excludes Mongoose Document properties
 */
export interface SignalData {
  asset: string;
  marketPrice: number;
  fintualPrice: number;
  diff: number;
  createAt?: Date;
}

/**
 * Interface for Price Tracker
 * Defines the contract for signal persistence and queries
 */
export interface IPriceTracker {
  saveSignal(signal: SignalData): Promise<void>;
  getSignalsByAsset(asset: string, date?: Date): Promise<ISignal[]>;
  getLastFintualPrice(asset: string): Promise<number | null>;
  hasSignalToday(asset: string): Promise<boolean>;
}

/**
 * PriceTracker class
 * Handles all database operations related to trading signals
 * 
 * Validates: Requirements 4.2, 9.2, 9.3, 9.5
 */
export class PriceTracker implements IPriceTracker {
  private signalModel: Model<ISignal>;

  /**
   * Creates a new PriceTracker instance
   * 
   * @param signalModel - Mongoose model for Signal documents
   */
  constructor(signalModel: Model<ISignal>) {
    this.signalModel = signalModel;
  }

  /**
   * Persists a trading signal to MongoDB
   * Uses retry logic with exponential backoff (up to 3 attempts)
   * 
   * Validates: Requirements 4.2, 9.2, 9.4
   * 
   * @param signal - Signal data to persist
   * @throws Error if persistence fails after all retries
   */
  async saveSignal(signal: SignalData): Promise<void> {
    try {
      await retryWithBackoff(async () => {
        const newSignal = new this.signalModel(signal);
        await newSignal.save();
      }, 3, 1000);
      
      console.log(`[PriceTracker] Signal saved for asset ${signal.asset}`);
    } catch (error) {
      console.error(`[PriceTracker] Failed to save signal for ${signal.asset} after retries:`, error);
      throw new CategorizedError(
        `Failed to save signal for ${signal.asset}`,
        ErrorCategory.DATABASE,
        signal.asset,
        error as Error
      );
    }
  }

  /**
   * Retrieves historical signals for a specific asset
   * Optionally filters by date (returns signals from that day)
   * Uses retry logic for database queries
   * 
   * Validates: Requirements 9.3, 9.4, 9.5
   * 
   * @param asset - Asset symbol to query
   * @param date - Optional date to filter signals (defaults to all time)
   * @returns Array of signals for the asset, sorted by date descending
   */
  async getSignalsByAsset(asset: string, date?: Date): Promise<ISignal[]> {
    try {
      return await retryWithBackoff(async () => {
        const query: any = { asset };

        // If date is provided, filter for signals on that specific day
        if (date) {
          const startOfDay = new Date(date);
          startOfDay.setHours(0, 0, 0, 0);
          
          const endOfDay = new Date(date);
          endOfDay.setHours(23, 59, 59, 999);

          query.createAt = {
            $gte: startOfDay,
            $lte: endOfDay
          };
        }

        const signals = await this.signalModel
          .find(query)
          .sort({ createAt: -1 })
          .exec();

        return signals;
      }, 3, 1000);
    } catch (error) {
      console.error(`[PriceTracker] Failed to get signals for ${asset} after retries:`, error);
      throw new CategorizedError(
        `Failed to get signals for ${asset}`,
        ErrorCategory.DATABASE,
        asset,
        error as Error
      );
    }
  }

  /**
   * Retrieves the last known Fintual price for an asset
   * Returns the fintualPrice from the most recent signal
   * Uses retry logic for database queries
   * 
   * Validates: Requirements 9.3, 9.4
   * 
   * @param asset - Asset symbol to query
   * @returns Last known Fintual price, or null if no signals exist
   */
  async getLastFintualPrice(asset: string): Promise<number | null> {
    try {
      return await retryWithBackoff(async () => {
        const lastSignal = await this.signalModel
          .findOne({ asset })
          .sort({ createAt: -1 })
          .exec();

        return lastSignal ? lastSignal.fintualPrice : null;
      }, 3, 1000);
    } catch (error) {
      console.error(`[PriceTracker] Failed to get last Fintual price for ${asset} after retries:`, error);
      throw new CategorizedError(
        `Failed to get last Fintual price for ${asset}`,
        ErrorCategory.DATABASE,
        asset,
        error as Error
      );
    }
  }

  /**
   * Checks if a signal has been generated today for the specified asset
   * Uses retry logic for database queries
   * 
   * Validates: Requirements 9.4, 9.5
   * 
   * @param asset - Asset symbol to check
   * @returns true if a signal exists for today, false otherwise
   */
  async hasSignalToday(asset: string): Promise<boolean> {
    try {
      return await retryWithBackoff(async () => {
        const today = new Date();
        const startOfDay = new Date(today);
        startOfDay.setHours(0, 0, 0, 0);
        
        const endOfDay = new Date(today);
        endOfDay.setHours(23, 59, 59, 999);

        const count = await this.signalModel
          .countDocuments({
            asset,
            createAt: {
              $gte: startOfDay,
              $lte: endOfDay
            }
          })
          .exec();

        return count > 0;
      }, 3, 1000);
    } catch (error) {
      console.error(`[PriceTracker] Failed to check if signal exists today for ${asset} after retries:`, error);
      throw new CategorizedError(
        `Failed to check if signal exists today for ${asset}`,
        ErrorCategory.DATABASE,
        asset,
        error as Error
      );
    }
  }
}

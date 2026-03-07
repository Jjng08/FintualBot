/**
 * Trading Bot Controller
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 3.3
 * 
 * Orchestrates the complete trading bot lifecycle.
 * Coordinates all components and manages the monitoring window.
 */

import { IAssetMonitor } from './AssetMonitor';
import { IAlertGenerator } from './AlertGenerator';
import { IPriceTracker } from './PriceTracker';
import { NotificationService } from './NotificationService';
import { IMarketAPIClient } from './MarketAPIClient';
import { BotStatus, IConfiguration } from '../types';
import { Logger } from './Logger';

/**
 * Interface for Trading Bot Controller
 * Defines the contract for bot orchestration
 */
export interface ITradingBotController {
  start(): Promise<void>;
  stop(): Promise<void>;
  getStatus(): BotStatus;
}

/**
 * TradingBotController class
 * Orchestrates all components and manages the monitoring lifecycle
 * 
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 3.3
 */
export class TradingBotController implements ITradingBotController {
  private assetMonitor: IAssetMonitor;
  private alertGenerator: IAlertGenerator;
  private priceTracker: IPriceTracker;
  private notificationService: NotificationService;
  private marketAPIClient: IMarketAPIClient;
  private config: IConfiguration;
  private logger: Logger;
  
  private isRunning: boolean = false;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private validatedAssets: string[] = [];
  private lastUpdate: Date = new Date();
  private priceUpdateCount: number = 0;
  private signalsGenerated: number = 0;

  /**
   * Creates a new TradingBotController instance
   * 
   * @param assetMonitor - Asset monitoring service
   * @param alertGenerator - Alert generation service
   * @param priceTracker - Price tracking and persistence service
   * @param notificationService - Notification service
   * @param marketAPIClient - Market API client for symbol validation
   * @param config - System configuration
   */
  constructor(
    assetMonitor: IAssetMonitor,
    alertGenerator: IAlertGenerator,
    priceTracker: IPriceTracker,
    notificationService: NotificationService,
    marketAPIClient: IMarketAPIClient,
    config: IConfiguration
  ) {
    this.assetMonitor = assetMonitor;
    this.alertGenerator = alertGenerator;
    this.priceTracker = priceTracker;
    this.notificationService = notificationService;
    this.marketAPIClient = marketAPIClient;
    this.config = config;
    this.logger = new Logger('TradingBotController');
  }

  /**
   * Starts the trading bot
   * Initializes components, validates configuration, and begins monitoring
   * 
   * Validates: Requirements 1.1, 1.2, 1.3, 1.4
   * 
   * @throws Error if configuration is invalid or initialization fails
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Bot is already running');
      return;
    }

    try {
      this.logger.info('Starting trading bot...');
      
      // Parse and validate Asset_List (Requirement 1.1, 1.2)
      const assetList = this.parseAssetList(this.config.assetList);
      this.logger.info(`Parsed ${assetList.length} assets from configuration`, undefined, { assetList });
      
      // Validate symbols and exclude invalid ones (Requirement 1.3, 1.4)
      this.validatedAssets = await this.validateAndFilterAssets(assetList);
      
      if (this.validatedAssets.length === 0) {
        throw new Error('No valid assets to monitor after validation');
      }
      
      this.logger.info(`Validated ${this.validatedAssets.length} assets`, undefined, { 
        validatedAssets: this.validatedAssets,
        assetList: this.validatedAssets.join(', ')
      });
      
      // Initialize base prices at 11:30 (Requirement 2.1)
      await this.initializeBasePrices();
      
      // Start monitoring loop (Requirement 2.2, 3.3)
      this.startMonitoringLoop();
      
      this.isRunning = true;
      this.logger.info('Trading bot started successfully', undefined, {
        assetList: this.validatedAssets,
        threshold: this.config.priceChangeThreshold,
        interval: this.config.monitoringInterval,
        startTime: this.config.startTime,
        endTime: this.config.endTime
      });
      
    } catch (error) {
      this.logger.error('Failed to start trading bot', undefined, { 
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      await this.notificationService.sendError(error as Error);
      throw error;
    }
  }

  /**
   * Stops the trading bot gracefully
   * Closes connections and cleans up resources
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      this.logger.warn('Bot is not running');
      return;
    }

    try {
      this.logger.info('Stopping trading bot...');
      
      // Stop monitoring loop
      if (this.monitoringInterval) {
        clearInterval(this.monitoringInterval);
        this.monitoringInterval = null;
      }
      
      // Send daily summary
      await this.sendDailySummary();
      
      this.isRunning = false;
      this.logger.info('Trading bot stopped successfully');
      
    } catch (error) {
      this.logger.error('Error stopping trading bot', undefined, {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }

  /**
   * Gets the current status of the bot
   * 
   * @returns Current bot status
   */
  getStatus(): BotStatus {
    return {
      isRunning: this.isRunning,
      currentWindow: this.isWithinMonitoringWindow(),
      assetsMonitored: this.validatedAssets,
      lastUpdate: this.lastUpdate
    };
  }

  /**
   * Parses Asset_List from configuration
   * Ensures each element is a trimmed, non-empty string
   * 
   * Validates: Requirement 1.2
   * 
   * @param assetList - Array of asset symbols from configuration
   * @returns Parsed and cleaned array of asset symbols
   */
  private parseAssetList(assetList: string[]): string[] {
    return assetList
      .map(symbol => symbol.trim())
      .filter(symbol => symbol.length > 0);
  }

  /**
   * Validates symbols and excludes invalid ones
   * Logs warnings for invalid symbols
   * 
   * Validates: Requirements 1.3, 1.4
   * 
   * @param assetList - Array of asset symbols to validate
   * @returns Array of valid asset symbols
   */
  private async validateAndFilterAssets(assetList: string[]): Promise<string[]> {
    const validAssets: string[] = [];
    
    this.logger.info('Validating asset symbols...');
    
    for (const asset of assetList) {
      try {
        const isValid = await this.marketAPIClient.validateSymbol(asset);
        
        if (isValid) {
          validAssets.push(asset);
          this.logger.info(`Asset validated`, asset);
        } else {
          this.logger.warn(`Asset is invalid - excluding from monitoring`, asset);
        }
      } catch (error) {
        this.logger.warn(`Asset validation failed - excluding from monitoring`, asset, {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    
    return validAssets;
  }

  /**
   * Initializes base prices for all validated assets at 11:30
   * 
   * Validates: Requirement 2.1
   */
  private async initializeBasePrices(): Promise<void> {
    this.logger.info('Initializing base prices at 11:30...');
    
    try {
      const basePrices = await this.assetMonitor.initializeBasePrices();
      
      // Log base prices for each asset
      basePrices.forEach((price, asset) => {
        this.logger.info('Base price captured', asset, { basePrice: price });
      });
      
      this.lastUpdate = new Date();
      
      this.logger.info(`Base prices initialized for ${basePrices.size} assets`);
      
    } catch (error) {
      this.logger.error('Failed to initialize base prices', undefined, {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }

  /**
   * Starts the monitoring loop
   * Updates prices and evaluates alerts every 5 minutes until 13:30
   * 
   * Validates: Requirements 2.2, 3.3
   */
  private startMonitoringLoop(): void {
    const intervalMs = this.config.monitoringInterval * 60 * 1000; // Convert minutes to milliseconds
    
    this.logger.info(`Starting monitoring loop`, undefined, { 
      intervalMinutes: this.config.monitoringInterval 
    });
    
    this.monitoringInterval = setInterval(async () => {
      // Check if still within monitoring window
      if (!this.isWithinMonitoringWindow()) {
        this.logger.info('Outside monitoring window, stopping...');
        await this.stop();
        return;
      }
      
      await this.updateAndEvaluate();
    }, intervalMs);
  }

  /**
   * Updates current prices and evaluates alert conditions for all assets
   * 
   * Validates: Requirements 2.2, 3.3
   */
  private async updateAndEvaluate(): Promise<void> {
    try {
      this.logger.debug('Updating prices and evaluating alerts...');
      
      // Update current prices for all assets (Requirement 2.2)
      const priceUpdates = await this.assetMonitor.updateCurrentPrices();
      this.priceUpdateCount += priceUpdates.size;
      this.lastUpdate = new Date();
      
      // Evaluate each asset for alert conditions (Requirement 3.3)
      for (const [asset, priceUpdate] of priceUpdates) {
        await this.evaluateAsset(asset, priceUpdate.price);
      }
      
      this.logger.debug(`Update cycle completed`, undefined, { 
        pricesUpdated: priceUpdates.size 
      });
      
    } catch (error) {
      this.logger.error('Error during update and evaluation', undefined, {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      // Don't throw - continue monitoring
    }
  }

  /**
   * Evaluates a single asset for alert conditions
   * 
   * @param asset - Asset symbol
   * @param currentPrice - Current market price
   */
  private async evaluateAsset(asset: string, currentPrice: number): Promise<void> {
    try {
      const basePrice = this.assetMonitor.getBasePrice(asset);
      
      if (basePrice === null) {
        this.logger.warn('No base price available, skipping evaluation', asset);
        return;
      }
      
      // Evaluate asset and create signal if conditions are met
      const signal = await this.alertGenerator.evaluateAsset(asset, basePrice, currentPrice);
      
      if (signal) {
        // Save signal to database
        await this.priceTracker.saveSignal(signal);
        
        // Send notification
        await this.notificationService.sendAlert(signal as any);
        
        this.signalsGenerated++;
        
        this.logger.info('Signal generated', asset, {
          asset: signal.asset,
          marketPrice: signal.marketPrice,
          fintualPrice: signal.fintualPrice,
          diff: signal.diff,
          createAt: signal.createAt
        });
      }
      
    } catch (error) {
      this.logger.error('Error evaluating asset', asset, {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      // Don't throw - continue with other assets
    }
  }

  /**
   * Checks if current time is within the monitoring window (11:30-13:30)
   * 
   * @returns true if within monitoring window, false otherwise
   */
  private isWithinMonitoringWindow(): boolean {
    const now = new Date();
    const currentTime = now.toLocaleTimeString('en-US', {
      timeZone: this.config.timezone,
      hour12: false,
      hour: '2-digit',
      minute: '2-digit'
    });
    
    return currentTime >= this.config.startTime && currentTime <= this.config.endTime;
  }

  /**
   * Sends daily summary at the end of the trading session
   */
  private async sendDailySummary(): Promise<void> {
    try {
      const signalsByAsset = new Map<string, number>();
      
      // Count signals per asset (simplified - in production would query database)
      // For now, we'll just report the total
      
      const summary = {
        date: new Date(),
        assetsMonitored: this.validatedAssets.length,
        priceUpdates: this.priceUpdateCount,
        signalsGenerated: this.signalsGenerated,
        signalsByAsset
      };
      
      await this.notificationService.sendDailySummary(summary);
      
      this.logger.info('Daily summary', undefined, summary);
      
    } catch (error) {
      this.logger.error('Error sending daily summary', undefined, {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
    }
  }
}

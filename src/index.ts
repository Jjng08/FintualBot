/**
 * Main Entry Point for VTI Gap Trading Alert System
 * Validates: Requirements 1.1, 6.1, 6.2, 6.3, 9.1, 11.2, 11.3
 * 
 * Wires all components together and manages the application lifecycle.
 * Handles graceful shutdown on system signals (SIGINT, SIGTERM).
 */

import { loadConfiguration, validateConfiguration } from './utils/config';
import { DatabaseService } from './services/DatabaseService';
import { MarketAPIClient } from './services/MarketAPIClient';
import { NotificationService } from './services/NotificationService';
import { PriceTracker } from './services/PriceTracker';
import { AlertGenerator } from './services/AlertGenerator';
import { AssetMonitor } from './services/AssetMonitor';
import { TradingBotController } from './services/TradingBotController';
import { TradingScheduler } from './services/TradingScheduler';
import { Logger } from './services/Logger';

// Create main logger
const logger = new Logger('Main');

/**
 * Main application entry point
 * Initializes all services and starts the trading bot scheduler
 */
async function main(): Promise<void> {
  try {
    logger.info('Starting VTI Gap Trading Alert System...');

    // Load configuration from .env (Requirement 11.2, 11.3)
    logger.info('Loading configuration...');
    const config = loadConfiguration();
    
    // Validate configuration (Requirement 11.6)
    validateConfiguration(config);
    logger.info('Configuration loaded and validated', undefined, {
      assetList: config.assetList,
      threshold: config.priceChangeThreshold,
      interval: config.monitoringInterval,
      timezone: config.timezone
    });

    // Instantiate DatabaseService and connect (Requirement 9.1)
    logger.info('Connecting to database...');
    const databaseService = new DatabaseService(config.mongoUri);
    await databaseService.connect();
    logger.info('Database connected successfully');

    // Instantiate MarketAPIClient with API keys
    logger.info('Initializing Market API Client...');
    const marketAPIClient = new MarketAPIClient(
      config.primaryApiKey,
      config.secondaryApiKey,
      config.fintualEmail,
      config.fintualPassword
    );
    logger.info('Market API Client initialized');

    // Instantiate NotificationService with Telegram token
    logger.info('Initializing Notification Service...');
    const notificationService = new NotificationService(
      config.telegramToken,
      config.telegramChatId
    );
    logger.info('Notification Service initialized');

    // Instantiate PriceTracker with DatabaseService
    logger.info('Initializing Price Tracker...');
    const signalModel = databaseService.getSignalModel();
    const priceTracker = new PriceTracker(signalModel);
    logger.info('Price Tracker initialized');

    // Instantiate AlertGenerator with PriceTracker and NotificationService
    logger.info('Initializing Alert Generator...');
    const alertGenerator = new AlertGenerator(
      priceTracker,
      config.priceChangeThreshold
    );
    logger.info('Alert Generator initialized');

    // Instantiate AssetMonitor with MarketAPIClient
    logger.info('Initializing Asset Monitor...');
    const assetMonitor = new AssetMonitor(
      marketAPIClient,
      config.assetList
    );
    logger.info('Asset Monitor initialized');

    // Instantiate TradingBotController with all components
    logger.info('Initializing Trading Bot Controller...');
    const tradingBotController = new TradingBotController(
      assetMonitor,
      alertGenerator,
      priceTracker,
      notificationService,
      marketAPIClient,
      config
    );
    logger.info('Trading Bot Controller initialized');

    // Configure scheduler with TradingBotController (Requirement 6.1, 6.2, 6.3)
    logger.info('Configuring scheduler...');
    const scheduler = new TradingScheduler(tradingBotController, config);
    
    // Start the scheduler
    scheduler.start();
    logger.info('Scheduler started - Bot will run Monday-Friday from 11:30 to 13:30 Chile time');

    // Handle system signals for graceful shutdown (SIGINT, SIGTERM)
    const shutdownHandler = async (signal: string) => {
      logger.info(`Received ${signal} signal, shutting down gracefully...`);
      
      try {
        // Stop the scheduler
        scheduler.stop();
        logger.info('Scheduler stopped');

        // Stop the bot if it's running
        const status = tradingBotController.getStatus();
        if (status.isRunning) {
          await tradingBotController.stop();
          logger.info('Trading Bot stopped');
        }

        // Disconnect from database
        await databaseService.disconnect();
        logger.info('Database disconnected');

        logger.info('Shutdown complete');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown', undefined, {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined
        });
        process.exit(1);
      }
    };

    // Register signal handlers
    process.on('SIGINT', () => shutdownHandler('SIGINT'));
    process.on('SIGTERM', () => shutdownHandler('SIGTERM'));

    logger.info('VTI Gap Trading Alert System started successfully');
    logger.info('Press Ctrl+C to stop');

  } catch (error) {
    logger.error('Failed to start application', undefined, {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    process.exit(1);
  }
}

// Start the application
main().catch((error) => {
  console.error('Unhandled error in main:', error);
  process.exit(1);
});

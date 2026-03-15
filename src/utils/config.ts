/**
 * Configuration Loader
 * Validates: Requirements 11.1, 11.2, 11.3, 11.4, 11.5, 11.6
 * 
 * Loads and validates system configuration from environment variables.
 * Applies default values and ensures all required configuration is present.
 */

import { IConfiguration } from '../types';
import { CategorizedError, ErrorCategory } from './errorHandling';
import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

/**
 * Loads configuration from environment variables with validation
 * 
 * @throws Error if required configuration is missing
 * @returns IConfiguration object with all system settings
 * 
 * Validates: Requirements 11.1, 11.2, 11.3, 11.4, 11.5, 11.6
 */
export function loadConfiguration(): IConfiguration {
  // Read Asset_List with default value "VTI" (Requirement 11.5)
  const assetListStr = process.env.ASSET_LIST || 'VTI';
  const assetList = assetListStr.split(',').map(s => s.trim()).filter(s => s.length > 0);
  
  // Read Price_Change_Threshold with default value 1.5 (Requirement 11.1)
  const priceChangeThreshold = parseFloat(process.env.PRICE_CHANGE_THRESHOLD || '1.5');
  
  // Read monitoring interval with default value 5 minutes (Requirement 11.4)
  const monitoringInterval = parseInt(process.env.MONITORING_INTERVAL || '5', 10);
  
  // Read time window settings with defaults
  const startTime = process.env.START_TIME || '11:30';
  const endTime = process.env.END_TIME || '13:30';
  const timezone = process.env.TIMEZONE || 'America/Santiago';
  
  // Read required MongoDB credentials (Requirement 11.2)
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    throw new CategorizedError(
      'MONGO_URI environment variable is required',
      ErrorCategory.CONFIGURATION
    );
  }
  
  // Read required Telegram credentials (Requirement 11.3)
  const telegramToken = process.env.TELEGRAM_TOKEN || process.env.TOKEN;
  if (!telegramToken) {
    throw new CategorizedError(
      'TELEGRAM_TOKEN or TOKEN environment variable is required',
      ErrorCategory.CONFIGURATION
    );
  }
  
  const telegramChatId = process.env.TELEGRAM_CHAT_ID;
  if (!telegramChatId) {
    throw new CategorizedError(
      'TELEGRAM_CHAT_ID environment variable is required',
      ErrorCategory.CONFIGURATION
    );
  }
  
  // Read required primary API key
  const primaryApiKey = process.env.PRIMARY_API_KEY;
  if (!primaryApiKey) {
    throw new CategorizedError(
      'PRIMARY_API_KEY environment variable is required',
      ErrorCategory.CONFIGURATION
    );
  }
  
  // Read optional secondary API key
  const secondaryApiKey = process.env.SECONDARY_API_KEY;

  // Read optional Fintual credentials
  const fintualEmail = process.env.FINTUAL_USER;
  const fintualPassword = process.env.FINTUAL_PASSWORD;
  
  // Validate numeric values
  if (isNaN(priceChangeThreshold) || priceChangeThreshold <= 0) {
    throw new CategorizedError(
      'PRICE_CHANGE_THRESHOLD must be a positive number',
      ErrorCategory.CONFIGURATION
    );
  }
  
  if (isNaN(monitoringInterval) || monitoringInterval <= 0) {
    throw new CategorizedError(
      'MONITORING_INTERVAL must be a positive number',
      ErrorCategory.CONFIGURATION
    );
  }
  
  // Validate time format (HH:mm)
  const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
  if (!timeRegex.test(startTime)) {
    throw new CategorizedError(
      'START_TIME must be in HH:mm format',
      ErrorCategory.CONFIGURATION
    );
  }
  
  if (!timeRegex.test(endTime)) {
    throw new CategorizedError(
      'END_TIME must be in HH:mm format',
      ErrorCategory.CONFIGURATION
    );
  }
  
  // Validate asset list is not empty
  if (assetList.length === 0) {
    throw new CategorizedError(
      'ASSET_LIST must contain at least one asset symbol',
      ErrorCategory.CONFIGURATION
    );
  }
  
  return {
    assetList,
    priceChangeThreshold,
    monitoringInterval,
    startTime,
    endTime,
    timezone,
    mongoUri,
    telegramToken,
    telegramChatId,
    primaryApiKey,
    secondaryApiKey,
    fintualEmail,
    fintualPassword
  };
}

/**
 * Validates that all required configuration is present
 * Logs error and throws if configuration is invalid
 * 
 * Validates: Requirement 11.6
 */
export function validateConfiguration(config: IConfiguration): void {
  const errors: string[] = [];
  
  // Validate required fields
  if (!config.mongoUri) {
    errors.push('MongoDB URI is required');
  }
  
  if (!config.telegramToken) {
    errors.push('Telegram token is required');
  }
  
  if (!config.telegramChatId) {
    errors.push('Telegram chat ID is required');
  }
  
  if (!config.primaryApiKey) {
    errors.push('Primary API key is required');
  }
  
  if (config.assetList.length === 0) {
    errors.push('Asset list must contain at least one symbol');
  }
  
  if (config.priceChangeThreshold <= 0) {
    errors.push('Price change threshold must be positive');
  }
  
  if (config.monitoringInterval <= 0) {
    errors.push('Monitoring interval must be positive');
  }
  
  // If there are errors, throw with all error messages
  if (errors.length > 0) {
    const errorMessage = 'Configuration validation failed:\n' + errors.map(e => `  - ${e}`).join('\n');
    throw new CategorizedError(
      errorMessage,
      ErrorCategory.CONFIGURATION
    );
  }
}

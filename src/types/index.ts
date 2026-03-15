/**
 * Configuration and Type Definitions for VTI Gap Trading Alert System
 * Validates: Requirements 1.1, 11.1, 11.4, 11.5
 */

/**
 * System configuration interface
 * Contains all configurable parameters loaded from environment variables
 */
export interface IConfiguration {
  /** List of asset symbols to monitor (e.g., ["VTI", "SPY", "QQQ"]) */
  assetList: string[];
  
  /** Price change threshold percentage that triggers an alert (default: 1.5) */
  priceChangeThreshold: number;
  
  /** Monitoring interval in minutes (default: 5) */
  monitoringInterval: number;
  
  /** Start time for monitoring in HH:mm format (default: "11:30") */
  startTime: string;
  
  /** End time for monitoring in HH:mm format (default: "13:30") */
  endTime: string;
  
  /** Timezone for all time calculations (default: "America/Santiago") */
  timezone: string;
  
  /** MongoDB connection URI */
  mongoUri: string;
  
  /** Telegram bot token for sending notifications */
  telegramToken: string;
  
  /** Telegram chat ID for receiving notifications */
  telegramChatId: string;
  
  /** Primary market data API key */
  primaryApiKey: string;
  
  /** Secondary market data API key (optional fallback) */
  secondaryApiKey?: string;

  /** Fintual account email for authentication */
  fintualEmail?: string;

  /** Fintual account password for authentication */
  fintualPassword?: string;
}

/**
 * In-memory price cache interface
 * Stores current session data for fast access during monitoring
 */
export interface IPriceCache {
  /** Base prices captured at 11:30 for each asset */
  basePrices: Map<string, number>;
  
  /** Current prices for each asset */
  currentPrices: Map<string, number>;
  
  /** Timestamp of last price update for each asset */
  lastUpdate: Map<string, Date>;
  
  /** Set of assets that have already generated an alert today */
  alertedToday: Set<string>;
}

/**
 * Market API response interface
 * Standardized response format from market data APIs
 */
export interface MarketAPIResponse {
  /** Asset symbol */
  symbol: string;
  
  /** Current price of the asset */
  price: number;
  
  /** Timestamp when the price was obtained */
  timestamp: Date;
  
  /** Source of the price data (e.g., "primary", "secondary") */
  source: string;
}

/**
 * Symbol validation response interface
 * Response format for validating asset symbols
 */
export interface SymbolValidationResponse {
  /** Asset symbol being validated */
  symbol: string;
  
  /** Whether the symbol is valid */
  isValid: boolean;
  
  /** Full name of the asset (optional) */
  name?: string;
  
  /** Exchange where the asset is traded (optional) */
  exchange?: string;
}

/**
 * Price update interface
 * Used by Asset Monitor to report price updates
 */
export interface PriceUpdate {
  /** Asset symbol */
  asset: string;
  
  /** Updated price */
  price: number;
  
  /** Timestamp of the update */
  timestamp: Date;
  
  /** Source of the price data */
  source: string;
}

/**
 * Bot status interface
 * Provides current state information about the trading bot
 */
export interface BotStatus {
  /** Whether the bot is currently running */
  isRunning: boolean;
  
  /** Whether currently within the monitoring window (11:30-13:30) */
  currentWindow: boolean;
  
  /** List of assets being monitored */
  assetsMonitored: string[];
  
  /** Timestamp of last price update */
  lastUpdate: Date;
}

/**
 * Daily summary interface
 * Summary statistics sent at the end of each trading session
 */
export interface DailySummary {
  /** Date of the trading session */
  date: Date;
  
  /** Number of assets monitored */
  assetsMonitored: number;
  
  /** Total number of price updates performed */
  priceUpdates: number;
  
  /** Total number of signals generated */
  signalsGenerated: number;
  
  /** Number of signals generated per asset */
  signalsByAsset: Map<string, number>;
}

/**
 * Log entry interface
 * Structured logging format for all system events
 */
export interface LogEntry {
  /** Timestamp of the log entry */
  timestamp: Date;
  
  /** Log level */
  level: 'ERROR' | 'WARN' | 'INFO' | 'DEBUG';
  
  /** Component that generated the log */
  component: string;
  
  /** Asset symbol (if applicable) */
  asset?: string;
  
  /** Log message */
  message: string;
  
  /** Additional metadata */
  metadata?: Record<string, any>;
}

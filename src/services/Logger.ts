/**
 * Structured Logging Service
 * Validates: Requirements 10.1, 10.2, 10.3, 10.4
 */

import { LogEntry } from '../types';

/**
 * Logger class providing structured logging with multiple levels
 * Logs are formatted consistently with timestamp, level, component, and context
 */
export class Logger {
  private component: string;

  constructor(component: string) {
    this.component = component;
  }

  /**
   * Log an error message
   * @param message - Error message
   * @param asset - Optional asset symbol
   * @param metadata - Optional additional context (e.g., stack trace, error details)
   */
  error(message: string, asset?: string, metadata?: Record<string, any>): void {
    this.log('ERROR', message, asset, metadata);
  }

  /**
   * Log a warning message
   * @param message - Warning message
   * @param asset - Optional asset symbol
   * @param metadata - Optional additional context
   */
  warn(message: string, asset?: string, metadata?: Record<string, any>): void {
    this.log('WARN', message, asset, metadata);
  }

  /**
   * Log an informational message
   * @param message - Info message
   * @param asset - Optional asset symbol
   * @param metadata - Optional additional context
   */
  info(message: string, asset?: string, metadata?: Record<string, any>): void {
    this.log('INFO', message, asset, metadata);
  }

  /**
   * Log a debug message
   * @param message - Debug message
   * @param asset - Optional asset symbol
   * @param metadata - Optional additional context
   */
  debug(message: string, asset?: string, metadata?: Record<string, any>): void {
    this.log('DEBUG', message, asset, metadata);
  }

  /**
   * Internal logging method that formats and outputs log entries
   * @param level - Log level
   * @param message - Log message
   * @param asset - Optional asset symbol
   * @param metadata - Optional additional context
   */
  private log(
    level: 'ERROR' | 'WARN' | 'INFO' | 'DEBUG',
    message: string,
    asset?: string,
    metadata?: Record<string, any>
  ): void {
    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      component: this.component,
      asset,
      message,
      metadata
    };

    // Format the log entry for console output
    const formattedMessage = this.formatLogEntry(entry);

    // Output to appropriate console method based on level
    switch (level) {
      case 'ERROR':
        console.error(formattedMessage);
        break;
      case 'WARN':
        console.warn(formattedMessage);
        break;
      case 'DEBUG':
        console.debug(formattedMessage);
        break;
      default:
        console.log(formattedMessage);
    }
  }

  /**
   * Format a log entry into a readable string
   * @param entry - Log entry to format
   * @returns Formatted log string
   */
  private formatLogEntry(entry: LogEntry): string {
    const timestamp = entry.timestamp.toISOString();
    const assetPart = entry.asset ? ` [${entry.asset}]` : '';
    const metadataPart = entry.metadata ? ` ${JSON.stringify(entry.metadata)}` : '';
    
    return `[${timestamp}] ${entry.level} [${entry.component}]${assetPart}: ${entry.message}${metadataPart}`;
  }

  /**
   * Create a child logger for a specific asset
   * Useful for logging multiple operations related to the same asset
   * @param asset - Asset symbol
   * @returns A logger instance that automatically includes the asset in all logs
   */
  withAsset(asset: string): AssetLogger {
    return new AssetLogger(asset, this);
  }
}

/**
 * Asset-specific logger that automatically includes asset symbol in all logs
 */
class AssetLogger {
  constructor(
    private asset: string,
    private parentLogger: Logger
  ) {}

  error(message: string, metadata?: Record<string, any>): void {
    this.parentLogger.error(message, this.asset, metadata);
  }

  warn(message: string, metadata?: Record<string, any>): void {
    this.parentLogger.warn(message, this.asset, metadata);
  }

  info(message: string, metadata?: Record<string, any>): void {
    this.parentLogger.info(message, this.asset, metadata);
  }

  debug(message: string, metadata?: Record<string, any>): void {
    this.parentLogger.debug(message, this.asset, metadata);
  }
}

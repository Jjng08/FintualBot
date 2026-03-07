/**
 * Database Service
 * Validates: Requirements 9.1, 9.4
 * 
 * Manages MongoDB connection with automatic retry logic.
 * Provides access to database models and ensures graceful connection handling.
 */

import mongoose, { Model } from 'mongoose';
import { Signal, ISignal } from '../models/Signal';

/**
 * Interface for Database Service
 * Defines the contract for database connection management
 */
export interface IDatabaseService {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  getSignalModel(): Model<ISignal>;
}

/**
 * DatabaseService class
 * Manages MongoDB connection lifecycle with retry logic
 * 
 * Validates: Requirements 9.1, 9.4
 */
export class DatabaseService implements IDatabaseService {
  private mongoUri: string;
  private retryInterval: number = 30000; // 30 seconds
  private retryTimer?: NodeJS.Timeout;
  private isConnecting: boolean = false;

  /**
   * Creates a new DatabaseService instance
   * 
   * @param mongoUri - MongoDB connection URI
   */
  constructor(mongoUri: string) {
    this.mongoUri = mongoUri;
    this.setupConnectionEventHandlers();
  }

  /**
   * Sets up event handlers for mongoose connection events
   */
  private setupConnectionEventHandlers(): void {
    mongoose.connection.on('connected', () => {
      console.log('[DatabaseService] Connected to MongoDB');
      this.isConnecting = false;
      if (this.retryTimer) {
        clearTimeout(this.retryTimer);
        this.retryTimer = undefined;
      }
    });

    mongoose.connection.on('error', (error) => {
      console.error('[DatabaseService] MongoDB connection error:', error);
    });

    mongoose.connection.on('disconnected', () => {
      console.log('[DatabaseService] Disconnected from MongoDB');
    });
  }

  /**
   * Connects to MongoDB with retry logic
   * If connection fails, retries every 30 seconds
   * 
   * Validates: Requirements 9.1, 9.4
   * 
   * @throws Error if already connecting
   */
  async connect(): Promise<void> {
    if (this.isConnected()) {
      console.log('[DatabaseService] Already connected to MongoDB');
      return;
    }

    if (this.isConnecting) {
      console.log('[DatabaseService] Connection attempt already in progress');
      return;
    }

    this.isConnecting = true;

    try {
      console.log('[DatabaseService] Attempting to connect to MongoDB...');
      await mongoose.connect(this.mongoUri);
      console.log('[DatabaseService] Successfully connected to MongoDB');
    } catch (error) {
      console.error('[DatabaseService] Failed to connect to MongoDB:', error);
      this.isConnecting = false;
      this.scheduleRetry();
      throw error;
    }
  }

  /**
   * Schedules a retry attempt after 30 seconds
   * 
   * Validates: Requirement 9.4
   */
  private scheduleRetry(): void {
    if (this.retryTimer) {
      return; // Retry already scheduled
    }

    console.log(`[DatabaseService] Will retry connection in ${this.retryInterval / 1000} seconds...`);
    
    this.retryTimer = setTimeout(async () => {
      this.retryTimer = undefined;
      console.log('[DatabaseService] Retrying connection...');
      try {
        await this.connect();
      } catch (error) {
        // Error already logged in connect(), retry will be scheduled again
      }
    }, this.retryInterval);
  }

  /**
   * Disconnects from MongoDB gracefully
   * Clears any pending retry timers
   * 
   * Validates: Requirement 9.1
   */
  async disconnect(): Promise<void> {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = undefined;
    }

    if (!this.isConnected()) {
      console.log('[DatabaseService] Not connected to MongoDB');
      return;
    }

    try {
      console.log('[DatabaseService] Disconnecting from MongoDB...');
      await mongoose.disconnect();
      console.log('[DatabaseService] Successfully disconnected from MongoDB');
    } catch (error) {
      console.error('[DatabaseService] Error during disconnect:', error);
      throw error;
    }
  }

  /**
   * Checks if currently connected to MongoDB
   * 
   * @returns true if connected, false otherwise
   */
  isConnected(): boolean {
    return mongoose.connection.readyState === 1; // 1 = connected
  }

  /**
   * Provides access to the Signal model
   * 
   * @returns Mongoose model for Signal
   * @throws Error if not connected to database
   */
  getSignalModel(): Model<ISignal> {
    if (!this.isConnected()) {
      throw new Error('Database is not connected. Call connect() first.');
    }
    return Signal;
  }
}

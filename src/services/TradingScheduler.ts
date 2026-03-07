/**
 * Trading Scheduler
 * Validates: Requirements 6.1, 6.2, 6.3, 6.4
 * 
 * Manages automated execution of the trading bot using cron jobs.
 * Schedules monitoring to run Monday-Friday from 11:30-13:30 Chile time.
 */

import * as cron from 'node-cron';
import * as moment from 'moment-timezone';
import { ITradingBotController } from './TradingBotController';
import { IConfiguration } from '../types';

/**
 * Interface for Trading Scheduler
 * Defines the contract for scheduling automated trading bot execution
 */
export interface ITradingScheduler {
  start(): void;
  stop(): void;
  isRunning(): boolean;
}

/**
 * TradingScheduler class
 * Manages cron-based scheduling for automated trading bot execution
 * 
 * Validates: Requirements 6.1, 6.2, 6.3, 6.4
 */
export class TradingScheduler implements ITradingScheduler {
  private botController: ITradingBotController;
  private config: IConfiguration;
  private startTask: cron.ScheduledTask | null = null;
  private stopTask: cron.ScheduledTask | null = null;
  private isSchedulerRunning: boolean = false;

  /**
   * Creates a new TradingScheduler instance
   * 
   * @param botController - Trading bot controller to schedule
   * @param config - System configuration with timezone and schedule settings
   */
  constructor(botController: ITradingBotController, config: IConfiguration) {
    this.botController = botController;
    this.config = config;
  }

  /**
   * Starts the scheduler
   * Sets up cron jobs for starting and stopping the bot at configured times
   * 
   * Validates: Requirements 6.1, 6.2, 6.3, 6.4
   */
  start(): void {
    if (this.isSchedulerRunning) {
      console.warn('[TradingScheduler] Scheduler is already running');
      return;
    }

    console.log('[TradingScheduler] Starting scheduler...');
    console.log(`[TradingScheduler] Timezone: ${this.config.timezone}`);
    console.log(`[TradingScheduler] Start time: ${this.config.startTime}`);
    console.log(`[TradingScheduler] End time: ${this.config.endTime}`);

    // Parse start and end times
    const [startHour, startMinute] = this.config.startTime.split(':').map(Number);
    const [endHour, endMinute] = this.config.endTime.split(':').map(Number);

    // Create cron expression for start time (Monday-Friday at 11:30)
    // Format: minute hour * * day-of-week
    // Requirement 6.1: Execute Monday to Friday (1-5)
    // Requirement 6.2: Start monitoring at 11:30 America/Santiago
    const startCronExpression = `${startMinute} ${startHour} * * 1-5`;
    
    // Create cron expression for stop time (Monday-Friday at 13:30)
    // Requirement 6.3: Stop monitoring at 13:30 America/Santiago
    const stopCronExpression = `${endMinute} ${endHour} * * 1-5`;

    console.log(`[TradingScheduler] Start cron: ${startCronExpression}`);
    console.log(`[TradingScheduler] Stop cron: ${stopCronExpression}`);

    // Schedule start task
    // Requirement 6.4: Use America/Santiago timezone for all time calculations
    this.startTask = cron.schedule(
      startCronExpression,
      async () => {
        const now = moment.tz(this.config.timezone);
        console.log(`[TradingScheduler] Starting bot at ${now.format('YYYY-MM-DD HH:mm:ss z')}`);
        
        try {
          await this.botController.start();
          console.log('[TradingScheduler] Bot started successfully');
        } catch (error) {
          console.error('[TradingScheduler] Failed to start bot:', error);
        }
      },
      {
        timezone: this.config.timezone
      }
    );

    // Schedule stop task
    this.stopTask = cron.schedule(
      stopCronExpression,
      async () => {
        const now = moment.tz(this.config.timezone);
        console.log(`[TradingScheduler] Stopping bot at ${now.format('YYYY-MM-DD HH:mm:ss z')}`);
        
        try {
          await this.botController.stop();
          console.log('[TradingScheduler] Bot stopped successfully');
        } catch (error) {
          console.error('[TradingScheduler] Failed to stop bot:', error);
        }
      },
      {
        timezone: this.config.timezone
      }
    );

    this.isSchedulerRunning = true;
    console.log('[TradingScheduler] Scheduler started successfully');
    console.log('[TradingScheduler] Bot will run Monday-Friday from 11:30 to 13:30 Chile time');
  }

  /**
   * Stops the scheduler
   * Cancels all scheduled cron jobs
   */
  stop(): void {
    if (!this.isSchedulerRunning) {
      console.warn('[TradingScheduler] Scheduler is not running');
      return;
    }

    console.log('[TradingScheduler] Stopping scheduler...');

    if (this.startTask) {
      this.startTask.stop();
      this.startTask = null;
    }

    if (this.stopTask) {
      this.stopTask.stop();
      this.stopTask = null;
    }

    this.isSchedulerRunning = false;
    console.log('[TradingScheduler] Scheduler stopped successfully');
  }

  /**
   * Checks if the scheduler is currently running
   * 
   * @returns true if scheduler is running, false otherwise
   */
  isRunning(): boolean {
    return this.isSchedulerRunning;
  }

  /**
   * Gets the cron expression for the start schedule
   * Useful for testing and verification
   * 
   * @returns Cron expression string for start time
   */
  getStartCronExpression(): string {
    const [startHour, startMinute] = this.config.startTime.split(':').map(Number);
    return `${startMinute} ${startHour} * * 1-5`;
  }

  /**
   * Gets the cron expression for the stop schedule
   * Useful for testing and verification
   * 
   * @returns Cron expression string for stop time
   */
  getStopCronExpression(): string {
    const [endHour, endMinute] = this.config.endTime.split(':').map(Number);
    return `${endMinute} ${endHour} * * 1-5`;
  }

  /**
   * Checks if the current time is within the monitoring window
   * Uses moment-timezone for accurate timezone handling
   * 
   * @returns true if within monitoring window, false otherwise
   */
  isWithinMonitoringWindow(): boolean {
    const now = moment.tz(this.config.timezone);
    const currentTime = now.format('HH:mm');
    
    return currentTime >= this.config.startTime && currentTime <= this.config.endTime;
  }
}

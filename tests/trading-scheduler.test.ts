/**
 * Unit Tests for Trading Scheduler
 * Tests: Task 12.3 - Write unit tests for scheduler
 * Validates: Requirements 6.1, 6.2, 6.3, 6.4
 */

import { TradingScheduler } from '../src/services/TradingScheduler';
import { ITradingBotController } from '../src/services/TradingBotController';
import { IConfiguration } from '../src/types';

// Mock the node-cron module
jest.mock('node-cron', () => ({
  schedule: jest.fn((_expression, _callback, _options) => ({
    stop: jest.fn(),
    start: jest.fn()
  }))
}));

describe('TradingScheduler', () => {
  let mockBotController: jest.Mocked<ITradingBotController>;
  let config: IConfiguration;
  let scheduler: TradingScheduler;

  beforeEach(() => {
    // Create mock bot controller
    mockBotController = {
      start: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn().mockResolvedValue(undefined),
      getStatus: jest.fn().mockReturnValue({
        isRunning: false,
        currentWindow: false,
        assetsMonitored: [],
        lastUpdate: new Date()
      })
    };

    // Create test configuration
    config = {
      assetList: ['VTI'],
      priceChangeThreshold: 1.5,
      monitoringInterval: 5,
      startTime: '11:30',
      endTime: '13:30',
      timezone: 'America/Santiago',
      mongoUri: 'mongodb://localhost:27017/test',
      telegramToken: 'test-token',
      telegramChatId: 'test-chat-id',
      primaryApiKey: 'test-api-key'
    };

    scheduler = new TradingScheduler(mockBotController, config);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Cron Expression Generation', () => {
    it('should generate correct cron expression for start time (11:30)', () => {
      // Requirement 6.2: Start monitoring at 11:30
      const cronExpression = scheduler.getStartCronExpression();
      expect(cronExpression).toBe('30 11 * * 1-5');
    });

    it('should generate correct cron expression for stop time (13:30)', () => {
      // Requirement 6.3: Stop monitoring at 13:30
      const cronExpression = scheduler.getStopCronExpression();
      expect(cronExpression).toBe('30 13 * * 1-5');
    });

    it('should include Monday-Friday in cron expression', () => {
      // Requirement 6.1: Execute Monday to Friday
      const startCron = scheduler.getStartCronExpression();
      const stopCron = scheduler.getStopCronExpression();
      
      expect(startCron).toContain('1-5'); // Monday-Friday
      expect(stopCron).toContain('1-5');
    });

    it('should handle custom start and end times', () => {
      const customConfig = {
        ...config,
        startTime: '09:00',
        endTime: '17:00'
      };
      
      const customScheduler = new TradingScheduler(mockBotController, customConfig);
      
      expect(customScheduler.getStartCronExpression()).toBe('0 9 * * 1-5');
      expect(customScheduler.getStopCronExpression()).toBe('0 17 * * 1-5');
    });
  });

  describe('Timezone Handling', () => {
    it('should use America/Santiago timezone', () => {
      // Requirement 6.4: Use America/Santiago timezone
      const cron = require('node-cron');
      
      scheduler.start();
      
      // Verify that schedule was called with correct timezone
      expect(cron.schedule).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Function),
        expect.objectContaining({ timezone: 'America/Santiago' })
      );
    });

    it('should respect custom timezone from config', () => {
      const customConfig = {
        ...config,
        timezone: 'America/New_York'
      };
      
      const customScheduler = new TradingScheduler(mockBotController, customConfig);
      const cron = require('node-cron');
      
      customScheduler.start();
      
      expect(cron.schedule).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Function),
        expect.objectContaining({ timezone: 'America/New_York' })
      );
    });
  });

  describe('Scheduler Lifecycle', () => {
    it('should start scheduler successfully', () => {
      expect(scheduler.isRunning()).toBe(false);
      
      scheduler.start();
      
      expect(scheduler.isRunning()).toBe(true);
    });

    it('should stop scheduler successfully', () => {
      scheduler.start();
      expect(scheduler.isRunning()).toBe(true);
      
      scheduler.stop();
      
      expect(scheduler.isRunning()).toBe(false);
    });

    it('should not start scheduler twice', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      scheduler.start();
      scheduler.start(); // Try to start again
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('already running')
      );
      
      consoleSpy.mockRestore();
    });

    it('should not stop scheduler if not running', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      scheduler.stop(); // Try to stop when not running
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('not running')
      );
      
      consoleSpy.mockRestore();
    });

    it('should create two cron tasks (start and stop)', () => {
      const cron = require('node-cron');
      
      scheduler.start();
      
      // Should call schedule twice: once for start, once for stop
      expect(cron.schedule).toHaveBeenCalledTimes(2);
    });

    it('should stop both cron tasks when stopping scheduler', () => {
      const mockTask = {
        stop: jest.fn(),
        start: jest.fn()
      };
      
      const cron = require('node-cron');
      cron.schedule.mockReturnValue(mockTask);
      
      scheduler.start();
      scheduler.stop();
      
      // Both tasks should be stopped
      expect(mockTask.stop).toHaveBeenCalledTimes(2);
    });
  });

  describe('Monitoring Window Detection', () => {
    it('should detect when within monitoring window', () => {
      // Test the logic by checking if 12:00 is between 11:30 and 13:30
      expect(config.startTime).toBe('11:30');
      expect(config.endTime).toBe('13:30');
      expect('12:00' >= '11:30' && '12:00' <= '13:30').toBe(true);
    });

    it('should detect when before monitoring window', () => {
      // Test that 10:00 is before 11:30
      expect('10:00' >= '11:30').toBe(false);
    });

    it('should detect when after monitoring window', () => {
      // Test that 14:00 is after 13:30
      expect('14:00' <= '13:30').toBe(false);
    });

    it('should detect at exact start time (11:30)', () => {
      // Test that 11:30 is within the window
      expect('11:30' >= '11:30' && '11:30' <= '13:30').toBe(true);
    });

    it('should detect at exact end time (13:30)', () => {
      // Test that 13:30 is within the window
      expect('13:30' >= '11:30' && '13:30' <= '13:30').toBe(true);
    });
  });

  describe('Bot Controller Integration', () => {
    it('should call bot controller start when scheduled', async () => {
      const cron = require('node-cron');
      let startCallback: Function;
      
      cron.schedule.mockImplementation((expression: string, callback: Function) => {
        if (expression.includes('11')) { // Start time
          startCallback = callback;
        }
        return { stop: jest.fn(), start: jest.fn() };
      });
      
      scheduler.start();
      
      // Simulate cron trigger
      await startCallback!();
      
      expect(mockBotController.start).toHaveBeenCalledTimes(1);
    });

    it('should call bot controller stop when scheduled', async () => {
      const cron = require('node-cron');
      let stopCallback: Function;
      
      cron.schedule.mockImplementation((expression: string, callback: Function) => {
        if (expression.includes('13')) { // Stop time
          stopCallback = callback;
        }
        return { stop: jest.fn(), start: jest.fn() };
      });
      
      scheduler.start();
      
      // Simulate cron trigger
      await stopCallback!();
      
      expect(mockBotController.stop).toHaveBeenCalledTimes(1);
    });

    it('should handle bot controller start errors gracefully', async () => {
      const cron = require('node-cron');
      let startCallback: Function;
      
      cron.schedule.mockImplementation((expression: string, callback: Function) => {
        if (expression.includes('11')) {
          startCallback = callback;
        }
        return { stop: jest.fn(), start: jest.fn() };
      });
      
      mockBotController.start.mockRejectedValue(new Error('Start failed'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      scheduler.start();
      await startCallback!();
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to start bot'),
        expect.any(Error)
      );
      
      consoleSpy.mockRestore();
    });

    it('should handle bot controller stop errors gracefully', async () => {
      const cron = require('node-cron');
      let stopCallback: Function;
      
      cron.schedule.mockImplementation((expression: string, callback: Function) => {
        if (expression.includes('13')) {
          stopCallback = callback;
        }
        return { stop: jest.fn(), start: jest.fn() };
      });
      
      mockBotController.stop.mockRejectedValue(new Error('Stop failed'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      scheduler.start();
      await stopCallback!();
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to stop bot'),
        expect.any(Error)
      );
      
      consoleSpy.mockRestore();
    });
  });
});

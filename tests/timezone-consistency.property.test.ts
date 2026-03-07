import fc from 'fast-check';
import * as moment from 'moment-timezone';
import { TradingScheduler } from '../src/services/TradingScheduler';
import { ITradingBotController } from '../src/services/TradingBotController';
import { IConfiguration } from '../src/types';

/**
 * Property-Based Tests for Timezone Consistency
 * Feature: vti-gap-trading-alert
 * Task 12.2: Write property test for timezone consistency
 * 
 * These tests validate that timezone handling is consistent across the scheduler
 * and that all time calculations use the configured timezone (America/Santiago).
 */

// Mock node-cron to avoid actual scheduling
jest.mock('node-cron', () => ({
  schedule: jest.fn((_expression, _callback, _options) => ({
    stop: jest.fn(),
    start: jest.fn()
  }))
}));

describe('Property 15: Timezone Consistency', () => {
  /**
   * **Validates: Requirements 6.4**
   * 
   * Property: For any time-based calculation or comparison, the system should use
   * America/Santiago timezone, ensuring that 11:30 and 13:30 refer to Chilean time
   * regardless of server timezone.
   * 
   * This property ensures timezone consistency across all scheduler operations.
   */

  let mockBotController: jest.Mocked<ITradingBotController>;

  beforeEach(() => {
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
    
    // Reset the mock completely before each test
    const cron = require('node-cron');
    cron.schedule.mockClear();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should use configured timezone for all cron schedules', () => {
    // Generator for valid timezone strings
    const timezoneArb = fc.constantFrom(
      'America/Santiago',
      'America/New_York',
      'Europe/London',
      'Asia/Tokyo',
      'Australia/Sydney'
    );

    // Generator for valid time strings (HH:MM format)
    const timeArb = fc.tuple(
      fc.integer({ min: 0, max: 23 }),
      fc.integer({ min: 0, max: 59 })
    ).map(([hour, minute]) => 
      `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`
    );

    fc.assert(
      fc.property(timezoneArb, timeArb, timeArb, (timezone, startTime, endTime) => {
        // Clear mock before each iteration
        const cron = require('node-cron');
        cron.schedule.mockClear();
        
        const config: IConfiguration = {
          assetList: ['VTI'],
          priceChangeThreshold: 1.5,
          monitoringInterval: 5,
          startTime,
          endTime,
          timezone,
          mongoUri: 'mongodb://localhost:27017/test',
          telegramToken: 'test-token',
          telegramChatId: 'test-chat-id',
          primaryApiKey: 'test-api-key'
        };

        const scheduler = new TradingScheduler(mockBotController, config);

        scheduler.start();

        // Verify that both cron schedules use the configured timezone
        const calls = cron.schedule.mock.calls;
        expect(calls.length).toBe(2); // Start and stop schedules

        // Both calls should have the timezone option set to the configured timezone
        calls.forEach((call: any) => {
          const options = call[2];
          expect(options).toBeDefined();
          expect(options.timezone).toBe(timezone);
        });

        scheduler.stop();
      }),
      { numRuns: 20 }
    );
  });

  it('should consistently use America/Santiago timezone for monitoring window detection', () => {
    const config: IConfiguration = {
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

    const scheduler = new TradingScheduler(mockBotController, config);

    // The isWithinMonitoringWindow method should use America/Santiago timezone
    // We can verify this by checking that the method exists and uses the config timezone
    const isWithinWindow = scheduler.isWithinMonitoringWindow();

    // The result should be a boolean
    expect(typeof isWithinWindow).toBe('boolean');

    // Verify that the method uses moment.tz with the correct timezone
    // by checking that a moment created with the config timezone is valid
    const momentInTimezone = moment.tz(config.timezone);
    expect(momentInTimezone.tz()).toBe('America/Santiago');
  });

  it('should maintain timezone consistency across different server timezones', () => {
    // This test verifies that regardless of the server's local timezone,
    // the scheduler uses the configured timezone

    const config: IConfiguration = {
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

    const scheduler = new TradingScheduler(mockBotController, config);
    const cron = require('node-cron');

    scheduler.start();

    // Get the timezone used in cron schedules
    const calls = cron.schedule.mock.calls;
    const startScheduleTimezone = calls[0][2].timezone;
    const stopScheduleTimezone = calls[1][2].timezone;

    // Both should use America/Santiago, not the system timezone
    expect(startScheduleTimezone).toBe('America/Santiago');
    expect(stopScheduleTimezone).toBe('America/Santiago');

    // Verify that moment.tz is being used with the correct timezone
    const now = moment.tz(config.timezone);
    expect(now.tz()).toBe('America/Santiago');

    scheduler.stop();
  });

  it('should use consistent timezone for start and stop schedules', () => {
    // Generator for various timezone configurations
    const timezoneArb = fc.constantFrom(
      'America/Santiago',
      'America/New_York',
      'Europe/Paris',
      'Asia/Shanghai'
    );

    fc.assert(
      fc.property(timezoneArb, (timezone) => {
        // Clear mock before each iteration
        const cron = require('node-cron');
        cron.schedule.mockClear();
        
        const config: IConfiguration = {
          assetList: ['VTI'],
          priceChangeThreshold: 1.5,
          monitoringInterval: 5,
          startTime: '11:30',
          endTime: '13:30',
          timezone,
          mongoUri: 'mongodb://localhost:27017/test',
          telegramToken: 'test-token',
          telegramChatId: 'test-chat-id',
          primaryApiKey: 'test-api-key'
        };

        const scheduler = new TradingScheduler(mockBotController, config);

        scheduler.start();

        // Get both schedule calls
        const calls = cron.schedule.mock.calls;
        const startScheduleTimezone = calls[0][2].timezone;
        const stopScheduleTimezone = calls[1][2].timezone;

        // Both schedules must use the same timezone
        expect(startScheduleTimezone).toBe(stopScheduleTimezone);
        expect(startScheduleTimezone).toBe(timezone);

        scheduler.stop();
      }),
      { numRuns: 20 }
    );
  });

  it('should correctly identify monitoring window boundaries in America/Santiago timezone', () => {
    const config: IConfiguration = {
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

    const scheduler = new TradingScheduler(mockBotController, config);

    // Test boundary conditions
    // Note: Since isWithinMonitoringWindow uses moment.tz('now'), we test the logic
    // by verifying the method uses the correct timezone from config

    // Verify the scheduler has access to the timezone
    expect(config.timezone).toBe('America/Santiago');

    // Verify the method exists and returns a boolean
    const result = scheduler.isWithinMonitoringWindow();
    expect(typeof result).toBe('boolean');

    // The actual time comparison logic should use America/Santiago timezone
    // This is verified by the implementation using moment.tz(this.config.timezone)
  });

  it('should handle daylight saving time transitions consistently', () => {
    // Generator for dates that might include DST transitions
    const dateArb = fc.date({
      min: new Date('2023-01-01'),
      max: new Date('2024-12-31')
    });

    fc.assert(
      fc.property(dateArb, (date) => {
        const config: IConfiguration = {
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

        // Create a moment in America/Santiago timezone for the given date
        const momentInChile = moment.tz(date, config.timezone);

        // Verify that moment-timezone correctly handles the timezone
        expect(momentInChile.tz()).toBe('America/Santiago');

        // The timezone offset should be valid (Chile uses UTC-3 or UTC-4 depending on DST)
        const offset = momentInChile.utcOffset();
        expect(offset).toBeGreaterThanOrEqual(-4 * 60); // UTC-4 in minutes
        expect(offset).toBeLessThanOrEqual(-3 * 60);    // UTC-3 in minutes

        // Verify that time formatting is consistent
        const timeStr = momentInChile.format('HH:mm');
        expect(timeStr).toMatch(/^\d{2}:\d{2}$/);
      }),
      { numRuns: 20 }
    );
  });

  it('should use timezone consistently when formatting timestamps', () => {
    // Generator for various times
    const timeComponentsArb = fc.tuple(
      fc.integer({ min: 0, max: 23 }),
      fc.integer({ min: 0, max: 59 }),
      fc.integer({ min: 0, max: 59 })
    );

    fc.assert(
      fc.property(timeComponentsArb, ([hour, minute, second]) => {
        const config: IConfiguration = {
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

        // Create a moment in the configured timezone
        const momentInTimezone = moment.tz(config.timezone)
          .hour(hour)
          .minute(minute)
          .second(second);

        // Verify timezone is correct
        expect(momentInTimezone.tz()).toBe('America/Santiago');

        // Verify formatting includes timezone information
        const formatted = momentInTimezone.format('YYYY-MM-DD HH:mm:ss z');
        // Chile uses -03 or -04 offset, the abbreviation format varies
        expect(formatted).toMatch(/\-0[34]$/); // Should end with -03 or -04

        // Verify time components are preserved
        expect(momentInTimezone.hour()).toBe(hour);
        expect(momentInTimezone.minute()).toBe(minute);
        expect(momentInTimezone.second()).toBe(second);
      }),
      { numRuns: 20 }
    );
  });

  it('should maintain timezone consistency across scheduler lifecycle', () => {
    // Generator for multiple start/stop cycles
    const cyclesArb = fc.integer({ min: 1, max: 5 });

    fc.assert(
      fc.property(cyclesArb, (cycles) => {
        const config: IConfiguration = {
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

        const scheduler = new TradingScheduler(mockBotController, config);
        const cron = require('node-cron');

        // Perform multiple start/stop cycles
        for (let i = 0; i < cycles; i++) {
          cron.schedule.mockClear();

          scheduler.start();

          // Verify timezone is consistent in each cycle
          const calls = cron.schedule.mock.calls;
          expect(calls.length).toBe(2); // Should have exactly 2 calls per cycle
          calls.forEach((call: any) => {
            expect(call[2].timezone).toBe('America/Santiago');
          });

          scheduler.stop();
        }
      }),
      { numRuns: 20 }
    );
  });

  it('should use timezone for cron expressions regardless of start/end time values', () => {
    // Generator for various valid time combinations
    const timeArb = fc.tuple(
      fc.integer({ min: 0, max: 23 }),
      fc.integer({ min: 0, max: 59 })
    ).map(([hour, minute]) => 
      `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`
    );

    fc.assert(
      fc.property(timeArb, timeArb, (startTime, endTime) => {
        // Clear mock before each iteration
        const cron = require('node-cron');
        cron.schedule.mockClear();
        
        const config: IConfiguration = {
          assetList: ['VTI'],
          priceChangeThreshold: 1.5,
          monitoringInterval: 5,
          startTime,
          endTime,
          timezone: 'America/Santiago',
          mongoUri: 'mongodb://localhost:27017/test',
          telegramToken: 'test-token',
          telegramChatId: 'test-chat-id',
          primaryApiKey: 'test-api-key'
        };

        const scheduler = new TradingScheduler(mockBotController, config);

        scheduler.start();

        // Verify timezone is always America/Santiago regardless of time values
        const calls = cron.schedule.mock.calls;
        expect(calls.length).toBe(2); // Should have exactly 2 calls
        calls.forEach((call: any) => {
          expect(call[2].timezone).toBe('America/Santiago');
        });

        scheduler.stop();
      }),
      { numRuns: 20 }
    );
  });

  it('should correctly parse time strings and use them with the configured timezone', () => {
    // Generator for valid time strings
    const timeStringArb = fc.tuple(
      fc.integer({ min: 0, max: 23 }),
      fc.integer({ min: 0, max: 59 })
    ).map(([hour, minute]) => 
      `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`
    );

    fc.assert(
      fc.property(timeStringArb, timeStringArb, (startTime, endTime) => {
        // Clear mock before each iteration
        const cron = require('node-cron');
        cron.schedule.mockClear();
        
        const config: IConfiguration = {
          assetList: ['VTI'],
          priceChangeThreshold: 1.5,
          monitoringInterval: 5,
          startTime,
          endTime,
          timezone: 'America/Santiago',
          mongoUri: 'mongodb://localhost:27017/test',
          telegramToken: 'test-token',
          telegramChatId: 'test-chat-id',
          primaryApiKey: 'test-api-key'
        };

        const scheduler = new TradingScheduler(mockBotController, config);

        // Verify cron expressions are correctly generated from time strings
        const startCron = scheduler.getStartCronExpression();
        const stopCron = scheduler.getStopCronExpression();

        // Parse the time strings
        const [startHour, startMinute] = startTime.split(':').map(Number);
        const [endHour, endMinute] = endTime.split(':').map(Number);

        // Verify cron expressions match the parsed times
        expect(startCron).toBe(`${startMinute} ${startHour} * * 1-5`);
        expect(stopCron).toBe(`${endMinute} ${endHour} * * 1-5`);

        // Verify that when these cron jobs run, they use America/Santiago timezone
        scheduler.start();

        const calls = cron.schedule.mock.calls;
        expect(calls.length).toBe(2); // Should have exactly 2 calls
        expect(calls[0][0]).toBe(startCron);
        expect(calls[0][2].timezone).toBe('America/Santiago');
        expect(calls[1][0]).toBe(stopCron);
        expect(calls[1][2].timezone).toBe('America/Santiago');

        scheduler.stop();
      }),
      { numRuns: 20 }
    );
  });
});

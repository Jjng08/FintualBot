import fc from 'fast-check';
import { DatabaseService } from '../src/services/DatabaseService';
import mongoose from 'mongoose';

/**
 * Property-Based Tests for Database Service
 * Feature: vti-gap-trading-alert
 * Task 3.2: Write property test for database retry
 * 
 * These tests validate universal properties that should hold true
 * for database connection retry behavior.
 */

describe('Property 21: Database Retry on Connection Failure', () => {
  let originalConnect: typeof mongoose.connect;
  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    // Store original mongoose.connect
    originalConnect = mongoose.connect;
    
    // Spy on console methods to verify logging
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    
    // Ensure mongoose is disconnected before each test
    if (mongoose.connection.readyState !== 0) {
      mongoose.connection.close();
    }
  });

  afterEach(async () => {
    // Restore original mongoose.connect
    mongoose.connect = originalConnect;
    
    // Restore console methods
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    
    // Clean up any connections
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
    }
    
    // Clear all timers
    jest.clearAllTimers();
  });

  /**
   * **Validates: Requirements 9.4**
   * 
   * Property: For any database connection failure, the system should log the error
   * and attempt to reconnect every 30 seconds until successful.
   * 
   * This property ensures robust error handling and automatic recovery from
   * database connection failures.
   */
  it('should log error and schedule retry every 30 seconds on connection failure', async () => {
    jest.useFakeTimers();

    // Generator for invalid MongoDB URIs that will cause connection failures
    const invalidMongoUriArb = fc.constantFrom(
      'mongodb://invalid-host:27017/test',
      'mongodb://localhost:99999/test',
      'mongodb://nonexistent.host/test',
      'invalid-uri-format'
    );

    // Generator for number of retry attempts to test (1-5)
    const retryAttemptsArb = fc.integer({ min: 1, max: 5 });

    await fc.assert(
      fc.asyncProperty(
        invalidMongoUriArb,
        retryAttemptsArb,
        async (invalidUri, retryAttempts) => {
          // Reset spies for this iteration
          consoleLogSpy.mockClear();
          consoleErrorSpy.mockClear();

          // Mock mongoose.connect to always fail
          let connectCallCount = 0;
          mongoose.connect = jest.fn().mockImplementation(() => {
            connectCallCount++;
            return Promise.reject(new Error('Connection failed'));
          });

          const dbService = new DatabaseService(invalidUri);

          // Attempt initial connection (should fail)
          try {
            await dbService.connect();
          } catch (error) {
            // Expected to throw
          }

          // Verify error was logged
          expect(consoleErrorSpy).toHaveBeenCalledWith(
            expect.stringContaining('[DatabaseService] Failed to connect to MongoDB'),
            expect.any(Error)
          );

          // Verify retry message was logged
          expect(consoleLogSpy).toHaveBeenCalledWith(
            expect.stringContaining('Will retry connection in 30 seconds')
          );

          // Initial connection attempt
          expect(connectCallCount).toBe(1);

          // Simulate retry attempts by advancing timers
          for (let i = 0; i < retryAttempts; i++) {
            // Clear previous logs
            consoleLogSpy.mockClear();
            consoleErrorSpy.mockClear();

            // Advance timer by 30 seconds
            jest.advanceTimersByTime(30000);

            // Wait for any pending promises
            await Promise.resolve();

            // Verify retry was logged
            expect(consoleLogSpy).toHaveBeenCalledWith(
              expect.stringContaining('[DatabaseService] Retrying connection')
            );

            // Verify error was logged again
            expect(consoleErrorSpy).toHaveBeenCalledWith(
              expect.stringContaining('[DatabaseService] Failed to connect to MongoDB'),
              expect.any(Error)
            );

            // Verify another retry was scheduled
            expect(consoleLogSpy).toHaveBeenCalledWith(
              expect.stringContaining('Will retry connection in 30 seconds')
            );
          }

          // Verify total connection attempts (initial + retries)
          expect(connectCallCount).toBe(1 + retryAttempts);

          // Clean up
          await dbService.disconnect();
        }
      ),
      { numRuns: 10 } // Reduced runs due to timer manipulation
    );

    jest.useRealTimers();
  });

  /**
   * Property: For any connection failure followed by successful connection,
   * the retry mechanism should stop after success.
   */
  it('should stop retrying after successful connection', async () => {
    jest.useFakeTimers();

    // Generator for number of failures before success (1-3)
    const failuresBeforeSuccessArb = fc.integer({ min: 1, max: 3 });

    await fc.assert(
      fc.asyncProperty(
        failuresBeforeSuccessArb,
        async (failuresBeforeSuccess) => {
          // Reset spies
          consoleLogSpy.mockClear();
          consoleErrorSpy.mockClear();

          let connectCallCount = 0;

          // Mock mongoose.connect to fail N times, then succeed
          mongoose.connect = jest.fn().mockImplementation(() => {
            connectCallCount++;
            if (connectCallCount <= failuresBeforeSuccess) {
              return Promise.reject(new Error('Connection failed'));
            }
            // Simulate successful connection by mocking readyState
            Object.defineProperty(mongoose.connection, 'readyState', {
              value: 1,
              writable: true,
              configurable: true
            });
            return Promise.resolve(mongoose);
          });

          const dbService = new DatabaseService('mongodb://localhost:27017/test');

          // Initial connection attempt (will fail)
          try {
            await dbService.connect();
          } catch (error) {
            // Expected to throw
          }

          // Advance timers to trigger retries until success
          for (let i = 0; i < failuresBeforeSuccess; i++) {
            jest.advanceTimersByTime(30000);
            await Promise.resolve();
          }

          // Verify we had the expected number of connection attempts
          expect(connectCallCount).toBe(failuresBeforeSuccess + 1);

          // Verify connection is now successful
          expect(dbService.isConnected()).toBe(true);

          // Clear logs
          consoleLogSpy.mockClear();
          consoleErrorSpy.mockClear();

          // Advance timer by another 30 seconds
          jest.advanceTimersByTime(30000);
          await Promise.resolve();

          // Verify no additional retry was attempted
          expect(connectCallCount).toBe(failuresBeforeSuccess + 1);

          // Verify no retry message was logged
          expect(consoleLogSpy).not.toHaveBeenCalledWith(
            expect.stringContaining('[DatabaseService] Retrying connection')
          );

          // Clean up
          Object.defineProperty(mongoose.connection, 'readyState', {
            value: 0,
            writable: true,
            configurable: true
          });
          await dbService.disconnect();
        }
      ),
      { numRuns: 10 }
    );

    jest.useRealTimers();
  });

  /**
   * Property: For any connection failure, the retry interval should always be 30 seconds.
   */
  it('should always use 30 second retry interval regardless of failure count', async () => {
    jest.useFakeTimers();

    // Generator for number of retry attempts (2-6)
    const retryAttemptsArb = fc.integer({ min: 2, max: 6 });

    await fc.assert(
      fc.asyncProperty(
        retryAttemptsArb,
        async (retryAttempts) => {
          // Reset spies
          consoleLogSpy.mockClear();
          consoleErrorSpy.mockClear();

          let connectCallCount = 0;

          // Mock mongoose.connect to always fail
          mongoose.connect = jest.fn().mockImplementation(() => {
            connectCallCount++;
            return Promise.reject(new Error('Connection failed'));
          });

          const dbService = new DatabaseService('mongodb://localhost:27017/test');

          // Initial connection attempt
          try {
            await dbService.connect();
          } catch (error) {
            // Expected to throw
          }

          const retryTimestamps: number[] = [];

          // Track retry attempts
          for (let i = 0; i < retryAttempts; i++) {
            const beforeTime = Date.now();
            
            // Advance by 30 seconds
            jest.advanceTimersByTime(30000);
            await Promise.resolve();
            
            const afterTime = Date.now();
            retryTimestamps.push(afterTime - beforeTime);
          }

          // Verify each retry happened at exactly 30 second intervals
          retryTimestamps.forEach((interval) => {
            expect(interval).toBe(30000);
          });

          // Verify total attempts
          expect(connectCallCount).toBe(1 + retryAttempts);

          // Clean up
          await dbService.disconnect();
        }
      ),
      { numRuns: 10 }
    );

    jest.useRealTimers();
  });

  /**
   * Property: For any connection failure, calling disconnect should
   * cancel pending retry attempts.
   */
  it('should cancel retry timer when disconnect is called', async () => {
    jest.useFakeTimers();

    await fc.assert(
      fc.asyncProperty(
        fc.constant(null),
        async () => {
          // Reset spies
          consoleLogSpy.mockClear();
          consoleErrorSpy.mockClear();

          let connectCallCount = 0;

          // Mock mongoose.connect to always fail
          mongoose.connect = jest.fn().mockImplementation(() => {
            connectCallCount++;
            return Promise.reject(new Error('Connection failed'));
          });

          const dbService = new DatabaseService('mongodb://localhost:27017/test');

          // Initial connection attempt (will fail)
          try {
            await dbService.connect();
          } catch (error) {
            // Expected to throw
          }

          // Verify retry was scheduled
          expect(consoleLogSpy).toHaveBeenCalledWith(
            expect.stringContaining('Will retry connection in 30 seconds')
          );

          const connectCountBeforeDisconnect = connectCallCount;

          // Disconnect (should cancel retry timer)
          await dbService.disconnect();

          // Clear logs
          consoleLogSpy.mockClear();
          consoleErrorSpy.mockClear();

          // Advance timer by 30 seconds
          jest.advanceTimersByTime(30000);
          await Promise.resolve();

          // Verify no retry was attempted after disconnect
          expect(connectCallCount).toBe(connectCountBeforeDisconnect);

          // Verify no retry message was logged
          expect(consoleLogSpy).not.toHaveBeenCalledWith(
            expect.stringContaining('[DatabaseService] Retrying connection')
          );
        }
      ),
      { numRuns: 10 }
    );

    jest.useRealTimers();
  });
});

import fc from 'fast-check';
import { Logger } from '../src/services/Logger';

/**
 * Property-Based Tests for Logger Service
 * Feature: vti-gap-trading-alert
 * 
 * These tests validate universal properties related to error logging
 * completeness and signal event logging.
 */

describe('Logger Properties', () => {
  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;
  let consoleDebugSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    consoleDebugSpy = jest.spyOn(console, 'debug').mockImplementation();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleDebugSpy.mockRestore();
  });

  /**
   * Property 23: Error Logging Completeness
   * **Validates: Requirements 10.1**
   * 
   * For any error that occurs in any component, the system should log an entry
   * containing timestamp, affected component name, Asset_Symbol (if applicable),
   * and descriptive error message.
   */
  describe('Property 23: Error Logging Completeness', () => {
    it('should log errors with all required fields: timestamp, component, message', async () => {
      // Generator for component names
      const componentArb = fc.constantFrom(
        'AssetMonitor',
        'AlertGenerator',
        'PriceTracker',
        'NotificationService',
        'MarketAPIClient',
        'DatabaseService',
        'TradingBotController'
      );

      // Generator for error messages
      const errorMessageArb = fc.string({ minLength: 5, maxLength: 100 });

      await fc.assert(
        fc.property(
          componentArb,
          errorMessageArb,
          (component, errorMessage) => {
            const logger = new Logger(component);
            
            // Log an error
            logger.error(errorMessage);

            // Verify console.error was called
            expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
            
            const logOutput = consoleErrorSpy.mock.calls[0][0];

            // Verify timestamp is present (ISO format)
            expect(logOutput).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/);
            
            // Verify ERROR level is present
            expect(logOutput).toContain('ERROR');
            
            // Verify component name is present
            expect(logOutput).toContain(`[${component}]`);
            
            // Verify error message is present
            expect(logOutput).toContain(errorMessage);

            // Reset spy for next iteration
            consoleErrorSpy.mockClear();
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should log errors with asset symbol when provided', async () => {
      const componentArb = fc.constantFrom(
        'AssetMonitor',
        'AlertGenerator',
        'PriceTracker'
      );

      // Generator for asset symbols
      const assetSymbolArb = fc.string({ 
        minLength: 1, 
        maxLength: 5,
        unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ')
      });

      const errorMessageArb = fc.string({ minLength: 5, maxLength: 100 });

      await fc.assert(
        fc.property(
          componentArb,
          assetSymbolArb,
          errorMessageArb,
          (component, asset, errorMessage) => {
            const logger = new Logger(component);
            
            // Log an error with asset symbol
            logger.error(errorMessage, asset);

            expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
            
            const logOutput = consoleErrorSpy.mock.calls[0][0];

            // Verify all required fields
            expect(logOutput).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/);
            expect(logOutput).toContain('ERROR');
            expect(logOutput).toContain(`[${component}]`);
            expect(logOutput).toContain(`[${asset}]`);
            expect(logOutput).toContain(errorMessage);

            consoleErrorSpy.mockClear();
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should log errors with metadata including stack traces', async () => {
      const componentArb = fc.constantFrom(
        'AssetMonitor',
        'AlertGenerator',
        'MarketAPIClient'
      );

      const errorMessageArb = fc.string({ minLength: 5, maxLength: 100 });

      // Generator for error metadata with stack traces
      const metadataArb = fc.record({
        stack: fc.string({ minLength: 10, maxLength: 200 }),
        errorCode: fc.option(fc.string({ minLength: 3, maxLength: 10 })),
        statusCode: fc.option(fc.integer({ min: 400, max: 599 }))
      });

      await fc.assert(
        fc.property(
          componentArb,
          errorMessageArb,
          metadataArb,
          (component, errorMessage, metadata) => {
            const logger = new Logger(component);
            
            // Log an error with metadata
            logger.error(errorMessage, undefined, metadata);

            expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
            
            const logOutput = consoleErrorSpy.mock.calls[0][0];

            // Verify all required fields
            expect(logOutput).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/);
            expect(logOutput).toContain('ERROR');
            expect(logOutput).toContain(`[${component}]`);
            expect(logOutput).toContain(errorMessage);
            
            // Verify metadata is present (as JSON string)
            expect(logOutput).toContain('"stack"');

            consoleErrorSpy.mockClear();
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should log errors with both asset symbol and metadata', async () => {
      const componentArb = fc.constantFrom(
        'AssetMonitor',
        'AlertGenerator',
        'PriceTracker'
      );

      const assetSymbolArb = fc.string({ 
        minLength: 1, 
        maxLength: 5,
        unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ')
      });

      const errorMessageArb = fc.string({ minLength: 5, maxLength: 100 });

      const metadataArb = fc.record({
        error: fc.string({ minLength: 5, maxLength: 50 }),
        price: fc.option(fc.double({ min: 0.01, max: 10000, noNaN: true })),
        timestamp: fc.option(fc.date())
      });

      await fc.assert(
        fc.property(
          componentArb,
          assetSymbolArb,
          errorMessageArb,
          metadataArb,
          (component, asset, errorMessage, metadata) => {
            const logger = new Logger(component);
            
            // Log an error with both asset and metadata
            logger.error(errorMessage, asset, metadata);

            expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
            
            const logOutput = consoleErrorSpy.mock.calls[0][0];

            // Verify all required fields are present
            expect(logOutput).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/);
            expect(logOutput).toContain('ERROR');
            expect(logOutput).toContain(`[${component}]`);
            expect(logOutput).toContain(`[${asset}]`);
            expect(logOutput).toContain(errorMessage);
            expect(logOutput).toContain('"error"');

            consoleErrorSpy.mockClear();
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should maintain completeness across different error scenarios', async () => {
      // Generator for various error scenarios
      const errorScenarioArb = fc.oneof(
        // Network error
        fc.record({
          component: fc.constant('MarketAPIClient'),
          message: fc.constant('API request failed'),
          asset: fc.string({ minLength: 1, maxLength: 5 }),
          metadata: fc.record({
            statusCode: fc.integer({ min: 400, max: 599 }),
            url: fc.webUrl()
          })
        }),
        // Database error
        fc.record({
          component: fc.constant('DatabaseService'),
          message: fc.constant('Failed to save signal'),
          asset: fc.string({ minLength: 1, maxLength: 5 }),
          metadata: fc.record({
            error: fc.string({ minLength: 5, maxLength: 50 }),
            collection: fc.constant('signals')
          })
        }),
        // Validation error
        fc.record({
          component: fc.constant('AssetMonitor'),
          message: fc.constant('Invalid price received'),
          asset: fc.string({ minLength: 1, maxLength: 5 }),
          metadata: fc.record({
            receivedPrice: fc.oneof(
              fc.constant(-1),
              fc.constant(0),
              fc.constant(NaN)
            )
          })
        })
      );

      await fc.assert(
        fc.property(
          errorScenarioArb,
          (scenario) => {
            const logger = new Logger(scenario.component);
            
            // Log the error scenario
            logger.error(scenario.message, scenario.asset, scenario.metadata);

            expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
            
            const logOutput = consoleErrorSpy.mock.calls[0][0];

            // Verify completeness for all scenarios
            expect(logOutput).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/);
            expect(logOutput).toContain('ERROR');
            expect(logOutput).toContain(`[${scenario.component}]`);
            expect(logOutput).toContain(`[${scenario.asset}]`);
            expect(logOutput).toContain(scenario.message);

            consoleErrorSpy.mockClear();
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  /**
   * Property 24: Signal Event Logging
   * **Validates: Requirements 10.3**
   * 
   * For any Signal generated, the system should log an event containing
   * all Signal details including the Asset_Symbol.
   */
  describe('Property 24: Signal Event Logging', () => {
    it('should log signal generation with all signal details', async () => {
      const componentArb = fc.constantFrom('AlertGenerator', 'TradingBotController');

      // Generator for asset symbols
      const assetSymbolArb = fc.string({ 
        minLength: 1, 
        maxLength: 5,
        unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ')
      });

      // Generator for prices
      const priceArb = fc.double({ 
        min: 1, 
        max: 10000, 
        noNaN: true,
        noDefaultInfinity: true
      });

      // Generator for percentage changes
      const diffArb = fc.double({ 
        min: 1.5, 
        max: 50, 
        noNaN: true,
        noDefaultInfinity: true
      });

      // Generator for signal objects
      const signalArb = fc.record({
        asset: assetSymbolArb,
        marketPrice: priceArb,
        fintualPrice: priceArb,
        diff: diffArb,
        createAt: fc.date()
      });

      await fc.assert(
        fc.property(
          componentArb,
          signalArb,
          (component, signal) => {
            const logger = new Logger(component);
            
            // Log signal generation event
            logger.info('Signal generated', signal.asset, signal);

            expect(consoleLogSpy).toHaveBeenCalledTimes(1);
            
            const logOutput = consoleLogSpy.mock.calls[0][0];

            // Verify timestamp is present
            expect(logOutput).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/);
            
            // Verify INFO level
            expect(logOutput).toContain('INFO');
            
            // Verify component name
            expect(logOutput).toContain(`[${component}]`);
            
            // Verify asset symbol is present
            expect(logOutput).toContain(`[${signal.asset}]`);
            
            // Verify signal generation message
            expect(logOutput).toContain('Signal generated');
            
            // Verify all signal details are in metadata
            expect(logOutput).toContain('"asset"');
            expect(logOutput).toContain('"marketPrice"');
            expect(logOutput).toContain('"fintualPrice"');
            expect(logOutput).toContain('"diff"');
            expect(logOutput).toContain('"createAt"');

            consoleLogSpy.mockClear();
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should log signal events with complete context for multiple assets', async () => {
      // Generator for multiple unique signals
      const signalsArb = fc.uniqueArray(
        fc.record({
          asset: fc.string({ 
            minLength: 1, 
            maxLength: 5,
            unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ')
          }),
          marketPrice: fc.double({ min: 1, max: 10000, noNaN: true, noDefaultInfinity: true }),
          fintualPrice: fc.double({ min: 1, max: 10000, noNaN: true, noDefaultInfinity: true }),
          diff: fc.double({ min: 1.5, max: 50, noNaN: true, noDefaultInfinity: true }),
          createAt: fc.date()
        }),
        { 
          minLength: 1, 
          maxLength: 5,
          selector: (signal) => signal.asset
        }
      );

      await fc.assert(
        fc.property(
          signalsArb,
          (signals) => {
            const logger = new Logger('AlertGenerator');
            
            // Log each signal generation
            signals.forEach(signal => {
              logger.info('Signal generated', signal.asset, signal);
            });

            // Verify each signal was logged
            expect(consoleLogSpy).toHaveBeenCalledTimes(signals.length);
            
            // Verify each log contains complete signal details
            signals.forEach((signal, index) => {
              const logOutput = consoleLogSpy.mock.calls[index][0];
              
              expect(logOutput).toContain('INFO');
              expect(logOutput).toContain('[AlertGenerator]');
              expect(logOutput).toContain(`[${signal.asset}]`);
              expect(logOutput).toContain('Signal generated');
              expect(logOutput).toContain('"asset"');
              expect(logOutput).toContain('"marketPrice"');
              expect(logOutput).toContain('"fintualPrice"');
              expect(logOutput).toContain('"diff"');
            });

            consoleLogSpy.mockClear();
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should log signal events with asset-specific logger', async () => {
      const assetSymbolArb = fc.string({ 
        minLength: 1, 
        maxLength: 5,
        unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ')
      });

      const signalArb = fc.record({
        asset: assetSymbolArb,
        marketPrice: fc.double({ min: 1, max: 10000, noNaN: true, noDefaultInfinity: true }),
        fintualPrice: fc.double({ min: 1, max: 10000, noNaN: true, noDefaultInfinity: true }),
        diff: fc.double({ min: 1.5, max: 50, noNaN: true, noDefaultInfinity: true }),
        createAt: fc.date()
      });

      await fc.assert(
        fc.property(
          signalArb,
          (signal) => {
            const logger = new Logger('AlertGenerator');
            const assetLogger = logger.withAsset(signal.asset);
            
            // Log signal using asset-specific logger
            assetLogger.info('Signal generated', signal);

            expect(consoleLogSpy).toHaveBeenCalledTimes(1);
            
            const logOutput = consoleLogSpy.mock.calls[0][0];

            // Verify asset symbol is automatically included
            expect(logOutput).toContain(`[${signal.asset}]`);
            expect(logOutput).toContain('Signal generated');
            
            // Verify all signal details are present
            expect(logOutput).toContain('"asset"');
            expect(logOutput).toContain('"marketPrice"');
            expect(logOutput).toContain('"fintualPrice"');
            expect(logOutput).toContain('"diff"');

            consoleLogSpy.mockClear();
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should maintain signal logging consistency across different price ranges', async () => {
      const assetSymbolArb = fc.string({ 
        minLength: 1, 
        maxLength: 5,
        unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ')
      });

      // Test with various price ranges
      const priceRangeArb = fc.oneof(
        // Low price range
        fc.double({ min: 0.01, max: 10, noNaN: true, noDefaultInfinity: true }),
        // Medium price range
        fc.double({ min: 10, max: 500, noNaN: true, noDefaultInfinity: true }),
        // High price range
        fc.double({ min: 500, max: 10000, noNaN: true, noDefaultInfinity: true })
      );

      const diffArb = fc.double({ min: 1.5, max: 50, noNaN: true, noDefaultInfinity: true });

      await fc.assert(
        fc.property(
          assetSymbolArb,
          priceRangeArb,
          priceRangeArb,
          diffArb,
          (asset, marketPrice, fintualPrice, diff) => {
            const logger = new Logger('AlertGenerator');
            
            const signal = {
              asset,
              marketPrice,
              fintualPrice,
              diff,
              createAt: new Date()
            };
            
            logger.info('Signal generated', asset, signal);

            expect(consoleLogSpy).toHaveBeenCalledTimes(1);
            
            const logOutput = consoleLogSpy.mock.calls[0][0];

            // Verify completeness regardless of price range
            expect(logOutput).toContain('INFO');
            expect(logOutput).toContain('[AlertGenerator]');
            expect(logOutput).toContain(`[${asset}]`);
            expect(logOutput).toContain('Signal generated');
            expect(logOutput).toContain('"marketPrice"');
            expect(logOutput).toContain('"fintualPrice"');
            expect(logOutput).toContain('"diff"');

            consoleLogSpy.mockClear();
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should log signal events at the correct log level (INFO)', async () => {
      const signalArb = fc.record({
        asset: fc.string({ 
          minLength: 1, 
          maxLength: 5,
          unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ')
        }),
        marketPrice: fc.double({ min: 1, max: 10000, noNaN: true, noDefaultInfinity: true }),
        fintualPrice: fc.double({ min: 1, max: 10000, noNaN: true, noDefaultInfinity: true }),
        diff: fc.double({ min: 1.5, max: 50, noNaN: true, noDefaultInfinity: true }),
        createAt: fc.date()
      });

      await fc.assert(
        fc.property(
          signalArb,
          (signal) => {
            const logger = new Logger('AlertGenerator');
            
            logger.info('Signal generated', signal.asset, signal);

            // Verify it uses console.log (INFO level)
            expect(consoleLogSpy).toHaveBeenCalledTimes(1);
            expect(consoleErrorSpy).not.toHaveBeenCalled();
            expect(consoleWarnSpy).not.toHaveBeenCalled();
            expect(consoleDebugSpy).not.toHaveBeenCalled();
            
            const logOutput = consoleLogSpy.mock.calls[0][0];
            expect(logOutput).toContain('INFO');

            consoleLogSpy.mockClear();
          }
        ),
        { numRuns: 20 }
      );
    });
  });
});

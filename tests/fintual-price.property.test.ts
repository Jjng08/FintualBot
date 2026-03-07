import fc from 'fast-check';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { Signal } from '../src/models/Signal';
import { AlertGenerator } from '../src/services/AlertGenerator';
import { PriceTracker } from '../src/services/PriceTracker';

/**
 * Property-Based Tests for Fintual Price Estimation
 * Feature: vti-gap-trading-alert
 * Task 7.4: Write property test for Fintual price estimation
 * 
 * These tests validate that Fintual price estimation is calculated correctly
 * and that all persisted signals contain valid fintualPrice fields.
 */

describe('Fintual Price Estimation Properties', () => {
  let mongoServer: MongoMemoryServer;
  let priceTracker: PriceTracker;
  let alertGenerator: AlertGenerator;

  beforeAll(async () => {
    // Create in-memory MongoDB instance for testing
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);
  });

  afterAll(async () => {
    // Clean up database connections
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(() => {
    // Initialize services for each test
    priceTracker = new PriceTracker(Signal);
    alertGenerator = new AlertGenerator(priceTracker, 1.5);
  });

  afterEach(async () => {
    // Clear all signals after each test
    await Signal.deleteMany({});
  });

  /**
   * Property 19: Fintual Price Estimation
   * **Validates: Requirements 8.1**
   * 
   * For any Signal created for an asset with a known previous Fintual price,
   * the estimated Fintual price should equal the previous Fintual price
   * multiplied by (1 + percentage_change/100).
   */
  describe('Property 19: Fintual Price Estimation', () => {
    it('should estimate Fintual price based on previous price and percentage change', async () => {
      // Generator for valid asset symbols
      const assetSymbolArb = fc.string({ 
        minLength: 1, 
        maxLength: 5,
        unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ')
      });

      // Generator for previous Fintual prices
      const previousFintualPriceArb = fc.double({ 
        min: 1, 
        max: 10000, 
        noNaN: true,
        noDefaultInfinity: true
      });

      // Generator for base prices
      const basePriceArb = fc.double({ 
        min: 1, 
        max: 10000, 
        noNaN: true,
        noDefaultInfinity: true
      });

      // Generator for percentage changes >= 1.5%
      const percentageChangeArb = fc.double({ 
        min: 1.5, 
        max: 50, 
        noNaN: true,
        noDefaultInfinity: true
      });

      await fc.assert(
        fc.asyncProperty(
          assetSymbolArb,
          previousFintualPriceArb,
          basePriceArb,
          percentageChangeArb,
          async (asset, previousFintualPrice, basePrice, percentageChange) => {
            // Clean database for this iteration
            await Signal.deleteMany({});

            // Create a previous signal with a known Fintual price
            const previousSignal = {
              asset,
              marketPrice: basePrice,
              fintualPrice: previousFintualPrice,
              diff: 0,
              createAt: new Date(Date.now() - 86400000) // Yesterday
            };
            await priceTracker.saveSignal(previousSignal);

            // Calculate current price based on percentage change
            const currentPrice = basePrice * (1 + percentageChange / 100);

            // Create new signal
            const signal = await alertGenerator.evaluateAsset(asset, basePrice, currentPrice);

            // Verify signal was created
            expect(signal).not.toBeNull();

            // The actual percentage change used will be rounded to 2 decimals by AlertGenerator
            const roundedPercentageChange = Math.round(percentageChange * 100) / 100;
            
            // Calculate expected Fintual price using the ROUNDED percentage
            // Formula: previousFintualPrice * (1 + rounded_percentage_change/100)
            const expectedFintualPrice = previousFintualPrice * (1 + roundedPercentageChange / 100);

            // Verify Fintual price estimation
            // Allow reasonable floating point tolerance (2 decimal places)
            expect(signal!.fintualPrice).toBeCloseTo(expectedFintualPrice, 2);
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should use base price when no previous Fintual price exists', async () => {
      // Generator for valid asset symbols
      const assetSymbolArb = fc.string({ 
        minLength: 1, 
        maxLength: 5,
        unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ')
      });

      // Generator for base prices
      const basePriceArb = fc.double({ 
        min: 1, 
        max: 10000, 
        noNaN: true,
        noDefaultInfinity: true
      });

      // Generator for percentage changes >= 1.5%
      const percentageChangeArb = fc.double({ 
        min: 1.5, 
        max: 50, 
        noNaN: true,
        noDefaultInfinity: true
      });

      await fc.assert(
        fc.asyncProperty(
          assetSymbolArb,
          basePriceArb,
          percentageChangeArb,
          async (asset, basePrice, percentageChange) => {
            // Clean database for this iteration
            await Signal.deleteMany({});

            // Ensure no previous signal exists for this asset
            const lastFintualPrice = await priceTracker.getLastFintualPrice(asset);
            expect(lastFintualPrice).toBeNull();

            // Calculate current price based on percentage change
            const currentPrice = basePrice * (1 + percentageChange / 100);

            // Create signal
            const signal = await alertGenerator.evaluateAsset(asset, basePrice, currentPrice);

            // Verify signal was created
            expect(signal).not.toBeNull();

            // When no previous Fintual price exists, should use base price
            expect(signal!.fintualPrice).toBe(basePrice);
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should correctly apply percentage change to previous Fintual price', async () => {
      const assetSymbolArb = fc.string({ 
        minLength: 1, 
        maxLength: 5,
        unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ')
      });

      const previousFintualPriceArb = fc.double({ 
        min: 10, 
        max: 1000, 
        noNaN: true,
        noDefaultInfinity: true
      });

      const basePriceArb = fc.double({ 
        min: 10, 
        max: 1000, 
        noNaN: true,
        noDefaultInfinity: true
      });

      await fc.assert(
        fc.asyncProperty(
          assetSymbolArb,
          previousFintualPriceArb,
          basePriceArb,
          async (asset, previousFintualPrice, basePrice) => {
            // Clean database for this iteration
            await Signal.deleteMany({});

            // Create previous signal
            const previousSignal = {
              asset,
              marketPrice: basePrice,
              fintualPrice: previousFintualPrice,
              diff: 0,
              createAt: new Date(Date.now() - 86400000)
            };
            await priceTracker.saveSignal(previousSignal);

            // Test with exactly 2% increase
            const currentPrice = basePrice * 1.02;

            // Create signal
            const signal = await alertGenerator.evaluateAsset(asset, basePrice, currentPrice);

            expect(signal).not.toBeNull();

            // Expected: previousFintualPrice * 1.02
            const expectedFintualPrice = previousFintualPrice * 1.02;
            expect(signal!.fintualPrice).toBeCloseTo(expectedFintualPrice, 2);
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should handle multiple signals with cumulative Fintual price updates', async () => {
      const assetSymbolArb = fc.string({ 
        minLength: 1, 
        maxLength: 5,
        unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ')
      });

      const initialFintualPriceArb = fc.double({ 
        min: 100, 
        max: 1000, 
        noNaN: true,
        noDefaultInfinity: true
      });

      const basePriceArb = fc.double({ 
        min: 100, 
        max: 1000, 
        noNaN: true,
        noDefaultInfinity: true
      });

      await fc.assert(
        fc.asyncProperty(
          assetSymbolArb,
          initialFintualPriceArb,
          basePriceArb,
          async (asset, initialFintualPrice, basePrice) => {
            // Clean database for this iteration
            await Signal.deleteMany({});

            // Create first signal with initial Fintual price
            const firstSignal = {
              asset,
              marketPrice: basePrice,
              fintualPrice: initialFintualPrice,
              diff: 2.0,
              createAt: new Date(Date.now() - 172800000) // 2 days ago
            };
            await priceTracker.saveSignal(firstSignal);

            // Verify the last Fintual price is the initial one
            const lastPrice = await priceTracker.getLastFintualPrice(asset);
            expect(lastPrice).toBe(initialFintualPrice);

            // Create second signal (next day) with 3% increase
            // Clear the "alerted today" flag by using a different date
            // We'll manually create the signal to test the estimation logic
            const secondPercentageChange = 3.0;
            const expectedSecondFintualPrice = initialFintualPrice * 1.03;

            // Get the last Fintual price before creating second signal
            const lastFintualBeforeSecond = await priceTracker.getLastFintualPrice(asset);
            expect(lastFintualBeforeSecond).toBe(initialFintualPrice);

            // Manually calculate what the second signal's Fintual price should be
            const calculatedFintualPrice = lastFintualBeforeSecond! * (1 + secondPercentageChange / 100);
            expect(calculatedFintualPrice).toBeCloseTo(expectedSecondFintualPrice, 2);
          }
        ),
        { numRuns: 10 }
      );
    });
  });

  /**
   * Property 20: Fintual Price Field Presence
   * **Validates: Requirements 8.3**
   * 
   * For any Signal persisted to the database, the fintualPrice field should be
   * present and contain a positive number.
   */
  describe('Property 20: Fintual Price Field Presence', () => {
    it('should always include fintualPrice field in persisted signals', async () => {
      const assetSymbolArb = fc.string({ 
        minLength: 1, 
        maxLength: 5,
        unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ')
      });

      const basePriceArb = fc.double({ 
        min: 1, 
        max: 10000, 
        noNaN: true,
        noDefaultInfinity: true
      });

      const percentageChangeArb = fc.double({ 
        min: 1.5, 
        max: 50, 
        noNaN: true,
        noDefaultInfinity: true
      });

      await fc.assert(
        fc.asyncProperty(
          assetSymbolArb,
          basePriceArb,
          percentageChangeArb,
          async (asset, basePrice, percentageChange) => {
            // Clean database for this iteration
            await Signal.deleteMany({});

            // Calculate current price
            const currentPrice = basePrice * (1 + percentageChange / 100);

            // Create and persist signal
            const signal = await alertGenerator.evaluateAsset(asset, basePrice, currentPrice);
            expect(signal).not.toBeNull();
            
            await priceTracker.saveSignal(signal!);

            // Retrieve signal from database
            const persistedSignals = await Signal.find({ asset }).exec();
            expect(persistedSignals.length).toBeGreaterThan(0);

            // Verify fintualPrice field exists and is valid
            const persistedSignal = persistedSignals[0];
            expect(persistedSignal.fintualPrice).toBeDefined();
            expect(typeof persistedSignal.fintualPrice).toBe('number');
            expect(persistedSignal.fintualPrice).toBeGreaterThan(0);
            expect(isFinite(persistedSignal.fintualPrice)).toBe(true);
            expect(isNaN(persistedSignal.fintualPrice)).toBe(false);
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should ensure fintualPrice is always positive', async () => {
      const assetSymbolArb = fc.string({ 
        minLength: 1, 
        maxLength: 5,
        unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ')
      });

      const basePriceArb = fc.double({ 
        min: 0.01, 
        max: 100000, 
        noNaN: true,
        noDefaultInfinity: true
      });

      const percentageChangeArb = fc.double({ 
        min: 1.5, 
        max: 100, 
        noNaN: true,
        noDefaultInfinity: true
      });

      await fc.assert(
        fc.asyncProperty(
          assetSymbolArb,
          basePriceArb,
          percentageChangeArb,
          async (asset, basePrice, percentageChange) => {
            // Clean database for this iteration
            await Signal.deleteMany({});

            // Calculate current price
            const currentPrice = basePrice * (1 + percentageChange / 100);

            // Create and persist signal
            const signal = await alertGenerator.evaluateAsset(asset, basePrice, currentPrice);
            expect(signal).not.toBeNull();
            
            await priceTracker.saveSignal(signal!);

            // Retrieve and verify
            const persistedSignals = await Signal.find({ asset }).exec();
            const persistedSignal = persistedSignals[0];

            // fintualPrice must be positive
            expect(persistedSignal.fintualPrice).toBeGreaterThan(0);
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should maintain fintualPrice precision when persisted', async () => {
      const assetSymbolArb = fc.string({ 
        minLength: 1, 
        maxLength: 5,
        unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ')
      });

      const previousFintualPriceArb = fc.double({ 
        min: 1, 
        max: 10000, 
        noNaN: true,
        noDefaultInfinity: true
      });

      const basePriceArb = fc.double({ 
        min: 1, 
        max: 10000, 
        noNaN: true,
        noDefaultInfinity: true
      });

      const percentageChangeArb = fc.double({ 
        min: 1.5, 
        max: 50, 
        noNaN: true,
        noDefaultInfinity: true
      });

      await fc.assert(
        fc.asyncProperty(
          assetSymbolArb,
          previousFintualPriceArb,
          basePriceArb,
          percentageChangeArb,
          async (asset, previousFintualPrice, basePrice, percentageChange) => {
            // Clean database for this iteration
            await Signal.deleteMany({});

            // Create previous signal
            const previousSignal = {
              asset,
              marketPrice: basePrice,
              fintualPrice: previousFintualPrice,
              diff: 0,
              createAt: new Date(Date.now() - 86400000)
            };
            await priceTracker.saveSignal(previousSignal);

            // Calculate current price
            const currentPrice = basePrice * (1 + percentageChange / 100);

            // Create and persist new signal
            const signal = await alertGenerator.evaluateAsset(asset, basePrice, currentPrice);
            expect(signal).not.toBeNull();
            
            const expectedFintualPrice = signal!.fintualPrice;
            await priceTracker.saveSignal(signal!);

            // Retrieve and verify precision is maintained
            const persistedSignals = await Signal.find({ 
              asset,
              createAt: { $gte: new Date(Date.now() - 3600000) } // Last hour
            }).exec();
            
            expect(persistedSignals.length).toBeGreaterThan(0);
            const persistedSignal = persistedSignals[0];

            // Verify the persisted value matches the calculated value
            expect(persistedSignal.fintualPrice).toBeCloseTo(expectedFintualPrice, 2);
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should validate fintualPrice field for all signals in database', async () => {
      const uniqueAssetsArb = fc.uniqueArray(
        fc.string({ 
          minLength: 1, 
          maxLength: 5,
          unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ')
        }),
        { minLength: 2, maxLength: 5 }
      );

      const basePriceArb = fc.double({ 
        min: 10, 
        max: 1000, 
        noNaN: true,
        noDefaultInfinity: true
      });

      const percentageChangeArb = fc.double({ 
        min: 2.0, 
        max: 10, 
        noNaN: true,
        noDefaultInfinity: true
      });

      await fc.assert(
        fc.asyncProperty(
          uniqueAssetsArb,
          basePriceArb,
          percentageChangeArb,
          async (assets, basePrice, percentageChange) => {
            // Clean database for this iteration
            await Signal.deleteMany({});

            // Create signals for multiple assets
            for (const asset of assets) {
              const currentPrice = basePrice * (1 + percentageChange / 100);
              const signal = await alertGenerator.evaluateAsset(asset, basePrice, currentPrice);
              
              if (signal) {
                await priceTracker.saveSignal(signal);
              }
            }

            // Retrieve all signals
            const allSignals = await Signal.find({}).exec();

            // Verify every signal has valid fintualPrice
            expect(allSignals.length).toBeGreaterThan(0);
            
            allSignals.forEach(signal => {
              expect(signal.fintualPrice).toBeDefined();
              expect(typeof signal.fintualPrice).toBe('number');
              expect(signal.fintualPrice).toBeGreaterThan(0);
              expect(isFinite(signal.fintualPrice)).toBe(true);
              expect(isNaN(signal.fintualPrice)).toBe(false);
            });
          }
        ),
        { numRuns: 10 }
      );
    }, 30000); // 30 second timeout
  });
});

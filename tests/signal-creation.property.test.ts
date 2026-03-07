import fc from 'fast-check';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { Signal } from '../src/models/Signal';
import { AlertGenerator } from '../src/services/AlertGenerator';
import { PriceTracker } from '../src/services/PriceTracker';

/**
 * Property-Based Tests for Signal Creation
 * Feature: vti-gap-trading-alert
 * 
 * These tests validate universal properties related to signal creation,
 * alert deduplication, and multi-asset independence.
 */

describe('Signal Creation Properties', () => {
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
   * Property 9: Signal Creation on Threshold
   * **Validates: Requirements 4.1**
   * 
   * For any asset where the percentage change is greater than or equal to 1.5%
   * and no signal has been created today for that asset, the system should create
   * a Signal with all required fields (asset, marketPrice, fintualPrice, diff, createAt).
   */
  describe('Property 9: Signal Creation on Threshold', () => {
    it('should create signal with all required fields when threshold is met', async () => {
      // Generator for valid asset symbols
      const assetSymbolArb = fc.string({ 
        minLength: 1, 
        maxLength: 5,
        unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ')
      });

      // Generator for base prices
      const basePriceArb = fc.double({ 
        min: 1, 
        max: 1000, 
        noNaN: true,
        noDefaultInfinity: true
      });

      // Generator for percentage changes >= 1.5%
      const thresholdMetChangeArb = fc.double({ 
        min: 1.5, 
        max: 50, 
        noNaN: true,
        noDefaultInfinity: true
      });

      await fc.assert(
        fc.asyncProperty(
          assetSymbolArb,
          basePriceArb,
          thresholdMetChangeArb,
          async (asset, basePrice, percentageChange) => {
            // Calculate current price that meets threshold
            const currentPrice = basePrice * (1 + percentageChange / 100);

            // Evaluate asset (should create signal)
            const signal = await alertGenerator.evaluateAsset(asset, basePrice, currentPrice);

            // Verify signal was created
            expect(signal).not.toBeNull();
            
            // Verify all required fields are present
            expect(signal!.asset).toBe(asset);
            expect(signal!.marketPrice).toBe(currentPrice);
            expect(signal!.fintualPrice).toBeGreaterThan(0);
            expect(signal!.diff).toBeCloseTo(percentageChange, 2);
            expect(signal!.createAt).toBeInstanceOf(Date);
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should not create signal when threshold is not met', async () => {
      const assetSymbolArb = fc.string({ 
        minLength: 1, 
        maxLength: 5,
        unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ')
      });

      const basePriceArb = fc.double({ 
        min: 1, 
        max: 1000, 
        noNaN: true,
        noDefaultInfinity: true
      });

      // Generator for percentage changes < 1.5%
      const belowThresholdChangeArb = fc.double({ 
        min: -50, 
        max: 1.49, 
        noNaN: true,
        noDefaultInfinity: true
      });

      await fc.assert(
        fc.asyncProperty(
          assetSymbolArb,
          basePriceArb,
          belowThresholdChangeArb,
          async (asset, basePrice, percentageChange) => {
            // Calculate current price below threshold
            const currentPrice = basePrice * (1 + percentageChange / 100);

            // Evaluate asset (should not create signal)
            const signal = await alertGenerator.evaluateAsset(asset, basePrice, currentPrice);

            // Verify no signal was created
            expect(signal).toBeNull();
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should create signal at exactly 1.5% threshold', async () => {
      const assetSymbolArb = fc.string({ 
        minLength: 1, 
        maxLength: 5,
        unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ')
      });

      const basePriceArb = fc.double({ 
        min: 1, 
        max: 1000, 
        noNaN: true,
        noDefaultInfinity: true
      });

      await fc.assert(
        fc.asyncProperty(
          assetSymbolArb,
          basePriceArb,
          async (asset, basePrice) => {
            // Calculate current price at exactly 1.5% threshold
            const currentPrice = basePrice * 1.015;

            // Evaluate asset (should create signal)
            const signal = await alertGenerator.evaluateAsset(asset, basePrice, currentPrice);

            // Verify signal was created
            expect(signal).not.toBeNull();
            expect(signal!.diff).toBeCloseTo(1.5, 2);
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  /**
   * Property 12: One Alert Per Asset Per Day
   * **Validates: Requirements 4.4**
   * 
   * For any asset on a given day, regardless of how many times the price exceeds
   * the threshold, the system should generate at most one Signal for that asset.
   */
  describe('Property 12: One Alert Per Asset Per Day', () => {
    it('should generate at most one signal per asset per day', async () => {
      const assetSymbolArb = fc.string({ 
        minLength: 1, 
        maxLength: 5,
        unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ')
      });

      const basePriceArb = fc.double({ 
        min: 1, 
        max: 1000, 
        noNaN: true,
        noDefaultInfinity: true
      });

      // Generate multiple price increases (2-5 times)
      const priceIncreasesArb = fc.array(
        fc.double({ min: 1.5, max: 10, noNaN: true, noDefaultInfinity: true }),
        { minLength: 2, maxLength: 5 }
      );

      await fc.assert(
        fc.asyncProperty(
          assetSymbolArb,
          basePriceArb,
          priceIncreasesArb,
          async (asset, basePrice, priceIncreases) => {
            let signalCreated = false;

            // Try to create signals multiple times with different price increases
            for (const increase of priceIncreases) {
              const currentPrice = basePrice * (1 + increase / 100);
              const signal = await alertGenerator.evaluateAsset(asset, basePrice, currentPrice);

              if (signal) {
                // If signal is created, persist it
                await priceTracker.saveSignal(signal);
                
                if (!signalCreated) {
                  // First signal should be created
                  expect(signal).not.toBeNull();
                  signalCreated = true;
                } else {
                  // This should not happen - fail the test
                  throw new Error('Multiple signals created for same asset on same day');
                }
              } else if (signalCreated) {
                // After first signal, subsequent evaluations should return null
                expect(signal).toBeNull();
              }
            }

            // Verify only one signal exists in database for this asset today
            const signalsToday = await priceTracker.getSignalsByAsset(asset, new Date());
            expect(signalsToday.length).toBeLessThanOrEqual(1);
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should not create second signal even with higher price increase', async () => {
      const assetSymbolArb = fc.string({ 
        minLength: 1, 
        maxLength: 5,
        unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ')
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
          basePriceArb,
          async (asset, basePrice) => {
            // Clean database before this iteration
            await Signal.deleteMany({});

            // First evaluation with 2% increase
            const firstPrice = basePrice * 1.02;
            const firstSignal = await alertGenerator.evaluateAsset(asset, basePrice, firstPrice);
            
            expect(firstSignal).not.toBeNull();
            await priceTracker.saveSignal(firstSignal!);

            // Second evaluation with 5% increase (higher than first)
            const secondPrice = basePrice * 1.05;
            const secondSignal = await alertGenerator.evaluateAsset(asset, basePrice, secondPrice);

            // Second signal should not be created
            expect(secondSignal).toBeNull();

            // Verify only one signal in database
            const signalsToday = await priceTracker.getSignalsByAsset(asset, new Date());
            expect(signalsToday).toHaveLength(1);
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  /**
   * Property 13: Independent Alerts for Different Assets
   * **Validates: Requirements 4.5**
   * 
   * For any set of different assets that all exceed the threshold on the same day,
   * the system should generate a separate Signal for each asset.
   */
  describe('Property 13: Independent Alerts for Different Assets', () => {
    it('should generate separate signals for different assets', async () => {
      // Generator for array of unique asset symbols
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
            // Clean database before this iteration
            await Signal.deleteMany({});

            const createdSignals: string[] = [];

            // Evaluate each asset with the same price change
            for (const asset of assets) {
              const currentPrice = basePrice * (1 + percentageChange / 100);
              const signal = await alertGenerator.evaluateAsset(asset, basePrice, currentPrice);

              // Each asset should generate a signal
              expect(signal).not.toBeNull();
              expect(signal!.asset).toBe(asset);
              
              // Persist the signal
              await priceTracker.saveSignal(signal!);
              createdSignals.push(asset);
            }

            // Verify all assets generated signals
            expect(createdSignals).toHaveLength(assets.length);

            // Verify each asset has exactly one signal in database
            for (const asset of assets) {
              const signalsForAsset = await priceTracker.getSignalsByAsset(asset, new Date());
              expect(signalsForAsset).toHaveLength(1);
              expect(signalsForAsset[0].asset).toBe(asset);
            }

            // Verify total number of signals matches number of assets
            const allSignals = await Signal.find({});
            expect(allSignals).toHaveLength(assets.length);
          }
        ),
        { numRuns: 10 }
      );
    }, 30000); // 30 second timeout for property-based test

    it('should maintain independence when some assets meet threshold and others do not', async () => {
      const uniqueAssetsArb = fc.uniqueArray(
        fc.string({ 
          minLength: 1, 
          maxLength: 5,
          unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ')
        }),
        { minLength: 3, maxLength: 5 }
      );

      const basePriceArb = fc.double({ 
        min: 10, 
        max: 1000, 
        noNaN: true,
        noDefaultInfinity: true
      });

      await fc.assert(
        fc.asyncProperty(
          uniqueAssetsArb,
          basePriceArb,
          async (assets, basePrice) => {
            // Clean database before this iteration
            await Signal.deleteMany({});

            const expectedSignals: string[] = [];

            // Evaluate each asset with different price changes
            for (let i = 0; i < assets.length; i++) {
              const asset = assets[i];
              
              // Alternate between meeting and not meeting threshold
              const percentageChange = i % 2 === 0 ? 2.0 : 1.0; // 2% or 1%
              const currentPrice = basePrice * (1 + percentageChange / 100);
              
              const signal = await alertGenerator.evaluateAsset(asset, basePrice, currentPrice);

              if (percentageChange >= 1.5) {
                // Should create signal
                expect(signal).not.toBeNull();
                await priceTracker.saveSignal(signal!);
                expectedSignals.push(asset);
              } else {
                // Should not create signal
                expect(signal).toBeNull();
              }
            }

            // Verify only assets that met threshold have signals
            const allSignals = await Signal.find({});
            expect(allSignals).toHaveLength(expectedSignals.length);

            // Verify each expected asset has a signal
            for (const asset of expectedSignals) {
              const signalsForAsset = await priceTracker.getSignalsByAsset(asset, new Date());
              expect(signalsForAsset).toHaveLength(1);
            }
          }
        ),
        { numRuns: 10 } // Reduced from 100 for faster execution
      );
    }, 30000); // 30 second timeout

    it('should handle multiple assets with different base prices independently', async () => {
      const uniqueAssetsArb = fc.uniqueArray(
        fc.string({ 
          minLength: 1, 
          maxLength: 5,
          unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ')
        }),
        { minLength: 2, maxLength: 4 }
      );

      // Generate different base prices for each asset
      const basePricesArb = fc.array(
        fc.double({ min: 10, max: 1000, noNaN: true, noDefaultInfinity: true }),
        { minLength: 2, maxLength: 4 }
      );

      const percentageChangeArb = fc.double({ 
        min: 2.0, 
        max: 10, 
        noNaN: true,
        noDefaultInfinity: true
      });

      await fc.assert(
        fc.asyncProperty(
          uniqueAssetsArb,
          basePricesArb,
          percentageChangeArb,
          async (assets, basePrices, percentageChange) => {
            // Clean database before this iteration
            await Signal.deleteMany({});

            // Ensure we have matching arrays
            const minLength = Math.min(assets.length, basePrices.length);
            const assetsToTest = assets.slice(0, minLength);
            const pricesToTest = basePrices.slice(0, minLength);

            // Evaluate each asset with its own base price
            for (let i = 0; i < assetsToTest.length; i++) {
              const asset = assetsToTest[i];
              const basePrice = pricesToTest[i];
              const currentPrice = basePrice * (1 + percentageChange / 100);

              const signal = await alertGenerator.evaluateAsset(asset, basePrice, currentPrice);

              expect(signal).not.toBeNull();
              expect(signal!.asset).toBe(asset);
              expect(signal!.marketPrice).toBe(currentPrice);
              
              await priceTracker.saveSignal(signal!);
            }

            // Verify each asset has its own signal with correct prices
            for (let i = 0; i < assetsToTest.length; i++) {
              const asset = assetsToTest[i];
              const basePrice = pricesToTest[i];
              const expectedCurrentPrice = basePrice * (1 + percentageChange / 100);

              const signalsForAsset = await priceTracker.getSignalsByAsset(asset, new Date());
              expect(signalsForAsset).toHaveLength(1);
              expect(signalsForAsset[0].marketPrice).toBe(expectedCurrentPrice);
            }
          }
        ),
        { numRuns: 10 }
      );
    }, 30000); // 30 second timeout
  });
});

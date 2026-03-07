import fc from 'fast-check';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { Signal } from '../src/models/Signal';
import { PriceTracker } from '../src/services/PriceTracker';

/**
 * Property-Based Tests for Price Tracker
 * Feature: vti-gap-trading-alert
 * Task 6.2: Write property test for signal query filtering
 * 
 * These tests validate universal properties that should hold true
 * for signal querying and filtering operations.
 */

describe('Property 22: Signal Query Filtering', () => {
  let mongoServer: MongoMemoryServer;
  let priceTracker: PriceTracker;

  beforeAll(async () => {
    // Create in-memory MongoDB instance for testing
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);
    
    // Initialize PriceTracker with Signal model
    priceTracker = new PriceTracker(Signal);
  });

  afterAll(async () => {
    // Clean up database connections
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  afterEach(async () => {
    // Clear all signals after each test
    await Signal.deleteMany({});
  });

  /**
   * **Validates: Requirements 9.5**
   * 
   * Property: For any Asset_Symbol, querying historical signals filtered by that symbol
   * should return only signals where the asset field matches the queried symbol.
   * 
   * This property ensures correct filtering of signals by asset symbol.
   */
  it('should return only signals matching the queried asset symbol', async () => {
    // Generator for valid asset symbols (1-5 uppercase letters)
    const assetSymbolArb = fc.string({ 
      minLength: 1, 
      maxLength: 5,
      unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ')
    });

    // Generator for valid prices (positive numbers)
    const priceArb = fc.double({ 
      min: 0.01, 
      max: 10000, 
      noNaN: true,
      noDefaultInfinity: true
    });

    // Generator for percentage changes
    const percentageChangeArb = fc.double({ 
      min: -50, 
      max: 50, 
      noNaN: true,
      noDefaultInfinity: true
    });

    // Generator for timestamps (using integer timestamps to avoid invalid dates)
    const timestampArb = fc.integer({ 
      min: new Date('2020-01-01').getTime(), 
      max: new Date('2030-12-31').getTime() 
    }).map(ts => new Date(ts));

    // Generator for a signal with a specific asset
    const signalWithAssetArb = (asset: string) => fc.record({
      asset: fc.constant(asset),
      marketPrice: priceArb,
      fintualPrice: priceArb,
      diff: percentageChangeArb,
      createAt: timestampArb
    });

    await fc.assert(
      fc.asyncProperty(
        // Generate a target asset to query
        assetSymbolArb,
        // Generate 2-5 signals for the target asset
        fc.integer({ min: 2, max: 5 }),
        // Generate 2-5 different asset symbols for noise signals
        fc.array(assetSymbolArb, { minLength: 2, maxLength: 5 }),
        // Generate 1-3 noise signals per different asset
        fc.integer({ min: 1, max: 3 }),
        async (targetAsset, targetSignalCount, otherAssets, noiseSignalsPerAsset) => {
          // Clean up before this iteration
          await Signal.deleteMany({});
          
          // Filter out the target asset from other assets to ensure they're different
          const differentAssets = otherAssets.filter(asset => asset !== targetAsset);
          
          // Skip if we don't have any different assets
          if (differentAssets.length === 0) {
            return;
          }

          // Generate and save signals for the target asset
          for (let i = 0; i < targetSignalCount; i++) {
            const signalData = fc.sample(signalWithAssetArb(targetAsset), 1)[0];
            await priceTracker.saveSignal(signalData);
          }

          // Generate and save noise signals for other assets
          for (const otherAsset of differentAssets) {
            for (let i = 0; i < noiseSignalsPerAsset; i++) {
              const signalData = fc.sample(signalWithAssetArb(otherAsset), 1)[0];
              await priceTracker.saveSignal(signalData);
            }
          }

          // Query signals for the target asset
          const retrievedSignals = await priceTracker.getSignalsByAsset(targetAsset);

          // Verify we got the correct number of signals
          expect(retrievedSignals).toHaveLength(targetSignalCount);

          // Verify all retrieved signals have the target asset
          retrievedSignals.forEach(signal => {
            expect(signal.asset).toBe(targetAsset);
          });

          // Verify no signals from other assets are included
          const retrievedAssets = new Set(retrievedSignals.map(s => s.asset));
          expect(retrievedAssets.size).toBe(1);
          expect(retrievedAssets.has(targetAsset)).toBe(true);

          // Verify none of the other assets are in the results
          differentAssets.forEach(otherAsset => {
            expect(retrievedAssets.has(otherAsset)).toBe(false);
          });
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property: For any asset with no signals, querying should return an empty array
   */
  it('should return empty array for asset with no signals', async () => {
    const assetSymbolArb = fc.string({ 
      minLength: 1, 
      maxLength: 5,
      unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ')
    });

    await fc.assert(
      fc.asyncProperty(
        assetSymbolArb,
        async (asset) => {
          // Query for an asset that has no signals
          const signals = await priceTracker.getSignalsByAsset(asset);

          // Verify empty array is returned
          expect(signals).toEqual([]);
          expect(signals).toHaveLength(0);
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property: For any asset, querying with a date filter should return only signals
   * from that specific day for that asset
   */
  it('should filter signals by both asset and date when date is provided', async () => {
    const assetSymbolArb = fc.string({ 
      minLength: 1, 
      maxLength: 5,
      unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ')
    });

    const priceArb = fc.double({ 
      min: 0.01, 
      max: 10000, 
      noNaN: true,
      noDefaultInfinity: true
    });

    const percentageChangeArb = fc.double({ 
      min: -50, 
      max: 50, 
      noNaN: true,
      noDefaultInfinity: true
    });

    // Use integer timestamp generator to avoid invalid dates
    const dateArb = fc.integer({ 
      min: new Date('2023-01-01').getTime(), 
      max: new Date('2024-12-31').getTime() 
    }).map(ts => new Date(ts));

    await fc.assert(
      fc.asyncProperty(
        assetSymbolArb,
        dateArb,
        fc.integer({ min: 1, max: 3 }),
        fc.integer({ min: 1, max: 3 }),
        async (asset, targetDate, signalsOnTargetDate, signalsOnOtherDates) => {
          // Clean up before this iteration
          await Signal.deleteMany({});
          
          // Create signals on the target date
          const targetDateSignals = [];
          for (let i = 0; i < signalsOnTargetDate; i++) {
            const signalDate = new Date(targetDate);
            signalDate.setHours(10 + i, 30, 0, 0); // Different times on same day
            
            const signalData = {
              asset,
              marketPrice: fc.sample(priceArb, 1)[0],
              fintualPrice: fc.sample(priceArb, 1)[0],
              diff: fc.sample(percentageChangeArb, 1)[0],
              createAt: signalDate
            };
            
            await priceTracker.saveSignal(signalData);
            targetDateSignals.push(signalData);
          }

          // Create signals on different dates for the same asset
          for (let i = 0; i < signalsOnOtherDates; i++) {
            const otherDate = new Date(targetDate);
            otherDate.setDate(otherDate.getDate() - (i + 1)); // Different days (before target date)
            
            const signalData = {
              asset,
              marketPrice: fc.sample(priceArb, 1)[0],
              fintualPrice: fc.sample(priceArb, 1)[0],
              diff: fc.sample(percentageChangeArb, 1)[0],
              createAt: otherDate
            };
            
            await priceTracker.saveSignal(signalData);
          }

          // Query signals for the asset on the target date
          const retrievedSignals = await priceTracker.getSignalsByAsset(asset, targetDate);

          // Verify we got only signals from the target date
          expect(retrievedSignals).toHaveLength(signalsOnTargetDate);

          // Verify all signals are from the target date
          retrievedSignals.forEach(signal => {
            expect(signal.asset).toBe(asset);
            
            const signalDate = new Date(signal.createAt);
            const targetDateOnly = new Date(targetDate);
            
            // Compare year, month, and day
            expect(signalDate.getFullYear()).toBe(targetDateOnly.getFullYear());
            expect(signalDate.getMonth()).toBe(targetDateOnly.getMonth());
            expect(signalDate.getDate()).toBe(targetDateOnly.getDate());
          });
        }
      ),
      { numRuns: 5 }
    );
  });

  /**
   * Property: For any set of assets, querying each asset independently should
   * return disjoint sets of signals (no overlap)
   */
  it('should return disjoint signal sets for different assets', async () => {
    const assetSymbolArb = fc.string({ 
      minLength: 1, 
      maxLength: 5,
      unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ')
    });

    const priceArb = fc.double({ 
      min: 0.01, 
      max: 10000, 
      noNaN: true,
      noDefaultInfinity: true
    });

    const percentageChangeArb = fc.double({ 
      min: -50, 
      max: 50, 
      noNaN: true,
      noDefaultInfinity: true
    });

    await fc.assert(
      fc.asyncProperty(
        // Generate 2-4 unique asset symbols
        fc.uniqueArray(assetSymbolArb, { minLength: 2, maxLength: 4 }),
        fc.integer({ min: 1, max: 3 }),
        async (assets, signalsPerAsset) => {
          // Clean up before this iteration
          await Signal.deleteMany({});
          
          // Create signals for each asset
          const assetSignalIds = new Map<string, Set<string>>();

          for (const asset of assets) {
            const signalIds = new Set<string>();
            
            for (let i = 0; i < signalsPerAsset; i++) {
              const signalData = {
                asset,
                marketPrice: fc.sample(priceArb, 1)[0],
                fintualPrice: fc.sample(priceArb, 1)[0],
                diff: fc.sample(percentageChangeArb, 1)[0],
                createAt: new Date()
              };
              
              await priceTracker.saveSignal(signalData);
            }
            
            // Query and store signal IDs for this asset
            const signals = await priceTracker.getSignalsByAsset(asset);
            signals.forEach(signal => signalIds.add(signal._id.toString()));
            assetSignalIds.set(asset, signalIds);
          }

          // Verify each asset has the correct number of signals
          assets.forEach(asset => {
            const signalIds = assetSignalIds.get(asset)!;
            expect(signalIds.size).toBe(signalsPerAsset);
          });

          // Verify no overlap between signal sets
          for (let i = 0; i < assets.length; i++) {
            for (let j = i + 1; j < assets.length; j++) {
              const asset1 = assets[i];
              const asset2 = assets[j];
              
              const ids1 = assetSignalIds.get(asset1)!;
              const ids2 = assetSignalIds.get(asset2)!;

              // Check for intersection (should be empty)
              const intersection = new Set([...ids1].filter(id => ids2.has(id)));
              expect(intersection.size).toBe(0);
            }
          }
        }
      ),
      { numRuns: 5 }
    );
  });

  /**
   * Property: Querying signals should return them in descending order by createAt
   * (most recent first)
   */
  it('should return signals sorted by createAt in descending order', async () => {
    const assetSymbolArb = fc.string({ 
      minLength: 1, 
      maxLength: 5,
      unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ')
    });

    const priceArb = fc.double({ 
      min: 0.01, 
      max: 10000, 
      noNaN: true,
      noDefaultInfinity: true
    });

    const percentageChangeArb = fc.double({ 
      min: -50, 
      max: 50, 
      noNaN: true,
      noDefaultInfinity: true
    });

    await fc.assert(
      fc.asyncProperty(
        assetSymbolArb,
        fc.integer({ min: 3, max: 6 }),
        async (asset, signalCount) => {
          // Clean up before this iteration
          await Signal.deleteMany({});
          
          // Create signals with different timestamps
          const timestamps: Date[] = [];
          
          for (let i = 0; i < signalCount; i++) {
            const timestamp = new Date('2024-01-01');
            timestamp.setHours(10 + i, 0, 0, 0);
            timestamps.push(timestamp);
            
            const signalData = {
              asset,
              marketPrice: fc.sample(priceArb, 1)[0],
              fintualPrice: fc.sample(priceArb, 1)[0],
              diff: fc.sample(percentageChangeArb, 1)[0],
              createAt: timestamp
            };
            
            await priceTracker.saveSignal(signalData);
          }

          // Query signals
          const retrievedSignals = await priceTracker.getSignalsByAsset(asset);

          // Verify signals are sorted in descending order (most recent first)
          for (let i = 0; i < retrievedSignals.length - 1; i++) {
            const currentTime = retrievedSignals[i].createAt.getTime();
            const nextTime = retrievedSignals[i + 1].createAt.getTime();
            
            expect(currentTime).toBeGreaterThanOrEqual(nextTime);
          }
        }
      ),
      { numRuns: 5 }
    );
  });
});

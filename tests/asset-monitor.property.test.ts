import fc from 'fast-check';
import { AssetMonitor } from '../src/services/AssetMonitor';
import { IMarketAPIClient } from '../src/services/MarketAPIClient';

/**
 * Property-Based Tests for AssetMonitor
 * Feature: vti-gap-trading-alert
 * Task 10.2: Write property test for base price initialization
 * 
 * These tests validate universal properties related to base price initialization
 * and immutability during the monitoring window.
 */

/**
 * Mock implementation of MarketAPIClient for property testing
 */
class MockMarketAPIClient implements IMarketAPIClient {
  private prices: Map<string, number> = new Map();
  private failures: Set<string> = new Set();

  setPrices(prices: Record<string, number>): void {
    this.prices.clear();
    Object.entries(prices).forEach(([symbol, price]) => {
      this.prices.set(symbol, price);
    });
  }

  setFailure(symbol: string): void {
    this.failures.add(symbol);
  }

  clearFailures(): void {
    this.failures.clear();
  }

  async getPrice(symbol: string): Promise<number> {
    if (this.failures.has(symbol)) {
      throw new Error(`Failed to fetch price for ${symbol}`);
    }
    
    const price = this.prices.get(symbol);
    if (price === undefined) {
      throw new Error(`Price not found for ${symbol}`);
    }
    
    return price;
  }

  async getPrices(symbols: string[]): Promise<Map<string, number>> {
    const results = new Map<string, number>();
    for (const symbol of symbols) {
      try {
        const price = await this.getPrice(symbol);
        results.set(symbol, price);
      } catch {
        // Skip failed symbols
      }
    }
    return results;
  }

  async validateSymbol(_symbol: string): Promise<boolean> {
    return true;
  }
}

describe('AssetMonitor Property Tests', () => {
  /**
   * Property 3: Base Price Initialization
   * **Validates: Requirements 2.1**
   * 
   * For any Asset_List, when initializing base prices at 11:30, the system should
   * obtain and store a base price for each asset in the list, and each base price
   * should be a positive number.
   */
  describe('Property 3: Base Price Initialization', () => {
    it('should initialize base prices for all assets with positive numbers', async () => {
      // Generator for valid asset symbols (1-5 uppercase letters)
      const assetSymbolArb = fc.string({ 
        minLength: 1, 
        maxLength: 5,
        unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ')
      });

      // Generator for asset lists (1-10 unique assets)
      const assetListArb = fc.uniqueArray(assetSymbolArb, { 
        minLength: 1, 
        maxLength: 10 
      });

      // Generator for valid prices (positive numbers)
      const priceArb = fc.double({ 
        min: 0.01, 
        max: 10000, 
        noNaN: true,
        noDefaultInfinity: true
      });

      await fc.assert(
        fc.asyncProperty(
          assetListArb,
          async (assetList) => {
            // Generate random prices for each asset
            const mockClient = new MockMarketAPIClient();
            const priceMap: Record<string, number> = {};
            
            for (const asset of assetList) {
              priceMap[asset] = fc.sample(priceArb, 1)[0];
            }
            
            mockClient.setPrices(priceMap);

            // Create monitor and initialize base prices
            const monitor = new AssetMonitor(mockClient, assetList);
            const basePrices = await monitor.initializeBasePrices();

            // Verify base prices were initialized for all assets
            expect(basePrices.size).toBe(assetList.length);

            // Verify each asset has a base price
            for (const asset of assetList) {
              const basePrice = basePrices.get(asset);
              
              // Base price should exist
              expect(basePrice).toBeDefined();
              
              // Base price should be a positive number
              expect(basePrice).toBeGreaterThan(0);
              expect(typeof basePrice).toBe('number');
              expect(isNaN(basePrice!)).toBe(false);
              expect(isFinite(basePrice!)).toBe(true);
              
              // Base price should match the price from API
              expect(basePrice).toBe(priceMap[asset]);
              
              // Base price should be accessible via getBasePrice
              expect(monitor.getBasePrice(asset)).toBe(basePrice);
            }
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should handle empty asset list gracefully', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constant([] as string[]),
          async (assetList) => {
            const mockClient = new MockMarketAPIClient();
            const monitor = new AssetMonitor(mockClient, assetList);
            const basePrices = await monitor.initializeBasePrices();

            // Should return empty map for empty asset list
            expect(basePrices.size).toBe(0);
          }
        ),
        { numRuns: 10 }
      );
    });

    it('should initialize current price equal to base price', async () => {
      const assetSymbolArb = fc.string({ 
        minLength: 1, 
        maxLength: 5,
        unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ')
      });

      const assetListArb = fc.uniqueArray(assetSymbolArb, { 
        minLength: 1, 
        maxLength: 5 
      });

      const priceArb = fc.double({ 
        min: 0.01, 
        max: 10000, 
        noNaN: true,
        noDefaultInfinity: true
      });

      await fc.assert(
        fc.asyncProperty(
          assetListArb,
          async (assetList) => {
            const mockClient = new MockMarketAPIClient();
            const priceMap: Record<string, number> = {};
            
            for (const asset of assetList) {
              priceMap[asset] = fc.sample(priceArb, 1)[0];
            }
            
            mockClient.setPrices(priceMap);

            const monitor = new AssetMonitor(mockClient, assetList);
            await monitor.initializeBasePrices();

            // Verify current price equals base price after initialization
            for (const asset of assetList) {
              const basePrice = monitor.getBasePrice(asset);
              const currentPrice = monitor.getCurrentPrice(asset);
              
              expect(currentPrice).toBe(basePrice);
            }
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should reject invalid prices during initialization', async () => {
      const assetSymbolArb = fc.string({ 
        minLength: 1, 
        maxLength: 5,
        unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ')
      });

      // Generator for invalid prices (negative, zero, NaN, Infinity)
      const invalidPriceArb = fc.oneof(
        fc.constant(0),
        fc.constant(-1),
        fc.constant(-100),
        fc.constant(NaN),
        fc.constant(Infinity),
        fc.constant(-Infinity),
        fc.double({ min: -10000, max: -0.01, noNaN: true, noDefaultInfinity: true })
      );

      await fc.assert(
        fc.asyncProperty(
          assetSymbolArb,
          invalidPriceArb,
          async (asset, invalidPrice) => {
            const mockClient = new MockMarketAPIClient();
            mockClient.setPrices({ [asset]: invalidPrice });

            const monitor = new AssetMonitor(mockClient, [asset]);
            const basePrices = await monitor.initializeBasePrices();

            // Invalid price should be rejected
            expect(basePrices.size).toBe(0);
            expect(basePrices.get(asset)).toBeUndefined();
            expect(monitor.getBasePrice(asset)).toBeNull();
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  /**
   * Property 6: Base Price Immutability
   * **Validates: Requirements 2.5**
   * 
   * For any asset during a monitoring session, the base price established at 11:30
   * should remain unchanged throughout the entire Gap_Window regardless of how many
   * times current prices are updated.
   */
  describe('Property 6: Base Price Immutability', () => {
    it('should keep base price unchanged after multiple price updates', async () => {
      const assetSymbolArb = fc.string({ 
        minLength: 1, 
        maxLength: 5,
        unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ')
      });

      const assetListArb = fc.uniqueArray(assetSymbolArb, { 
        minLength: 1, 
        maxLength: 5 
      });

      const priceArb = fc.double({ 
        min: 0.01, 
        max: 10000, 
        noNaN: true,
        noDefaultInfinity: true
      });

      // Generator for number of updates (2-10 updates)
      const updateCountArb = fc.integer({ min: 2, max: 10 });

      await fc.assert(
        fc.asyncProperty(
          assetListArb,
          updateCountArb,
          async (assetList, updateCount) => {
            const mockClient = new MockMarketAPIClient();
            
            // Set initial prices
            const initialPrices: Record<string, number> = {};
            for (const asset of assetList) {
              initialPrices[asset] = fc.sample(priceArb, 1)[0];
            }
            mockClient.setPrices(initialPrices);

            // Initialize base prices
            const monitor = new AssetMonitor(mockClient, assetList);
            const basePrices = await monitor.initializeBasePrices();

            // Store original base prices
            const originalBasePrices = new Map<string, number>();
            for (const asset of assetList) {
              const basePrice = monitor.getBasePrice(asset);
              expect(basePrice).not.toBeNull();
              originalBasePrices.set(asset, basePrice!);
            }

            // Perform multiple price updates
            for (let i = 0; i < updateCount; i++) {
              const updatedPrices: Record<string, number> = {};
              for (const asset of assetList) {
                // Generate different prices for each update
                updatedPrices[asset] = fc.sample(priceArb, 1)[0];
              }
              mockClient.setPrices(updatedPrices);
              
              await monitor.updateCurrentPrices();
            }

            // Verify base prices remain unchanged
            for (const asset of assetList) {
              const currentBasePrice = monitor.getBasePrice(asset);
              const originalBasePrice = originalBasePrices.get(asset);
              
              expect(currentBasePrice).toBe(originalBasePrice);
              expect(currentBasePrice).toBe(basePrices.get(asset));
            }
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should maintain base price immutability even with extreme price changes', async () => {
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

      await fc.assert(
        fc.asyncProperty(
          assetSymbolArb,
          priceArb,
          async (asset, basePrice) => {
            const mockClient = new MockMarketAPIClient();
            mockClient.setPrices({ [asset]: basePrice });

            const monitor = new AssetMonitor(mockClient, [asset]);
            await monitor.initializeBasePrices();

            const originalBasePrice = monitor.getBasePrice(asset);

            // Update with extreme price changes
            const extremePrices = [
              basePrice * 2,      // 100% increase
              basePrice * 0.5,    // 50% decrease
              basePrice * 10,     // 900% increase
              basePrice * 0.1,    // 90% decrease
              0.01,               // Very low price
              9999.99             // Very high price
            ];

            for (const newPrice of extremePrices) {
              mockClient.setPrices({ [asset]: newPrice });
              await monitor.updateCurrentPrices();

              // Base price should remain unchanged
              expect(monitor.getBasePrice(asset)).toBe(originalBasePrice);
              
              // Current price should be updated
              expect(monitor.getCurrentPrice(asset)).toBe(newPrice);
            }
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should maintain independent base prices for multiple assets', async () => {
      const assetSymbolArb = fc.string({ 
        minLength: 1, 
        maxLength: 5,
        unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ')
      });

      const assetListArb = fc.uniqueArray(assetSymbolArb, { 
        minLength: 2, 
        maxLength: 5 
      });

      const priceArb = fc.double({ 
        min: 0.01, 
        max: 10000, 
        noNaN: true,
        noDefaultInfinity: true
      });

      await fc.assert(
        fc.asyncProperty(
          assetListArb,
          fc.integer({ min: 2, max: 5 }),
          async (assetList, updateCount) => {
            const mockClient = new MockMarketAPIClient();
            
            // Set initial prices (different for each asset)
            const initialPrices: Record<string, number> = {};
            for (const asset of assetList) {
              initialPrices[asset] = fc.sample(priceArb, 1)[0];
            }
            mockClient.setPrices(initialPrices);

            // Initialize base prices
            const monitor = new AssetMonitor(mockClient, assetList);
            await monitor.initializeBasePrices();

            // Store original base prices
            const originalBasePrices = new Map<string, number>();
            for (const asset of assetList) {
              originalBasePrices.set(asset, monitor.getBasePrice(asset)!);
            }

            // Perform multiple updates with different prices for each asset
            for (let i = 0; i < updateCount; i++) {
              const updatedPrices: Record<string, number> = {};
              for (const asset of assetList) {
                updatedPrices[asset] = fc.sample(priceArb, 1)[0];
              }
              mockClient.setPrices(updatedPrices);
              await monitor.updateCurrentPrices();
            }

            // Verify each asset's base price remains unchanged and independent
            for (const asset of assetList) {
              const currentBasePrice = monitor.getBasePrice(asset);
              const originalBasePrice = originalBasePrices.get(asset);
              
              expect(currentBasePrice).toBe(originalBasePrice);
              
              // Verify base price is different from other assets (if prices were different)
              for (const otherAsset of assetList) {
                if (otherAsset !== asset) {
                  const otherBasePrice = originalBasePrices.get(otherAsset);
                  // Only check if original prices were different
                  if (initialPrices[asset] !== initialPrices[otherAsset]) {
                    expect(currentBasePrice).not.toBe(otherBasePrice);
                  }
                }
              }
            }
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should not update base price even if API returns different value on subsequent calls', async () => {
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

      await fc.assert(
        fc.asyncProperty(
          assetSymbolArb,
          priceArb,
          priceArb,
          async (asset, initialPrice, updatedPrice) => {
            // Ensure prices are different
            if (Math.abs(initialPrice - updatedPrice) < 0.01) {
              return; // Skip if prices are too similar
            }

            const mockClient = new MockMarketAPIClient();
            mockClient.setPrices({ [asset]: initialPrice });

            const monitor = new AssetMonitor(mockClient, [asset]);
            await monitor.initializeBasePrices();

            const basePrice = monitor.getBasePrice(asset);
            expect(basePrice).toBe(initialPrice);

            // Update API to return different price
            mockClient.setPrices({ [asset]: updatedPrice });
            await monitor.updateCurrentPrices();

            // Base price should still be the initial price
            expect(monitor.getBasePrice(asset)).toBe(initialPrice);
            expect(monitor.getBasePrice(asset)).not.toBe(updatedPrice);
            
            // Current price should be updated
            expect(monitor.getCurrentPrice(asset)).toBe(updatedPrice);
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  /**
   * Property 4: Price Persistence with Metadata
   * **Validates: Requirements 2.3**
   * 
   * For any asset and price obtained, when storing the price, the system should
   * persist it with the correct Asset_Symbol, timestamp, and the price value
   * should match the obtained value.
   */
  describe('Property 4: Price Persistence with Metadata', () => {
    it('should persist price updates with correct asset symbol, timestamp, and price', async () => {
      const assetSymbolArb = fc.string({ 
        minLength: 1, 
        maxLength: 5,
        unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ')
      });

      const assetListArb = fc.uniqueArray(assetSymbolArb, { 
        minLength: 1, 
        maxLength: 10 
      });

      const priceArb = fc.double({ 
        min: 0.01, 
        max: 10000, 
        noNaN: true,
        noDefaultInfinity: true
      });

      await fc.assert(
        fc.asyncProperty(
          assetListArb,
          async (assetList) => {
            const mockClient = new MockMarketAPIClient();
            
            // Set prices for all assets
            const priceMap: Record<string, number> = {};
            for (const asset of assetList) {
              priceMap[asset] = fc.sample(priceArb, 1)[0];
            }
            mockClient.setPrices(priceMap);

            // Create monitor and initialize
            const monitor = new AssetMonitor(mockClient, assetList);
            await monitor.initializeBasePrices();

            // Update prices and capture timestamp before the call
            const beforeUpdate = new Date();
            const priceUpdates = await monitor.updateCurrentPrices();
            const afterUpdate = new Date();

            // Verify price updates contain correct metadata for each asset
            expect(priceUpdates.size).toBe(assetList.length);

            for (const asset of assetList) {
              const priceUpdate = priceUpdates.get(asset);
              
              // Price update should exist
              expect(priceUpdate).toBeDefined();
              expect(priceUpdate).not.toBeNull();

              // Asset symbol should match
              expect(priceUpdate!.asset).toBe(asset);

              // Price should match the obtained value
              expect(priceUpdate!.price).toBe(priceMap[asset]);
              expect(priceUpdate!.price).toBeGreaterThan(0);
              expect(typeof priceUpdate!.price).toBe('number');

              // Timestamp should be present and within reasonable range
              expect(priceUpdate!.timestamp).toBeInstanceOf(Date);
              expect(priceUpdate!.timestamp.getTime()).toBeGreaterThanOrEqual(beforeUpdate.getTime());
              expect(priceUpdate!.timestamp.getTime()).toBeLessThanOrEqual(afterUpdate.getTime());

              // Source should be present
              expect(priceUpdate!.source).toBeDefined();
              expect(typeof priceUpdate!.source).toBe('string');
              expect(priceUpdate!.source.length).toBeGreaterThan(0);
            }
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should persist correct metadata for each individual asset independently', async () => {
      const assetSymbolArb = fc.string({ 
        minLength: 1, 
        maxLength: 5,
        unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ')
      });

      const assetListArb = fc.uniqueArray(assetSymbolArb, { 
        minLength: 2, 
        maxLength: 5 
      });

      const priceArb = fc.double({ 
        min: 0.01, 
        max: 10000, 
        noNaN: true,
        noDefaultInfinity: true
      });

      await fc.assert(
        fc.asyncProperty(
          assetListArb,
          async (assetList) => {
            const mockClient = new MockMarketAPIClient();
            
            // Set different prices for each asset
            const priceMap: Record<string, number> = {};
            for (const asset of assetList) {
              priceMap[asset] = fc.sample(priceArb, 1)[0];
            }
            mockClient.setPrices(priceMap);

            const monitor = new AssetMonitor(mockClient, assetList);
            await monitor.initializeBasePrices();

            const priceUpdates = await monitor.updateCurrentPrices();

            // Verify each asset has independent metadata
            const seenAssets = new Set<string>();
            
            for (const [asset, priceUpdate] of priceUpdates.entries()) {
              // Asset symbol in key should match asset in value
              expect(priceUpdate.asset).toBe(asset);
              
              // Each asset should appear only once
              expect(seenAssets.has(asset)).toBe(false);
              seenAssets.add(asset);

              // Price should match the specific asset's price
              expect(priceUpdate.price).toBe(priceMap[asset]);

              // Verify no cross-contamination with other assets
              for (const otherAsset of assetList) {
                if (otherAsset !== asset) {
                  expect(priceUpdate.asset).not.toBe(otherAsset);
                  // If prices are different, verify no mix-up
                  if (priceMap[asset] !== priceMap[otherAsset]) {
                    expect(priceUpdate.price).not.toBe(priceMap[otherAsset]);
                  }
                }
              }
            }

            // All assets should be accounted for
            expect(seenAssets.size).toBe(assetList.length);
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should maintain consistent metadata across multiple updates', async () => {
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

      const updateCountArb = fc.integer({ min: 2, max: 5 });

      await fc.assert(
        fc.asyncProperty(
          assetSymbolArb,
          updateCountArb,
          async (asset, updateCount) => {
            const mockClient = new MockMarketAPIClient();
            
            // Initialize with a price
            const initialPrice = fc.sample(priceArb, 1)[0];
            mockClient.setPrices({ [asset]: initialPrice });

            const monitor = new AssetMonitor(mockClient, [asset]);
            await monitor.initializeBasePrices();

            // Perform multiple updates and verify metadata consistency
            let previousTimestamp: Date | null = null;

            for (let i = 0; i < updateCount; i++) {
              const newPrice = fc.sample(priceArb, 1)[0];
              mockClient.setPrices({ [asset]: newPrice });

              // Small delay to ensure timestamps are different
              await new Promise(resolve => setTimeout(resolve, 1));

              const beforeUpdate = new Date();
              const priceUpdates = await monitor.updateCurrentPrices();
              const afterUpdate = new Date();

              const priceUpdate = priceUpdates.get(asset);
              
              // Verify metadata is present and correct
              expect(priceUpdate).toBeDefined();
              expect(priceUpdate!.asset).toBe(asset);
              expect(priceUpdate!.price).toBe(newPrice);
              expect(priceUpdate!.timestamp).toBeInstanceOf(Date);
              expect(priceUpdate!.timestamp.getTime()).toBeGreaterThanOrEqual(beforeUpdate.getTime());
              expect(priceUpdate!.timestamp.getTime()).toBeLessThanOrEqual(afterUpdate.getTime());
              expect(priceUpdate!.source).toBeDefined();

              // Timestamp should be later than previous update
              if (previousTimestamp !== null) {
                expect(priceUpdate!.timestamp.getTime()).toBeGreaterThanOrEqual(previousTimestamp.getTime());
              }

              previousTimestamp = priceUpdate!.timestamp;
            }
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should not persist metadata for assets with invalid prices', async () => {
      const assetSymbolArb = fc.string({ 
        minLength: 1, 
        maxLength: 5,
        unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ')
      });

      const validPriceArb = fc.double({ 
        min: 0.01, 
        max: 10000, 
        noNaN: true,
        noDefaultInfinity: true
      });

      const invalidPriceArb = fc.oneof(
        fc.constant(0),
        fc.constant(-1),
        fc.constant(NaN),
        fc.constant(Infinity),
        fc.constant(-Infinity)
      );

      await fc.assert(
        fc.asyncProperty(
          assetSymbolArb,
          assetSymbolArb,
          validPriceArb,
          invalidPriceArb,
          async (validAsset, invalidAsset, validPrice, invalidPrice) => {
            // Ensure assets are different
            if (validAsset === invalidAsset) {
              return;
            }

            const mockClient = new MockMarketAPIClient();
            mockClient.setPrices({ 
              [validAsset]: validPrice,
              [invalidAsset]: invalidPrice
            });

            const monitor = new AssetMonitor(mockClient, [validAsset, invalidAsset]);
            await monitor.initializeBasePrices();

            const priceUpdates = await monitor.updateCurrentPrices();

            // Valid asset should have price update with metadata
            const validUpdate = priceUpdates.get(validAsset);
            expect(validUpdate).toBeDefined();
            expect(validUpdate!.asset).toBe(validAsset);
            expect(validUpdate!.price).toBe(validPrice);
            expect(validUpdate!.timestamp).toBeInstanceOf(Date);
            expect(validUpdate!.source).toBeDefined();

            // Invalid asset should not have price update
            const invalidUpdate = priceUpdates.get(invalidAsset);
            expect(invalidUpdate).toBeUndefined();

            // Only one asset should be in the results
            expect(priceUpdates.size).toBe(1);
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should persist metadata even when API returns same price multiple times', async () => {
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

      await fc.assert(
        fc.asyncProperty(
          assetSymbolArb,
          priceArb,
          fc.integer({ min: 2, max: 5 }),
          async (asset, constantPrice, updateCount) => {
            const mockClient = new MockMarketAPIClient();
            mockClient.setPrices({ [asset]: constantPrice });

            const monitor = new AssetMonitor(mockClient, [asset]);
            await monitor.initializeBasePrices();

            // Perform multiple updates with the same price
            for (let i = 0; i < updateCount; i++) {
              await new Promise(resolve => setTimeout(resolve, 1));
              
              const priceUpdates = await monitor.updateCurrentPrices();
              const priceUpdate = priceUpdates.get(asset);

              // Metadata should be present even with same price
              expect(priceUpdate).toBeDefined();
              expect(priceUpdate!.asset).toBe(asset);
              expect(priceUpdate!.price).toBe(constantPrice);
              expect(priceUpdate!.timestamp).toBeInstanceOf(Date);
              expect(priceUpdate!.source).toBeDefined();
            }
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should handle partial failures and persist metadata only for successful assets', async () => {
      const assetSymbolArb = fc.string({ 
        minLength: 1, 
        maxLength: 5,
        unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ')
      });

      const assetListArb = fc.uniqueArray(assetSymbolArb, { 
        minLength: 3, 
        maxLength: 6 
      });

      const priceArb = fc.double({ 
        min: 0.01, 
        max: 10000, 
        noNaN: true,
        noDefaultInfinity: true
      });

      await fc.assert(
        fc.asyncProperty(
          assetListArb,
          async (assetList) => {
            const mockClient = new MockMarketAPIClient();
            
            // Set prices for all assets
            const priceMap: Record<string, number> = {};
            for (const asset of assetList) {
              priceMap[asset] = fc.sample(priceArb, 1)[0];
            }
            mockClient.setPrices(priceMap);

            const monitor = new AssetMonitor(mockClient, assetList);
            await monitor.initializeBasePrices();

            // Make some assets fail (at least one, but not all)
            const failureCount = Math.max(1, Math.floor(assetList.length / 2));
            const failingAssets = assetList.slice(0, failureCount);
            const successfulAssets = assetList.slice(failureCount);

            for (const asset of failingAssets) {
              mockClient.setFailure(asset);
            }

            const priceUpdates = await monitor.updateCurrentPrices();

            // Only successful assets should have price updates
            expect(priceUpdates.size).toBe(successfulAssets.length);

            // Verify successful assets have correct metadata
            for (const asset of successfulAssets) {
              const priceUpdate = priceUpdates.get(asset);
              expect(priceUpdate).toBeDefined();
              expect(priceUpdate!.asset).toBe(asset);
              expect(priceUpdate!.price).toBe(priceMap[asset]);
              expect(priceUpdate!.timestamp).toBeInstanceOf(Date);
              expect(priceUpdate!.source).toBeDefined();
            }

            // Verify failing assets do not have price updates
            for (const asset of failingAssets) {
              const priceUpdate = priceUpdates.get(asset);
              expect(priceUpdate).toBeUndefined();
            }
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  /**
   * Property 5: Error Isolation Between Assets
   * **Validates: Requirements 2.4, 7.5**
   * 
   * For any Asset_List where one asset fails to return a price, the system should
   * continue monitoring and updating prices for all other assets in the list
   * without interruption.
   */
  describe('Property 5: Error Isolation Between Assets', () => {
    it('should continue monitoring other assets when one asset fails', async () => {
      const assetSymbolArb = fc.string({ 
        minLength: 1, 
        maxLength: 5,
        unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ')
      });

      const assetListArb = fc.uniqueArray(assetSymbolArb, { 
        minLength: 2, 
        maxLength: 10 
      });

      const priceArb = fc.double({ 
        min: 0.01, 
        max: 10000, 
        noNaN: true,
        noDefaultInfinity: true
      });

      await fc.assert(
        fc.asyncProperty(
          assetListArb,
          async (assetList) => {
            const mockClient = new MockMarketAPIClient();
            
            // Set prices for all assets
            const priceMap: Record<string, number> = {};
            for (const asset of assetList) {
              priceMap[asset] = fc.sample(priceArb, 1)[0];
            }
            mockClient.setPrices(priceMap);

            const monitor = new AssetMonitor(mockClient, assetList);
            await monitor.initializeBasePrices();

            // Make one asset fail (the first one)
            const failingAsset = assetList[0];
            const successfulAssets = assetList.slice(1);
            
            mockClient.setFailure(failingAsset);

            // Update prices
            const priceUpdates = await monitor.updateCurrentPrices();

            // All successful assets should have price updates
            expect(priceUpdates.size).toBe(successfulAssets.length);

            // Verify successful assets were updated correctly
            for (const asset of successfulAssets) {
              const priceUpdate = priceUpdates.get(asset);
              
              expect(priceUpdate).toBeDefined();
              expect(priceUpdate!.asset).toBe(asset);
              expect(priceUpdate!.price).toBe(priceMap[asset]);
              expect(priceUpdate!.price).toBeGreaterThan(0);
              expect(priceUpdate!.timestamp).toBeInstanceOf(Date);
              expect(priceUpdate!.source).toBeDefined();
            }

            // Failing asset should not have price update
            expect(priceUpdates.get(failingAsset)).toBeUndefined();
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should continue monitoring when multiple assets fail', async () => {
      const assetSymbolArb = fc.string({ 
        minLength: 1, 
        maxLength: 5,
        unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ')
      });

      const assetListArb = fc.uniqueArray(assetSymbolArb, { 
        minLength: 4, 
        maxLength: 10 
      });

      const priceArb = fc.double({ 
        min: 0.01, 
        max: 10000, 
        noNaN: true,
        noDefaultInfinity: true
      });

      await fc.assert(
        fc.asyncProperty(
          assetListArb,
          async (assetList) => {
            const mockClient = new MockMarketAPIClient();
            
            // Set prices for all assets
            const priceMap: Record<string, number> = {};
            for (const asset of assetList) {
              priceMap[asset] = fc.sample(priceArb, 1)[0];
            }
            mockClient.setPrices(priceMap);

            const monitor = new AssetMonitor(mockClient, assetList);
            await monitor.initializeBasePrices();

            // Make multiple assets fail (at least 2, but not all)
            const failureCount = Math.max(2, Math.floor(assetList.length / 2));
            const failingAssets = assetList.slice(0, failureCount);
            const successfulAssets = assetList.slice(failureCount);

            for (const asset of failingAssets) {
              mockClient.setFailure(asset);
            }

            // Update prices
            const priceUpdates = await monitor.updateCurrentPrices();

            // Only successful assets should have price updates
            expect(priceUpdates.size).toBe(successfulAssets.length);

            // Verify successful assets were updated correctly
            for (const asset of successfulAssets) {
              const priceUpdate = priceUpdates.get(asset);
              
              expect(priceUpdate).toBeDefined();
              expect(priceUpdate!.asset).toBe(asset);
              expect(priceUpdate!.price).toBe(priceMap[asset]);
              expect(priceUpdate!.timestamp).toBeInstanceOf(Date);
            }

            // Failing assets should not have price updates
            for (const asset of failingAssets) {
              expect(priceUpdates.get(asset)).toBeUndefined();
            }
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should maintain base prices for successful assets when others fail', async () => {
      const assetSymbolArb = fc.string({ 
        minLength: 1, 
        maxLength: 5,
        unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ')
      });

      const assetListArb = fc.uniqueArray(assetSymbolArb, { 
        minLength: 3, 
        maxLength: 8 
      });

      const priceArb = fc.double({ 
        min: 0.01, 
        max: 10000, 
        noNaN: true,
        noDefaultInfinity: true
      });

      await fc.assert(
        fc.asyncProperty(
          assetListArb,
          async (assetList) => {
            const mockClient = new MockMarketAPIClient();
            
            // Set initial prices for all assets
            const initialPrices: Record<string, number> = {};
            for (const asset of assetList) {
              initialPrices[asset] = fc.sample(priceArb, 1)[0];
            }
            mockClient.setPrices(initialPrices);

            const monitor = new AssetMonitor(mockClient, assetList);
            await monitor.initializeBasePrices();

            // Store base prices for all assets
            const basePrices = new Map<string, number>();
            for (const asset of assetList) {
              const basePrice = monitor.getBasePrice(asset);
              expect(basePrice).not.toBeNull();
              basePrices.set(asset, basePrice!);
            }

            // Make some assets fail
            const failureCount = Math.max(1, Math.floor(assetList.length / 3));
            const failingAssets = assetList.slice(0, failureCount);
            const successfulAssets = assetList.slice(failureCount);

            for (const asset of failingAssets) {
              mockClient.setFailure(asset);
            }

            // Update current prices with new values for successful assets
            const updatedPrices: Record<string, number> = {};
            for (const asset of assetList) {
              updatedPrices[asset] = fc.sample(priceArb, 1)[0];
            }
            mockClient.setPrices(updatedPrices);

            await monitor.updateCurrentPrices();

            // Base prices should remain unchanged for ALL assets (including failed ones)
            for (const asset of assetList) {
              const currentBasePrice = monitor.getBasePrice(asset);
              expect(currentBasePrice).toBe(basePrices.get(asset));
            }

            // Current prices should be updated only for successful assets
            for (const asset of successfulAssets) {
              const currentPrice = monitor.getCurrentPrice(asset);
              expect(currentPrice).toBe(updatedPrices[asset]);
            }

            // Current prices should remain at base price for failed assets
            for (const asset of failingAssets) {
              const currentPrice = monitor.getCurrentPrice(asset);
              expect(currentPrice).toBe(basePrices.get(asset));
            }
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should handle intermittent failures without affecting other assets', async () => {
      const assetSymbolArb = fc.string({ 
        minLength: 1, 
        maxLength: 5,
        unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ')
      });

      const assetListArb = fc.uniqueArray(assetSymbolArb, { 
        minLength: 3, 
        maxLength: 6 
      });

      const priceArb = fc.double({ 
        min: 0.01, 
        max: 10000, 
        noNaN: true,
        noDefaultInfinity: true
      });

      const updateCountArb = fc.integer({ min: 3, max: 6 });

      await fc.assert(
        fc.asyncProperty(
          assetListArb,
          updateCountArb,
          async (assetList, updateCount) => {
            const mockClient = new MockMarketAPIClient();
            
            // Set initial prices
            const initialPrices: Record<string, number> = {};
            for (const asset of assetList) {
              initialPrices[asset] = fc.sample(priceArb, 1)[0];
            }
            mockClient.setPrices(initialPrices);

            const monitor = new AssetMonitor(mockClient, assetList);
            await monitor.initializeBasePrices();

            // Pick one asset to have intermittent failures
            const intermittentAsset = assetList[0];
            const stableAssets = assetList.slice(1);

            // Perform multiple updates with intermittent failures
            for (let i = 0; i < updateCount; i++) {
              // Update prices
              const updatedPrices: Record<string, number> = {};
              for (const asset of assetList) {
                updatedPrices[asset] = fc.sample(priceArb, 1)[0];
              }
              mockClient.setPrices(updatedPrices);

              // Make intermittent asset fail on odd iterations
              if (i % 2 === 1) {
                mockClient.setFailure(intermittentAsset);
              } else {
                mockClient.clearFailures();
              }

              const priceUpdates = await monitor.updateCurrentPrices();

              // Stable assets should always be updated
              for (const asset of stableAssets) {
                const priceUpdate = priceUpdates.get(asset);
                expect(priceUpdate).toBeDefined();
                expect(priceUpdate!.asset).toBe(asset);
                expect(priceUpdate!.price).toBe(updatedPrices[asset]);
              }

              // Intermittent asset should only be updated on even iterations
              const intermittentUpdate = priceUpdates.get(intermittentAsset);
              if (i % 2 === 0) {
                expect(intermittentUpdate).toBeDefined();
                expect(intermittentUpdate!.price).toBe(updatedPrices[intermittentAsset]);
              } else {
                expect(intermittentUpdate).toBeUndefined();
              }
            }
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should continue initialization when some assets fail during base price setup', async () => {
      const assetSymbolArb = fc.string({ 
        minLength: 1, 
        maxLength: 5,
        unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ')
      });

      const assetListArb = fc.uniqueArray(assetSymbolArb, { 
        minLength: 3, 
        maxLength: 10 
      });

      const priceArb = fc.double({ 
        min: 0.01, 
        max: 10000, 
        noNaN: true,
        noDefaultInfinity: true
      });

      await fc.assert(
        fc.asyncProperty(
          assetListArb,
          async (assetList) => {
            const mockClient = new MockMarketAPIClient();
            
            // Set prices for all assets
            const priceMap: Record<string, number> = {};
            for (const asset of assetList) {
              priceMap[asset] = fc.sample(priceArb, 1)[0];
            }
            mockClient.setPrices(priceMap);

            // Make some assets fail during initialization
            const failureCount = Math.max(1, Math.floor(assetList.length / 3));
            const failingAssets = assetList.slice(0, failureCount);
            const successfulAssets = assetList.slice(failureCount);

            for (const asset of failingAssets) {
              mockClient.setFailure(asset);
            }

            const monitor = new AssetMonitor(mockClient, assetList);
            const basePrices = await monitor.initializeBasePrices();

            // Only successful assets should have base prices
            expect(basePrices.size).toBe(successfulAssets.length);

            // Verify successful assets have base prices
            for (const asset of successfulAssets) {
              const basePrice = basePrices.get(asset);
              expect(basePrice).toBeDefined();
              expect(basePrice).toBe(priceMap[asset]);
              expect(monitor.getBasePrice(asset)).toBe(basePrice);
            }

            // Failing assets should not have base prices
            for (const asset of failingAssets) {
              expect(basePrices.get(asset)).toBeUndefined();
              expect(monitor.getBasePrice(asset)).toBeNull();
            }

            // Clear failures and update prices
            mockClient.clearFailures();
            const priceUpdates = await monitor.updateCurrentPrices();

            // Now all assets should be able to update (including previously failed ones)
            expect(priceUpdates.size).toBe(assetList.length);

            // Previously successful assets should still have their base prices
            for (const asset of successfulAssets) {
              expect(monitor.getBasePrice(asset)).toBe(priceMap[asset]);
            }

            // Previously failed assets should still not have base prices
            // (base prices are only set during initialization)
            for (const asset of failingAssets) {
              expect(monitor.getBasePrice(asset)).toBeNull();
            }
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should isolate errors across all assets in the list', async () => {
      const assetSymbolArb = fc.string({ 
        minLength: 1, 
        maxLength: 5,
        unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ')
      });

      const assetListArb = fc.uniqueArray(assetSymbolArb, { 
        minLength: 5, 
        maxLength: 10 
      });

      const priceArb = fc.double({ 
        min: 0.01, 
        max: 10000, 
        noNaN: true,
        noDefaultInfinity: true
      });

      await fc.assert(
        fc.asyncProperty(
          assetListArb,
          async (assetList) => {
            const mockClient = new MockMarketAPIClient();
            
            // Set prices for all assets
            const priceMap: Record<string, number> = {};
            for (const asset of assetList) {
              priceMap[asset] = fc.sample(priceArb, 1)[0];
            }
            mockClient.setPrices(priceMap);

            const monitor = new AssetMonitor(mockClient, assetList);
            await monitor.initializeBasePrices();

            // Test each asset failing individually
            for (const failingAsset of assetList) {
              mockClient.clearFailures();
              mockClient.setFailure(failingAsset);

              const priceUpdates = await monitor.updateCurrentPrices();

              // All assets except the failing one should be updated
              expect(priceUpdates.size).toBe(assetList.length - 1);

              // Verify all other assets were updated
              for (const asset of assetList) {
                const priceUpdate = priceUpdates.get(asset);
                
                if (asset === failingAsset) {
                  expect(priceUpdate).toBeUndefined();
                } else {
                  expect(priceUpdate).toBeDefined();
                  expect(priceUpdate!.asset).toBe(asset);
                  expect(priceUpdate!.price).toBe(priceMap[asset]);
                }
              }
            }
          }
        ),
        { numRuns: 10 } // Reduced runs since this test is more intensive
      );
    });

    it('should handle all assets failing gracefully', async () => {
      const assetSymbolArb = fc.string({ 
        minLength: 1, 
        maxLength: 5,
        unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ')
      });

      const assetListArb = fc.uniqueArray(assetSymbolArb, { 
        minLength: 1, 
        maxLength: 5 
      });

      const priceArb = fc.double({ 
        min: 0.01, 
        max: 10000, 
        noNaN: true,
        noDefaultInfinity: true
      });

      await fc.assert(
        fc.asyncProperty(
          assetListArb,
          async (assetList) => {
            const mockClient = new MockMarketAPIClient();
            
            // Set prices for all assets
            const priceMap: Record<string, number> = {};
            for (const asset of assetList) {
              priceMap[asset] = fc.sample(priceArb, 1)[0];
            }
            mockClient.setPrices(priceMap);

            const monitor = new AssetMonitor(mockClient, assetList);
            await monitor.initializeBasePrices();

            // Make all assets fail
            for (const asset of assetList) {
              mockClient.setFailure(asset);
            }

            // Update prices - should not throw error
            const priceUpdates = await monitor.updateCurrentPrices();

            // No assets should have price updates
            expect(priceUpdates.size).toBe(0);

            // Base prices should still be accessible
            for (const asset of assetList) {
              const basePrice = monitor.getBasePrice(asset);
              expect(basePrice).not.toBeNull();
              expect(basePrice).toBe(priceMap[asset]);
            }
          }
        ),
        { numRuns: 20 }
      );
    });
  });
});

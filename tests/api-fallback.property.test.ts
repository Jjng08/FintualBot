import fc from 'fast-check';
import { MarketAPIClient } from '../src/services/MarketAPIClient';

/**
 * Property-Based Tests for API Fallback
 * Feature: vti-gap-trading-alert
 * 
 * These tests validate that the API fallback mechanism works correctly
 * when the primary API fails to return a valid price.
 */

// Mock retryWithBackoff to execute immediately without delays
jest.mock('../src/utils/errorHandling', () => ({
  ...jest.requireActual('../src/utils/errorHandling'),
  retryWithBackoff: jest.fn(async <T>(operation: () => Promise<T>) => {
    // Try once, if it fails throw immediately (no delays)
    try {
      return await operation();
    } catch (error) {
      throw error;
    }
  })
}));

describe('Property 16: API Fallback on Primary Failure', () => {
  /**
   * **Validates: Requirements 7.2**
   * 
   * Property: For any asset, when the primary API fails to return a valid price,
   * the system should attempt to obtain the price from the secondary API before
   * reporting a failure.
   * 
   * This property ensures high availability of price data through redundancy.
   */
  it('should attempt secondary API when primary API fails', async () => {
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

    await fc.assert(
      fc.asyncProperty(assetSymbolArb, priceArb, async (symbol, expectedPrice) => {
        let primaryCalled = false;
        let secondaryCalled = false;

        // Create a client with mocked API methods
        const client = new MarketAPIClient('primary-key', 'secondary-key');

        // Mock the primary API to fail
        (client as any).fetchPriceFromPrimaryAPI = async (_sym: string) => {
          primaryCalled = true;
          throw new Error('Primary API failure');
        };

        // Mock the secondary API to succeed
        (client as any).fetchPriceFromSecondaryAPI = async (_sym: string) => {
          secondaryCalled = true;
          return expectedPrice;
        };

        // Call getPrice - should fallback to secondary
        const price = await client.getPrice(symbol);

        // Verify both APIs were called in correct order
        expect(primaryCalled).toBe(true);
        expect(secondaryCalled).toBe(true);

        // Verify the price from secondary API was returned
        expect(price).toBe(expectedPrice);
      }),
      { numRuns: 20 }
    );
  });

  /**
   * Property test: Verify that when primary API succeeds,
   * secondary API is not called
   */
  it('should not call secondary API when primary API succeeds', async () => {
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
      fc.asyncProperty(assetSymbolArb, priceArb, async (symbol, expectedPrice) => {
        let primaryCalled = false;
        let secondaryCalled = false;

        const client = new MarketAPIClient('primary-key', 'secondary-key');

        // Mock the primary API to succeed
        (client as any).fetchPriceFromPrimaryAPI = async (_sym: string) => {
          primaryCalled = true;
          return expectedPrice;
        };

        // Mock the secondary API (should not be called)
        (client as any).fetchPriceFromSecondaryAPI = async (_sym: string) => {
          secondaryCalled = true;
          return expectedPrice * 2; // Different price to detect if called
        };

        const price = await client.getPrice(symbol);

        // Verify only primary API was called
        expect(primaryCalled).toBe(true);
        expect(secondaryCalled).toBe(false);

        // Verify the price from primary API was returned
        expect(price).toBe(expectedPrice);
      }),
      { numRuns: 20 }
    );
  });

  /**
   * Property test: Verify that when both APIs fail,
   * an error is thrown
   */
  it('should throw error when both primary and secondary APIs fail', async () => {
    const assetSymbolArb = fc.string({ 
      minLength: 1, 
      maxLength: 5,
      unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ')
    });

    await fc.assert(
      fc.asyncProperty(assetSymbolArb, async (symbol) => {
        let primaryCalled = false;
        let secondaryCalled = false;

        const client = new MarketAPIClient('primary-key', 'secondary-key');

        // Mock both APIs to fail
        (client as any).fetchPriceFromPrimaryAPI = async (_sym: string) => {
          primaryCalled = true;
          throw new Error('Primary API failure');
        };

        (client as any).fetchPriceFromSecondaryAPI = async (_sym: string) => {
          secondaryCalled = true;
          throw new Error('Secondary API failure');
        };

        // Expect getPrice to throw an error
        await expect(client.getPrice(symbol)).rejects.toThrow();

        // Verify both APIs were attempted
        expect(primaryCalled).toBe(true);
        expect(secondaryCalled).toBe(true);
      }),
      { numRuns: 20 }
    );
  });

  /**
   * Property test: Verify that when secondary API is not configured,
   * only primary API is attempted
   */
  it('should only attempt primary API when secondary is not configured', async () => {
    const assetSymbolArb = fc.string({ 
      minLength: 1, 
      maxLength: 5,
      unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ')
    });

    await fc.assert(
      fc.asyncProperty(assetSymbolArb, async (symbol) => {
        let primaryCalled = false;
        let secondaryCalled = false;

        // Create client without secondary API key
        const client = new MarketAPIClient('primary-key');

        // Mock the primary API to fail
        (client as any).fetchPriceFromPrimaryAPI = async (_sym: string) => {
          primaryCalled = true;
          throw new Error('Primary API failure');
        };

        // Mock the secondary API (should not be called)
        (client as any).fetchPriceFromSecondaryAPI = async (_sym: string) => {
          secondaryCalled = true;
          return 100;
        };

        // Expect getPrice to throw an error
        await expect(client.getPrice(symbol)).rejects.toThrow();

        // Verify only primary API was attempted
        expect(primaryCalled).toBe(true);
        expect(secondaryCalled).toBe(false);
      }),
      { numRuns: 20 }
    );
  });

  /**
   * Property test: Verify that invalid prices from secondary API
   * are rejected even when primary fails
   */
  it('should reject invalid prices from secondary API', async () => {
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
      fc.constant(-Infinity)
    );

    await fc.assert(
      fc.asyncProperty(assetSymbolArb, invalidPriceArb, async (symbol, invalidPrice) => {
        const client = new MarketAPIClient('primary-key', 'secondary-key');

        // Mock the primary API to fail
        (client as any).fetchPriceFromPrimaryAPI = async (_sym: string) => {
          throw new Error('Primary API failure');
        };

        // Mock the secondary API to return invalid price
        (client as any).fetchPriceFromSecondaryAPI = async (_sym: string) => {
          return invalidPrice;
        };

        // Expect getPrice to throw an error due to invalid price
        await expect(client.getPrice(symbol)).rejects.toThrow();
      }),
      { numRuns: 20 }
    );
  });

  /**
   * Property test: Verify that fallback works for batch price requests
   */
  it('should use fallback for each symbol independently in batch requests', async () => {
    // Generator for array of 2-5 symbols
    const symbolArrayArb = fc.array(
      fc.string({ 
        minLength: 1, 
        maxLength: 5,
        unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ')
      }),
      { minLength: 2, maxLength: 5 }
    ).map(symbols => Array.from(new Set(symbols))); // Ensure unique symbols

    const priceArb = fc.double({ 
      min: 0.01, 
      max: 10000, 
      noNaN: true,
      noDefaultInfinity: true
    });

    await fc.assert(
      fc.asyncProperty(symbolArrayArb, priceArb, async (symbols, basePrice) => {
        if (symbols.length === 0) return; // Skip empty arrays

        const primaryCallCounts = new Map<string, number>();
        const secondaryCallCounts = new Map<string, number>();

        const client = new MarketAPIClient('primary-key', 'secondary-key');

        // Mock primary API to fail for all symbols
        (client as any).fetchPriceFromPrimaryAPI = async (sym: string) => {
          primaryCallCounts.set(sym, (primaryCallCounts.get(sym) || 0) + 1);
          throw new Error('Primary API failure');
        };

        // Mock secondary API to succeed for all symbols
        (client as any).fetchPriceFromSecondaryAPI = async (sym: string) => {
          secondaryCallCounts.set(sym, (secondaryCallCounts.get(sym) || 0) + 1);
          return basePrice + symbols.indexOf(sym); // Unique price per symbol
        };

        const prices = await client.getPrices(symbols);

        // Verify all symbols got prices
        expect(prices.size).toBe(symbols.length);

        // Verify each symbol had both APIs called
        for (const symbol of symbols) {
          expect(primaryCallCounts.get(symbol)).toBe(1);
          expect(secondaryCallCounts.get(symbol)).toBe(1);
          expect(prices.has(symbol)).toBe(true);
        }
      }),
      { numRuns: 10 }
    );
  });
});

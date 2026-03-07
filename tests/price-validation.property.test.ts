import fc from 'fast-check';
import { MarketAPIClient } from '../src/services/MarketAPIClient';

/**
 * Property-Based Tests for Price Validation
 * Feature: vti-gap-trading-alert
 * Task 4.3: Write property test for price validation
 * 
 * These tests validate that the system correctly validates prices
 * and rejects invalid values.
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

describe('Property 17: Price Validation', () => {
  /**
   * **Validates: Requirements 7.3**
   * 
   * Property: For any price obtained from an API, the system should only
   * accept it as valid if it is a positive number greater than zero.
   * 
   * This property ensures data quality by rejecting invalid price values.
   */
  it('should accept only positive numbers greater than zero as valid prices', async () => {
    // Generator for valid prices (positive numbers > 0)
    const validPriceArb = fc.double({ 
      min: 0.01, 
      max: 100000, 
      noNaN: true,
      noDefaultInfinity: true
    });

    // Generator for valid asset symbols
    const assetSymbolArb = fc.string({ 
      minLength: 1, 
      maxLength: 5,
      unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ')
    });

    await fc.assert(
      fc.asyncProperty(assetSymbolArb, validPriceArb, async (symbol, validPrice) => {
        const client = new MarketAPIClient('primary-key');

        // Mock the API to return a valid price
        (client as any).fetchPriceFromPrimaryAPI = async (_sym: string) => {
          return validPrice;
        };

        // Should successfully return the valid price
        const price = await client.getPrice(symbol);
        expect(price).toBe(validPrice);
        expect(price).toBeGreaterThan(0);
        expect(typeof price).toBe('number');
        expect(isFinite(price)).toBe(true);
        expect(isNaN(price)).toBe(false);
      }),
      { numRuns: 20 }
    );
  });

  /**
   * Property test: Verify that the isValidPrice method correctly
   * identifies valid prices across all positive numbers
   */
  it('should identify all positive numbers greater than zero as valid', () => {
    const validPriceArb = fc.double({ 
      min: 0.01, 
      max: 100000, 
      noNaN: true,
      noDefaultInfinity: true
    });

    fc.assert(
      fc.property(validPriceArb, (price) => {
        const client = new MarketAPIClient('primary-key');
        
        // Access private method for testing
        const isValid = (client as any).isValidPrice(price);
        
        expect(isValid).toBe(true);
      }),
      { numRuns: 20 }
    );
  });

  /**
   * Property test: Verify that very small positive prices are accepted
   */
  it('should accept very small positive prices', async () => {
    const smallPriceArb = fc.double({ 
      min: 0.000001, 
      max: 0.01, 
      noNaN: true,
      noDefaultInfinity: true
    });

    const assetSymbolArb = fc.string({ 
      minLength: 1, 
      maxLength: 5,
      unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ')
    });

    await fc.assert(
      fc.asyncProperty(assetSymbolArb, smallPriceArb, async (symbol, smallPrice) => {
        const client = new MarketAPIClient('primary-key');

        (client as any).fetchPriceFromPrimaryAPI = async (_sym: string) => {
          return smallPrice;
        };

        const price = await client.getPrice(symbol);
        expect(price).toBe(smallPrice);
        expect(price).toBeGreaterThan(0);
      }),
      { numRuns: 20 }
    );
  });

  /**
   * Property test: Verify that very large positive prices are accepted
   */
  it('should accept very large positive prices', async () => {
    const largePriceArb = fc.double({ 
      min: 10000, 
      max: 1000000, 
      noNaN: true,
      noDefaultInfinity: true
    });

    const assetSymbolArb = fc.string({ 
      minLength: 1, 
      maxLength: 5,
      unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ')
    });

    await fc.assert(
      fc.asyncProperty(assetSymbolArb, largePriceArb, async (symbol, largePrice) => {
        const client = new MarketAPIClient('primary-key');

        (client as any).fetchPriceFromPrimaryAPI = async (_sym: string) => {
          return largePrice;
        };

        const price = await client.getPrice(symbol);
        expect(price).toBe(largePrice);
        expect(price).toBeGreaterThan(0);
      }),
      { numRuns: 20 }
    );
  });
});

describe('Property 18: Invalid Price Rejection', () => {
  /**
   * **Validates: Requirements 7.4**
   * 
   * Property: For any asset where an invalid price is obtained (negative, zero,
   * or non-numeric), the system should not update the base price or current price
   * for that asset and should log an error.
   * 
   * This property ensures the system rejects bad data and maintains data integrity.
   */
  it('should reject negative prices', async () => {
    const negativePriceArb = fc.double({ 
      max: -0.01, 
      noNaN: true,
      noDefaultInfinity: true
    });

    const assetSymbolArb = fc.string({ 
      minLength: 1, 
      maxLength: 5,
      unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ')
    });

    await fc.assert(
      fc.asyncProperty(assetSymbolArb, negativePriceArb, async (symbol, negativePrice) => {
        const client = new MarketAPIClient('primary-key');

        // Mock the API to return a negative price
        (client as any).fetchPriceFromPrimaryAPI = async (_sym: string) => {
          return negativePrice;
        };

        // Should throw an error for invalid price
        await expect(client.getPrice(symbol)).rejects.toThrow(/Invalid price/);
      }),
      { numRuns: 20 }
    );
  });

  /**
   * Property test: Verify that zero prices are rejected
   */
  it('should reject zero prices', async () => {
    const assetSymbolArb = fc.string({ 
      minLength: 1, 
      maxLength: 5,
      unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ')
    });

    await fc.assert(
      fc.asyncProperty(assetSymbolArb, async (symbol) => {
        const client = new MarketAPIClient('primary-key');

        // Mock the API to return zero
        (client as any).fetchPriceFromPrimaryAPI = async (_sym: string) => {
          return 0;
        };

        // Should throw an error for invalid price
        await expect(client.getPrice(symbol)).rejects.toThrow(/Invalid price/);
      }),
      { numRuns: 20 }
    );
  });

  /**
   * Property test: Verify that NaN is rejected
   */
  it('should reject NaN prices', async () => {
    const assetSymbolArb = fc.string({ 
      minLength: 1, 
      maxLength: 5,
      unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ')
    });

    await fc.assert(
      fc.asyncProperty(assetSymbolArb, async (symbol) => {
        const client = new MarketAPIClient('primary-key');

        // Mock the API to return NaN
        (client as any).fetchPriceFromPrimaryAPI = async (_sym: string) => {
          return NaN;
        };

        // Should throw an error for invalid price
        await expect(client.getPrice(symbol)).rejects.toThrow(/Invalid price/);
      }),
      { numRuns: 20 }
    );
  });

  /**
   * Property test: Verify that Infinity is rejected
   */
  it('should reject Infinity prices', async () => {
    const assetSymbolArb = fc.string({ 
      minLength: 1, 
      maxLength: 5,
      unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ')
    });

    const infinityArb = fc.constantFrom(Infinity, -Infinity);

    await fc.assert(
      fc.asyncProperty(assetSymbolArb, infinityArb, async (symbol, infinityValue) => {
        const client = new MarketAPIClient('primary-key');

        // Mock the API to return Infinity
        (client as any).fetchPriceFromPrimaryAPI = async (_sym: string) => {
          return infinityValue;
        };

        // Should throw an error for invalid price
        await expect(client.getPrice(symbol)).rejects.toThrow(/Invalid price/);
      }),
      { numRuns: 20 }
    );
  });

  /**
   * Property test: Verify that all invalid price types are rejected
   */
  it('should reject all invalid price types', async () => {
    const assetSymbolArb = fc.string({ 
      minLength: 1, 
      maxLength: 5,
      unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ')
    });

    // Generator for all types of invalid prices
    const invalidPriceArb = fc.oneof(
      fc.constant(0),
      fc.constant(-1),
      fc.constant(-100),
      fc.double({ max: -0.01, noNaN: true, noDefaultInfinity: true }),
      fc.constant(NaN),
      fc.constant(Infinity),
      fc.constant(-Infinity)
    );

    await fc.assert(
      fc.asyncProperty(assetSymbolArb, invalidPriceArb, async (symbol, invalidPrice) => {
        const client = new MarketAPIClient('primary-key');

        // Mock the API to return an invalid price
        (client as any).fetchPriceFromPrimaryAPI = async (_sym: string) => {
          return invalidPrice;
        };

        // Should throw an error for invalid price
        await expect(client.getPrice(symbol)).rejects.toThrow(/Invalid price/);
      }),
      { numRuns: 20 }
    );
  });

  /**
   * Property test: Verify that isValidPrice correctly identifies invalid prices
   */
  it('should identify all invalid prices as invalid', () => {
    const invalidPriceArb = fc.oneof(
      fc.constant(0),
      fc.constant(-1),
      fc.constant(-100),
      fc.double({ max: -0.01, noNaN: true, noDefaultInfinity: true }),
      fc.constant(NaN),
      fc.constant(Infinity),
      fc.constant(-Infinity)
    );

    fc.assert(
      fc.property(invalidPriceArb, (price) => {
        const client = new MarketAPIClient('primary-key');
        
        // Access private method for testing
        const isValid = (client as any).isValidPrice(price);
        
        expect(isValid).toBe(false);
      }),
      { numRuns: 20 }
    );
  });

  /**
   * Property test: Verify that invalid prices from secondary API are also rejected
   */
  it('should reject invalid prices from secondary API', async () => {
    const assetSymbolArb = fc.string({ 
      minLength: 1, 
      maxLength: 5,
      unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ')
    });

    const invalidPriceArb = fc.oneof(
      fc.constant(0),
      fc.constant(-1),
      fc.double({ max: -0.01, noNaN: true, noDefaultInfinity: true }),
      fc.constant(NaN),
      fc.constant(Infinity),
      fc.constant(-Infinity)
    );

    await fc.assert(
      fc.asyncProperty(assetSymbolArb, invalidPriceArb, async (symbol, invalidPrice) => {
        const client = new MarketAPIClient('primary-key', 'secondary-key');

        // Mock primary API to fail
        (client as any).fetchPriceFromPrimaryAPI = async (_sym: string) => {
          throw new Error('Primary API failure');
        };

        // Mock secondary API to return invalid price
        (client as any).fetchPriceFromSecondaryAPI = async (_sym: string) => {
          return invalidPrice;
        };

        // Should throw an error for invalid price from secondary API
        await expect(client.getPrice(symbol)).rejects.toThrow();
      }),
      { numRuns: 20 }
    );
  });

  /**
   * Property test: Verify that batch requests handle invalid prices correctly
   * Invalid prices should not be included in the result map
   */
  it('should exclude assets with invalid prices from batch results', async () => {
    // Generator for array of 2-5 symbols
    const symbolArrayArb = fc.array(
      fc.string({ 
        minLength: 1, 
        maxLength: 5,
        unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ')
      }),
      { minLength: 2, maxLength: 5 }
    ).map(symbols => Array.from(new Set(symbols))); // Ensure unique symbols

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
      fc.constant(Infinity)
    );

    await fc.assert(
      fc.asyncProperty(
        symbolArrayArb, 
        validPriceArb, 
        invalidPriceArb, 
        async (symbols, validPrice, invalidPrice) => {
          if (symbols.length < 2) return; // Need at least 2 symbols

          const client = new MarketAPIClient('primary-key');

          // Mock API to return valid price for first symbol, invalid for rest
          (client as any).fetchPriceFromPrimaryAPI = async (sym: string) => {
            if (sym === symbols[0]) {
              return validPrice;
            } else {
              return invalidPrice;
            }
          };

          const prices = await client.getPrices(symbols);

          // Only the first symbol should be in the result
          expect(prices.size).toBe(1);
          expect(prices.has(symbols[0])).toBe(true);
          expect(prices.get(symbols[0])).toBe(validPrice);

          // Invalid price symbols should not be in the result
          for (let i = 1; i < symbols.length; i++) {
            expect(prices.has(symbols[i])).toBe(false);
          }
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property test: Verify that mixed valid and invalid prices are handled correctly
   */
  it('should handle mixed valid and invalid prices in batch requests', async () => {
    const symbolArrayArb = fc.array(
      fc.string({ 
        minLength: 1, 
        maxLength: 5,
        unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ')
      }),
      { minLength: 3, maxLength: 6 }
    ).map(symbols => Array.from(new Set(symbols))); // Ensure unique symbols

    const validPriceArb = fc.double({ 
      min: 0.01, 
      max: 10000, 
      noNaN: true,
      noDefaultInfinity: true
    });

    await fc.assert(
      fc.asyncProperty(symbolArrayArb, validPriceArb, async (symbols, basePrice) => {
        if (symbols.length < 3) return; // Need at least 3 symbols

        const client = new MarketAPIClient('primary-key');

        // Create a map of which symbols should have valid prices
        const validSymbols = new Set([symbols[0], symbols[2]]); // First and third are valid

        // Mock API to return valid prices for some symbols, invalid for others
        (client as any).fetchPriceFromPrimaryAPI = async (sym: string) => {
          if (validSymbols.has(sym)) {
            return basePrice + symbols.indexOf(sym);
          } else {
            return -1; // Invalid price
          }
        };

        const prices = await client.getPrices(symbols);

        // Only valid symbols should be in the result
        expect(prices.size).toBe(validSymbols.size);
        
        for (const symbol of symbols) {
          if (validSymbols.has(symbol)) {
            expect(prices.has(symbol)).toBe(true);
            expect(prices.get(symbol)).toBeGreaterThan(0);
          } else {
            expect(prices.has(symbol)).toBe(false);
          }
        }
      }),
      { numRuns: 10 }
    );
  });
});

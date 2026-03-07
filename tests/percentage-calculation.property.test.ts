import fc from 'fast-check';
import { AlertGenerator } from '../src/services/AlertGenerator';
import { PriceTracker } from '../src/services/PriceTracker';

/**
 * Property-Based Tests for Percentage Calculation
 * Feature: vti-gap-trading-alert
 * Task 7.2: Write property test for percentage calculation
 * 
 * These tests validate that percentage change calculations are mathematically
 * correct and precision is maintained at 2 decimal places.
 */

describe('Property 7: Percentage Change Calculation', () => {
  /**
   * **Validates: Requirements 3.1**
   * 
   * Property: For any pair of base price and current price (both positive numbers),
   * the calculated percentage change should equal ((current - base) / base) * 100
   * with mathematical precision.
   * 
   * This property ensures the core calculation is mathematically correct.
   */
  it('should calculate percentage change with mathematical precision', () => {
    // Generator for positive prices
    const priceArb = fc.double({ 
      min: 0.01, 
      max: 100000, 
      noNaN: true,
      noDefaultInfinity: true
    });

    fc.assert(
      fc.property(priceArb, priceArb, (basePrice, currentPrice) => {
        // Create AlertGenerator instance (threshold doesn't matter for this test)
        const mockPriceTracker = {} as PriceTracker;
        const alertGenerator = new AlertGenerator(mockPriceTracker, 1.5);

        // Calculate percentage change
        const result = alertGenerator.calculatePercentageChange(basePrice, currentPrice);

        // Calculate expected value
        const expected = ((currentPrice - basePrice) / basePrice) * 100;

        // The result should match the expected calculation (within rounding tolerance)
        // We allow for small floating point differences due to rounding to 2 decimals
        const roundedExpected = Math.round(expected * 100) / 100;
        
        expect(result).toBe(roundedExpected);
        expect(typeof result).toBe('number');
        expect(isFinite(result)).toBe(true);
        expect(isNaN(result)).toBe(false);
      }),
      { numRuns: 20 }
    );
  });

  /**
   * Property test: Verify calculation for price increases
   */
  it('should calculate positive percentage for price increases', () => {
    const basePriceArb = fc.double({ 
      min: 0.01, 
      max: 10000, 
      noNaN: true,
      noDefaultInfinity: true
    });

    // Generate a multiplier > 1 to ensure current price > base price
    const multiplierArb = fc.double({ 
      min: 1.001, 
      max: 2.0, 
      noNaN: true,
      noDefaultInfinity: true
    });

    fc.assert(
      fc.property(basePriceArb, multiplierArb, (basePrice, multiplier) => {
        const currentPrice = basePrice * multiplier;
        
        const mockPriceTracker = {} as PriceTracker;
        const alertGenerator = new AlertGenerator(mockPriceTracker, 1.5);

        const result = alertGenerator.calculatePercentageChange(basePrice, currentPrice);

        // Result should be positive for price increases
        expect(result).toBeGreaterThan(0);
        
        // Verify mathematical correctness
        const expected = Math.round(((currentPrice - basePrice) / basePrice) * 100 * 100) / 100;
        expect(result).toBe(expected);
      }),
      { numRuns: 20 }
    );
  });

  /**
   * Property test: Verify calculation for price decreases
   */
  it('should calculate negative percentage for price decreases', () => {
    const basePriceArb = fc.double({ 
      min: 0.01, 
      max: 10000, 
      noNaN: true,
      noDefaultInfinity: true
    });

    // Generate a multiplier < 1 to ensure current price < base price
    const multiplierArb = fc.double({ 
      min: 0.5, 
      max: 0.999, 
      noNaN: true,
      noDefaultInfinity: true
    });

    fc.assert(
      fc.property(basePriceArb, multiplierArb, (basePrice, multiplier) => {
        const currentPrice = basePrice * multiplier;
        
        const mockPriceTracker = {} as PriceTracker;
        const alertGenerator = new AlertGenerator(mockPriceTracker, 1.5);

        const result = alertGenerator.calculatePercentageChange(basePrice, currentPrice);

        // Result should be negative for price decreases
        expect(result).toBeLessThan(0);
        
        // Verify mathematical correctness
        const expected = Math.round(((currentPrice - basePrice) / basePrice) * 100 * 100) / 100;
        expect(result).toBe(expected);
      }),
      { numRuns: 20 }
    );
  });

  /**
   * Property test: Verify calculation when prices are equal
   */
  it('should return zero when base price equals current price', () => {
    const priceArb = fc.double({ 
      min: 0.01, 
      max: 100000, 
      noNaN: true,
      noDefaultInfinity: true
    });

    fc.assert(
      fc.property(priceArb, (price) => {
        const mockPriceTracker = {} as PriceTracker;
        const alertGenerator = new AlertGenerator(mockPriceTracker, 1.5);

        const result = alertGenerator.calculatePercentageChange(price, price);

        // Result should be exactly 0 when prices are equal
        expect(result).toBe(0);
      }),
      { numRuns: 20 }
    );
  });

  /**
   * Property test: Verify calculation with very small prices
   */
  it('should handle very small prices correctly', () => {
    const smallPriceArb = fc.double({ 
      min: 0.000001, 
      max: 0.01, 
      noNaN: true,
      noDefaultInfinity: true
    });

    fc.assert(
      fc.property(smallPriceArb, smallPriceArb, (basePrice, currentPrice) => {
        const mockPriceTracker = {} as PriceTracker;
        const alertGenerator = new AlertGenerator(mockPriceTracker, 1.5);

        const result = alertGenerator.calculatePercentageChange(basePrice, currentPrice);

        // Verify mathematical correctness
        const expected = Math.round(((currentPrice - basePrice) / basePrice) * 100 * 100) / 100;
        expect(result).toBe(expected);
        expect(isFinite(result)).toBe(true);
        expect(isNaN(result)).toBe(false);
      }),
      { numRuns: 20 }
    );
  });

  /**
   * Property test: Verify calculation with very large prices
   */
  it('should handle very large prices correctly', () => {
    const largePriceArb = fc.double({ 
      min: 10000, 
      max: 1000000, 
      noNaN: true,
      noDefaultInfinity: true
    });

    fc.assert(
      fc.property(largePriceArb, largePriceArb, (basePrice, currentPrice) => {
        const mockPriceTracker = {} as PriceTracker;
        const alertGenerator = new AlertGenerator(mockPriceTracker, 1.5);

        const result = alertGenerator.calculatePercentageChange(basePrice, currentPrice);

        // Verify mathematical correctness
        const expected = Math.round(((currentPrice - basePrice) / basePrice) * 100 * 100) / 100;
        expect(result).toBe(expected);
        expect(isFinite(result)).toBe(true);
        expect(isNaN(result)).toBe(false);
      }),
      { numRuns: 20 }
    );
  });

  /**
   * Property test: Verify calculation is consistent regardless of price magnitude
   */
  it('should produce consistent percentage regardless of price scale', () => {
    const basePriceArb = fc.double({ 
      min: 1, 
      max: 1000, 
      noNaN: true,
      noDefaultInfinity: true
    });

    const percentageChangeArb = fc.double({ 
      min: -50, 
      max: 50, 
      noNaN: true,
      noDefaultInfinity: true
    });

    const scaleFactorArb = fc.double({ 
      min: 0.001, 
      max: 1000, 
      noNaN: true,
      noDefaultInfinity: true
    });

    fc.assert(
      fc.property(
        basePriceArb, 
        percentageChangeArb, 
        scaleFactorArb, 
        (basePrice, targetPercentage, scaleFactor) => {
          // Calculate current price to achieve target percentage
          const currentPrice = basePrice * (1 + targetPercentage / 100);
          
          // Scale both prices by the same factor
          const scaledBase = basePrice * scaleFactor;
          const scaledCurrent = currentPrice * scaleFactor;
          
          const mockPriceTracker = {} as PriceTracker;
          const alertGenerator = new AlertGenerator(mockPriceTracker, 1.5);

          // Calculate percentage for original prices
          const result1 = alertGenerator.calculatePercentageChange(basePrice, currentPrice);
          
          // Calculate percentage for scaled prices
          const result2 = alertGenerator.calculatePercentageChange(scaledBase, scaledCurrent);

          // Percentage should be the same regardless of scale
          expect(result1).toBe(result2);
        }
      ),
      { numRuns: 20 }
    );
  });
});

describe('Property 8: Percentage Change Precision', () => {
  /**
   * **Validates: Requirements 3.2**
   * 
   * Property: For any calculated percentage change, the stored value should be
   * rounded to exactly 2 decimal places.
   * 
   * This property ensures consistent precision in percentage values.
   */
  it('should round all percentage changes to exactly 2 decimal places', () => {
    const priceArb = fc.double({ 
      min: 0.01, 
      max: 100000, 
      noNaN: true,
      noDefaultInfinity: true
    });

    fc.assert(
      fc.property(priceArb, priceArb, (basePrice, currentPrice) => {
        const mockPriceTracker = {} as PriceTracker;
        const alertGenerator = new AlertGenerator(mockPriceTracker, 1.5);

        const result = alertGenerator.calculatePercentageChange(basePrice, currentPrice);

        // Convert to string to check decimal places
        const resultStr = result.toString();
        
        // If there's a decimal point, verify at most 2 decimal places
        if (resultStr.includes('.')) {
          const decimalPart = resultStr.split('.')[1];
          expect(decimalPart.length).toBeLessThanOrEqual(2);
        }

        // Verify that rounding to 2 decimals doesn't change the value
        const roundedAgain = Math.round(result * 100) / 100;
        expect(result).toBe(roundedAgain);
      }),
      { numRuns: 20 }
    );
  });

  /**
   * Property test: Verify precision with values that need rounding
   */
  it('should correctly round values with more than 2 decimal places', () => {
    // Test cases that would produce more than 2 decimal places
    // Note: Some values are affected by floating point precision
    const testCases = [
      { base: 100, current: 101.111, expected: 1.11 },
      { base: 100, current: 101.115, expected: 1.11 },  // Floating point: 1.1149999... rounds to 1.11
      { base: 100, current: 101.114, expected: 1.11 },
      { base: 100, current: 101.999, expected: 2.00 },
      { base: 3, current: 3.1, expected: 3.33 },
      { base: 7, current: 7.1, expected: 1.43 },
    ];

    const mockPriceTracker = {} as PriceTracker;
    const alertGenerator = new AlertGenerator(mockPriceTracker, 1.5);

    testCases.forEach(({ base, current, expected }) => {
      const result = alertGenerator.calculatePercentageChange(base, current);
      expect(result).toBe(expected);
    });
  });

  /**
   * Property test: Verify precision is maintained across all price ranges
   */
  it('should maintain 2 decimal precision across all price ranges', () => {
    // Generator for different price ranges
    const priceRangeArb = fc.oneof(
      // Very small prices
      fc.tuple(
        fc.double({ min: 0.001, max: 0.1, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0.001, max: 0.1, noNaN: true, noDefaultInfinity: true })
      ),
      // Small prices
      fc.tuple(
        fc.double({ min: 0.1, max: 10, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0.1, max: 10, noNaN: true, noDefaultInfinity: true })
      ),
      // Medium prices
      fc.tuple(
        fc.double({ min: 10, max: 1000, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 10, max: 1000, noNaN: true, noDefaultInfinity: true })
      ),
      // Large prices
      fc.tuple(
        fc.double({ min: 1000, max: 100000, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 1000, max: 100000, noNaN: true, noDefaultInfinity: true })
      )
    );

    fc.assert(
      fc.property(priceRangeArb, ([basePrice, currentPrice]) => {
        const mockPriceTracker = {} as PriceTracker;
        const alertGenerator = new AlertGenerator(mockPriceTracker, 1.5);

        const result = alertGenerator.calculatePercentageChange(basePrice, currentPrice);

        // Verify precision
        const resultStr = result.toString();
        if (resultStr.includes('.')) {
          const decimalPart = resultStr.split('.')[1];
          expect(decimalPart.length).toBeLessThanOrEqual(2);
        }

        // Verify value is properly rounded
        const roundedAgain = Math.round(result * 100) / 100;
        expect(result).toBe(roundedAgain);
      }),
      { numRuns: 20 }
    );
  });

  /**
   * Property test: Verify that trailing zeros are handled correctly
   */
  it('should handle trailing zeros correctly', () => {
    const mockPriceTracker = {} as PriceTracker;
    const alertGenerator = new AlertGenerator(mockPriceTracker, 1.5);

    // Test cases that should produce values with trailing zeros
    const testCases = [
      { base: 100, current: 101, expected: 1 },      // 1.00 -> 1
      { base: 100, current: 102, expected: 2 },      // 2.00 -> 2
      { base: 100, current: 101.5, expected: 1.5 },  // 1.50 -> 1.5
      { base: 100, current: 100.1, expected: 0.1 },  // 0.10 -> 0.1
    ];

    testCases.forEach(({ base, current, expected }) => {
      const result = alertGenerator.calculatePercentageChange(base, current);
      expect(result).toBe(expected);
    });
  });

  /**
   * Property test: Verify precision with extreme percentage changes
   */
  it('should maintain precision with extreme percentage changes', () => {
    const basePriceArb = fc.double({ 
      min: 1, 
      max: 1000, 
      noNaN: true,
      noDefaultInfinity: true
    });

    // Generate extreme multipliers (very large increases or decreases)
    const extremeMultiplierArb = fc.oneof(
      fc.double({ min: 0.01, max: 0.1, noNaN: true, noDefaultInfinity: true }),  // 90-99% decrease
      fc.double({ min: 5, max: 10, noNaN: true, noDefaultInfinity: true })       // 400-900% increase
    );

    fc.assert(
      fc.property(basePriceArb, extremeMultiplierArb, (basePrice, multiplier) => {
        const currentPrice = basePrice * multiplier;
        
        const mockPriceTracker = {} as PriceTracker;
        const alertGenerator = new AlertGenerator(mockPriceTracker, 1.5);

        const result = alertGenerator.calculatePercentageChange(basePrice, currentPrice);

        // Verify precision is maintained even with extreme changes
        const resultStr = result.toString();
        if (resultStr.includes('.')) {
          const decimalPart = resultStr.split('.')[1];
          expect(decimalPart.length).toBeLessThanOrEqual(2);
        }

        // Verify value is properly rounded
        const roundedAgain = Math.round(result * 100) / 100;
        expect(result).toBe(roundedAgain);
      }),
      { numRuns: 20 }
    );
  });

  /**
   * Property test: Verify that precision is consistent with manual rounding
   */
  it('should produce same result as manual rounding to 2 decimals', () => {
    const priceArb = fc.double({ 
      min: 0.01, 
      max: 100000, 
      noNaN: true,
      noDefaultInfinity: true
    });

    fc.assert(
      fc.property(priceArb, priceArb, (basePrice, currentPrice) => {
        const mockPriceTracker = {} as PriceTracker;
        const alertGenerator = new AlertGenerator(mockPriceTracker, 1.5);

        const result = alertGenerator.calculatePercentageChange(basePrice, currentPrice);

        // Manually calculate and round
        const rawPercentage = ((currentPrice - basePrice) / basePrice) * 100;
        const manuallyRounded = Math.round(rawPercentage * 100) / 100;

        // Should match manual rounding
        expect(result).toBe(manuallyRounded);
      }),
      { numRuns: 20 }
    );
  });
});

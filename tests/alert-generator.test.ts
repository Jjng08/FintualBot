/**
 * Unit tests for AlertGenerator
 * Tests specific examples and edge cases for alert generation logic
 */

import { AlertGenerator } from '../src/services/AlertGenerator';
import { IPriceTracker, SignalData } from '../src/services/PriceTracker';

// Mock PriceTracker
class MockPriceTracker implements IPriceTracker {
  private signals: Map<string, SignalData[]> = new Map();
  private lastFintualPrices: Map<string, number> = new Map();

  async saveSignal(signal: SignalData): Promise<void> {
    const assetSignals = this.signals.get(signal.asset) || [];
    assetSignals.push(signal);
    this.signals.set(signal.asset, assetSignals);
  }

  async getSignalsByAsset(asset: string, _date?: Date): Promise<any[]> {
    return this.signals.get(asset) || [];
  }

  async getLastFintualPrice(asset: string): Promise<number | null> {
    return this.lastFintualPrices.get(asset) || null;
  }

  async hasSignalToday(asset: string): Promise<boolean> {
    const signals = this.signals.get(asset) || [];
    if (signals.length === 0) return false;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return signals.some(signal => {
      const signalDate = new Date(signal.createAt || new Date());
      signalDate.setHours(0, 0, 0, 0);
      return signalDate.getTime() === today.getTime();
    });
  }

  // Helper methods for testing
  setLastFintualPrice(asset: string, price: number): void {
    this.lastFintualPrices.set(asset, price);
  }

  reset(): void {
    this.signals.clear();
    this.lastFintualPrices.clear();
  }
}

describe('AlertGenerator', () => {
  let mockTracker: MockPriceTracker;
  let alertGenerator: AlertGenerator;

  beforeEach(() => {
    mockTracker = new MockPriceTracker();
    alertGenerator = new AlertGenerator(mockTracker, 1.5);
  });

  describe('calculatePercentageChange', () => {
    it('should calculate percentage change correctly', () => {
      // Test case: 100 -> 102 = 2%
      expect(alertGenerator.calculatePercentageChange(100, 102)).toBe(2.0);
    });

    it('should calculate negative percentage change', () => {
      // Test case: 100 -> 98 = -2%
      expect(alertGenerator.calculatePercentageChange(100, 98)).toBe(-2.0);
    });

    it('should round to 2 decimal places', () => {
      // Test case: 100 -> 101.555 = 1.555% -> 1.56%
      expect(alertGenerator.calculatePercentageChange(100, 101.555)).toBe(1.56);
    });

    it('should handle small price changes', () => {
      // Test case: 100 -> 100.01 = 0.01%
      expect(alertGenerator.calculatePercentageChange(100, 100.01)).toBe(0.01);
    });

    it('should handle large price changes', () => {
      // Test case: 100 -> 150 = 50%
      expect(alertGenerator.calculatePercentageChange(100, 150)).toBe(50.0);
    });

    it('should calculate percentage at exactly 1.5% threshold', () => {
      // Test case: 100 -> 101.5 = 1.5%
      expect(alertGenerator.calculatePercentageChange(100, 101.5)).toBe(1.5);
    });
  });

  describe('hasAlertedToday', () => {
    it('should return false when no signals exist', async () => {
      const result = await alertGenerator.hasAlertedToday('VTI');
      expect(result).toBe(false);
    });

    it('should return true when signal exists today', async () => {
      await mockTracker.saveSignal({
        asset: 'VTI',
        marketPrice: 102,
        fintualPrice: 100,
        diff: 2.0,
        createAt: new Date()
      });

      const result = await alertGenerator.hasAlertedToday('VTI');
      expect(result).toBe(true);
    });

    it('should return false for different asset', async () => {
      await mockTracker.saveSignal({
        asset: 'SPY',
        marketPrice: 202,
        fintualPrice: 200,
        diff: 1.0,
        createAt: new Date()
      });

      const result = await alertGenerator.hasAlertedToday('VTI');
      expect(result).toBe(false);
    });
  });

  describe('evaluateAsset', () => {
    it('should create signal when change >= threshold and not alerted', async () => {
      const signal = await alertGenerator.evaluateAsset('VTI', 100, 102);

      expect(signal).not.toBeNull();
      expect(signal?.asset).toBe('VTI');
      expect(signal?.marketPrice).toBe(102);
      expect(signal?.diff).toBe(2.0);
      expect(signal?.fintualPrice).toBe(100); // No previous price, uses base
    });

    it('should create signal at exactly 1.5% threshold', async () => {
      const signal = await alertGenerator.evaluateAsset('VTI', 100, 101.5);

      expect(signal).not.toBeNull();
      expect(signal?.diff).toBe(1.5);
    });

    it('should not create signal when change < threshold', async () => {
      const signal = await alertGenerator.evaluateAsset('VTI', 100, 101);

      expect(signal).toBeNull();
    });

    it('should not create signal when already alerted today', async () => {
      // First alert
      const signal1 = await alertGenerator.evaluateAsset('VTI', 100, 102);
      expect(signal1).not.toBeNull();
      await mockTracker.saveSignal(signal1!);

      // Second attempt
      const signal2 = await alertGenerator.evaluateAsset('VTI', 100, 103);
      expect(signal2).toBeNull();
    });

    it('should estimate fintualPrice using last known price', async () => {
      mockTracker.setLastFintualPrice('VTI', 100);

      const signal = await alertGenerator.evaluateAsset('VTI', 100, 102);

      expect(signal).not.toBeNull();
      // Last Fintual price was 100, with 2% increase = 102
      expect(signal?.fintualPrice).toBe(102);
    });

    it('should use basePrice when no previous Fintual price exists', async () => {
      const signal = await alertGenerator.evaluateAsset('NEWASSET', 150, 153);

      expect(signal).not.toBeNull();
      expect(signal?.fintualPrice).toBe(150); // Uses base price
    });

    it('should handle negative price changes', async () => {
      const signal = await alertGenerator.evaluateAsset('VTI', 100, 98);

      expect(signal).toBeNull(); // -2% is below threshold
    });

    it('should create independent signals for different assets', async () => {
      const signal1 = await alertGenerator.evaluateAsset('VTI', 100, 102);
      expect(signal1).not.toBeNull();
      await mockTracker.saveSignal(signal1!);

      const signal2 = await alertGenerator.evaluateAsset('SPY', 200, 204);
      expect(signal2).not.toBeNull();
      expect(signal2?.asset).toBe('SPY');
    });

    it('should include timestamp in signal', async () => {
      const beforeTime = new Date();
      const signal = await alertGenerator.evaluateAsset('VTI', 100, 102);
      const afterTime = new Date();

      expect(signal).not.toBeNull();
      expect(signal?.createAt).toBeDefined();
      expect(signal!.createAt!.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
      expect(signal!.createAt!.getTime()).toBeLessThanOrEqual(afterTime.getTime());
    });

    it('should handle large percentage changes', async () => {
      const signal = await alertGenerator.evaluateAsset('VTI', 100, 110);

      expect(signal).not.toBeNull();
      expect(signal?.diff).toBe(10.0);
    });

    it('should round diff to 2 decimal places in signal', async () => {
      const signal = await alertGenerator.evaluateAsset('VTI', 100, 101.555);

      expect(signal).not.toBeNull();
      expect(signal?.diff).toBe(1.56);
    });
  });

  describe('Custom threshold', () => {
    it('should respect custom threshold value', async () => {
      const customGenerator = new AlertGenerator(mockTracker, 2.0);

      // 1.5% should not trigger with 2.0% threshold
      const signal1 = await customGenerator.evaluateAsset('VTI', 100, 101.5);
      expect(signal1).toBeNull();

      // 2.0% should trigger
      const signal2 = await customGenerator.evaluateAsset('VTI', 100, 102);
      expect(signal2).not.toBeNull();
    });
  });
});

/**
 * Unit Tests for AssetMonitor
 * Tests specific examples and edge cases for asset price monitoring
 */

import { AssetMonitor } from '../src/services/AssetMonitor';
import { IMarketAPIClient } from '../src/services/MarketAPIClient';

/**
 * Mock implementation of MarketAPIClient for testing
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

describe('AssetMonitor', () => {
  let mockClient: MockMarketAPIClient;

  beforeEach(() => {
    mockClient = new MockMarketAPIClient();
  });

  describe('initializeBasePrices', () => {
    it('should initialize base prices for all assets', async () => {
      mockClient.setPrices({
        'VTI': 100.50,
        'SPY': 200.75,
        'QQQ': 150.25
      });

      const monitor = new AssetMonitor(mockClient, ['VTI', 'SPY', 'QQQ']);
      const basePrices = await monitor.initializeBasePrices();

      expect(basePrices.size).toBe(3);
      expect(basePrices.get('VTI')).toBe(100.50);
      expect(basePrices.get('SPY')).toBe(200.75);
      expect(basePrices.get('QQQ')).toBe(150.25);
    });

    it('should store base prices in cache', async () => {
      mockClient.setPrices({ 'VTI': 100.50 });

      const monitor = new AssetMonitor(mockClient, ['VTI']);
      await monitor.initializeBasePrices();

      expect(monitor.getBasePrice('VTI')).toBe(100.50);
    });

    it('should handle single asset', async () => {
      mockClient.setPrices({ 'VTI': 100.50 });

      const monitor = new AssetMonitor(mockClient, ['VTI']);
      const basePrices = await monitor.initializeBasePrices();

      expect(basePrices.size).toBe(1);
      expect(basePrices.get('VTI')).toBe(100.50);
    });

    it('should continue with other assets when one fails', async () => {
      mockClient.setPrices({
        'VTI': 100.50,
        'SPY': 200.75,
        'QQQ': 150.25
      });
      mockClient.setFailure('SPY');

      const monitor = new AssetMonitor(mockClient, ['VTI', 'SPY', 'QQQ']);
      const basePrices = await monitor.initializeBasePrices();

      expect(basePrices.size).toBe(2);
      expect(basePrices.get('VTI')).toBe(100.50);
      expect(basePrices.get('SPY')).toBeUndefined();
      expect(basePrices.get('QQQ')).toBe(150.25);
    });

    it('should reject negative prices', async () => {
      mockClient.setPrices({
        'VTI': -100.50,
        'SPY': 200.75
      });

      const monitor = new AssetMonitor(mockClient, ['VTI', 'SPY']);
      const basePrices = await monitor.initializeBasePrices();

      expect(basePrices.size).toBe(1);
      expect(basePrices.get('VTI')).toBeUndefined();
      expect(basePrices.get('SPY')).toBe(200.75);
    });

    it('should reject zero prices', async () => {
      mockClient.setPrices({
        'VTI': 0,
        'SPY': 200.75
      });

      const monitor = new AssetMonitor(mockClient, ['VTI', 'SPY']);
      const basePrices = await monitor.initializeBasePrices();

      expect(basePrices.size).toBe(1);
      expect(basePrices.get('VTI')).toBeUndefined();
      expect(basePrices.get('SPY')).toBe(200.75);
    });

    it('should reject NaN prices', async () => {
      mockClient.setPrices({
        'VTI': NaN,
        'SPY': 200.75
      });

      const monitor = new AssetMonitor(mockClient, ['VTI', 'SPY']);
      const basePrices = await monitor.initializeBasePrices();

      expect(basePrices.size).toBe(1);
      expect(basePrices.get('VTI')).toBeUndefined();
      expect(basePrices.get('SPY')).toBe(200.75);
    });
  });

  describe('updateCurrentPrices', () => {
    it('should update current prices for all assets', async () => {
      mockClient.setPrices({
        'VTI': 100.50,
        'SPY': 200.75,
        'QQQ': 150.25
      });

      const monitor = new AssetMonitor(mockClient, ['VTI', 'SPY', 'QQQ']);
      await monitor.initializeBasePrices();

      // Update prices
      mockClient.setPrices({
        'VTI': 102.00,
        'SPY': 203.00,
        'QQQ': 152.00
      });

      const updates = await monitor.updateCurrentPrices();

      expect(updates.size).toBe(3);
      expect(updates.get('VTI')?.price).toBe(102.00);
      expect(updates.get('SPY')?.price).toBe(203.00);
      expect(updates.get('QQQ')?.price).toBe(152.00);
    });

    it('should include timestamp and metadata in updates', async () => {
      mockClient.setPrices({ 'VTI': 100.50 });

      const monitor = new AssetMonitor(mockClient, ['VTI']);
      await monitor.initializeBasePrices();

      mockClient.setPrices({ 'VTI': 102.00 });
      const updates = await monitor.updateCurrentPrices();

      const update = updates.get('VTI');
      expect(update).toBeDefined();
      expect(update?.asset).toBe('VTI');
      expect(update?.price).toBe(102.00);
      expect(update?.timestamp).toBeInstanceOf(Date);
      expect(update?.source).toBe('market');
    });

    it('should continue with other assets when one fails', async () => {
      mockClient.setPrices({
        'VTI': 100.50,
        'SPY': 200.75,
        'QQQ': 150.25
      });

      const monitor = new AssetMonitor(mockClient, ['VTI', 'SPY', 'QQQ']);
      await monitor.initializeBasePrices();

      mockClient.setPrices({
        'VTI': 102.00,
        'QQQ': 152.00
      });
      mockClient.setFailure('SPY');

      const updates = await monitor.updateCurrentPrices();

      expect(updates.size).toBe(2);
      expect(updates.get('VTI')?.price).toBe(102.00);
      expect(updates.get('SPY')).toBeUndefined();
      expect(updates.get('QQQ')?.price).toBe(152.00);
    });

    it('should reject invalid prices during update', async () => {
      mockClient.setPrices({
        'VTI': 100.50,
        'SPY': 200.75
      });

      const monitor = new AssetMonitor(mockClient, ['VTI', 'SPY']);
      await monitor.initializeBasePrices();

      mockClient.setPrices({
        'VTI': -102.00,
        'SPY': 203.00
      });

      const updates = await monitor.updateCurrentPrices();

      expect(updates.size).toBe(1);
      expect(updates.get('VTI')).toBeUndefined();
      expect(updates.get('SPY')?.price).toBe(203.00);
    });
  });

  describe('getBasePrice', () => {
    it('should return base price for initialized asset', async () => {
      mockClient.setPrices({ 'VTI': 100.50 });

      const monitor = new AssetMonitor(mockClient, ['VTI']);
      await monitor.initializeBasePrices();

      expect(monitor.getBasePrice('VTI')).toBe(100.50);
    });

    it('should return null for uninitialized asset', () => {
      const monitor = new AssetMonitor(mockClient, ['VTI']);
      expect(monitor.getBasePrice('VTI')).toBeNull();
    });

    it('should return base price even after current price updates', async () => {
      mockClient.setPrices({ 'VTI': 100.50 });

      const monitor = new AssetMonitor(mockClient, ['VTI']);
      await monitor.initializeBasePrices();

      mockClient.setPrices({ 'VTI': 102.00 });
      await monitor.updateCurrentPrices();

      // Base price should remain unchanged
      expect(monitor.getBasePrice('VTI')).toBe(100.50);
    });
  });

  describe('getCurrentPrice', () => {
    it('should return current price for asset', async () => {
      mockClient.setPrices({ 'VTI': 100.50 });

      const monitor = new AssetMonitor(mockClient, ['VTI']);
      await monitor.initializeBasePrices();

      expect(monitor.getCurrentPrice('VTI')).toBe(100.50);
    });

    it('should return null for uninitialized asset', () => {
      const monitor = new AssetMonitor(mockClient, ['VTI']);
      expect(monitor.getCurrentPrice('VTI')).toBeNull();
    });

    it('should return updated price after update', async () => {
      mockClient.setPrices({ 'VTI': 100.50 });

      const monitor = new AssetMonitor(mockClient, ['VTI']);
      await monitor.initializeBasePrices();

      mockClient.setPrices({ 'VTI': 102.00 });
      await monitor.updateCurrentPrices();

      expect(monitor.getCurrentPrice('VTI')).toBe(102.00);
    });
  });

  describe('base price immutability', () => {
    it('should keep base price unchanged through multiple updates', async () => {
      mockClient.setPrices({ 'VTI': 100.00 });

      const monitor = new AssetMonitor(mockClient, ['VTI']);
      await monitor.initializeBasePrices();

      const originalBasePrice = monitor.getBasePrice('VTI');

      // Update prices multiple times
      mockClient.setPrices({ 'VTI': 101.00 });
      await monitor.updateCurrentPrices();

      mockClient.setPrices({ 'VTI': 102.00 });
      await monitor.updateCurrentPrices();

      mockClient.setPrices({ 'VTI': 103.00 });
      await monitor.updateCurrentPrices();

      // Base price should remain unchanged
      expect(monitor.getBasePrice('VTI')).toBe(originalBasePrice);
      expect(monitor.getBasePrice('VTI')).toBe(100.00);
      expect(monitor.getCurrentPrice('VTI')).toBe(103.00);
    });
  });
});

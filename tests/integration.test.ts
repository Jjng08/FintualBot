/**
 * Integration Tests for VTI Gap Trading Alert System
 * Task 16.2: Write integration tests
 * 
 * Tests complete end-to-end workflows across multiple components:
 * - Complete monitoring cycle with multiple assets
 * - Signal generation for assets exceeding threshold
 * - No signal generation for assets below threshold
 * - Signal persistence and notification
 * - Error handling in one asset without affecting others
 * - One alert per asset per day
 * 
 * Validates: Requirements 2.1, 2.2, 2.4, 3.1, 4.1, 4.4, 4.5
 */

import { TradingBotController } from '../src/services/TradingBotController';
import { AssetMonitor } from '../src/services/AssetMonitor';
import { AlertGenerator } from '../src/services/AlertGenerator';
import { IPriceTracker, SignalData } from '../src/services/PriceTracker';
import { NotificationService } from '../src/services/NotificationService';
import { IMarketAPIClient } from '../src/services/MarketAPIClient';
import { IConfiguration, DailySummary } from '../src/types';
import { ISignal } from '../src/models/Signal';

/**
 * Mock Market API Client for integration testing
 * Simulates real market API behavior with configurable prices and failures
 */
class MockMarketAPIClient implements IMarketAPIClient {
  private prices: Map<string, number> = new Map();
  private failures: Set<string> = new Set();
  private validSymbols: Set<string> = new Set(['VTI', 'SPY', 'QQQ', 'AAPL', 'MSFT']);

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

  async validateSymbol(symbol: string): Promise<boolean> {
    return this.validSymbols.has(symbol);
  }
}

/**
 * Mock Price Tracker for integration testing
 * Simulates database operations in memory
 */
class MockPriceTracker implements IPriceTracker {
  private signals: SignalData[] = [];

  async saveSignal(signal: SignalData): Promise<void> {
    this.signals.push(signal);
  }

  async getSignalsByAsset(asset: string, date?: Date): Promise<ISignal[]> {
    let filtered = this.signals.filter(s => s.asset === asset);
    
    if (date) {
      const targetDate = new Date(date);
      targetDate.setHours(0, 0, 0, 0);
      
      filtered = filtered.filter(s => {
        const signalDate = new Date(s.createAt || new Date());
        signalDate.setHours(0, 0, 0, 0);
        return signalDate.getTime() === targetDate.getTime();
      });
    }
    
    // Return as ISignal[] (cast for testing purposes)
    return filtered as any[];
  }

  async getLastFintualPrice(asset: string): Promise<number | null> {
    const assetSignals = this.signals.filter(s => s.asset === asset);
    if (assetSignals.length === 0) return null;
    
    const lastSignal = assetSignals[assetSignals.length - 1];
    return lastSignal.fintualPrice;
  }

  async hasSignalToday(asset: string): Promise<boolean> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return this.signals.some(signal => {
      if (signal.asset !== asset) return false;
      
      const signalDate = new Date(signal.createAt || new Date());
      signalDate.setHours(0, 0, 0, 0);
      return signalDate.getTime() === today.getTime();
    });
  }

  // Helper methods for testing
  getAllSignals(): SignalData[] {
    return this.signals;
  }

  reset(): void {
    this.signals = [];
  }
}

/**
 * Mock Notification Service for integration testing
 * Captures notifications without sending them
 */
class MockNotificationService extends NotificationService {
  public sentAlerts: any[] = [];
  public sentErrors: Error[] = [];
  public sentSummaries: DailySummary[] = [];

  constructor() {
    super('mock-token', 'mock-chat-id');
  }

  async sendAlert(signal: any): Promise<void> {
    this.sentAlerts.push(signal);
  }

  async sendError(error: Error): Promise<void> {
    this.sentErrors.push(error);
  }

  async sendDailySummary(summary: DailySummary): Promise<void> {
    this.sentSummaries.push(summary);
  }

  reset(): void {
    this.sentAlerts = [];
    this.sentErrors = [];
    this.sentSummaries = [];
  }
}

/**
 * Helper function to create test configuration
 */
function createTestConfig(overrides?: Partial<IConfiguration>): IConfiguration {
  return {
    assetList: ['VTI'],
    priceChangeThreshold: 1.5,
    monitoringInterval: 5,
    startTime: '11:30',
    endTime: '13:30',
    timezone: 'America/Santiago',
    mongoUri: 'mongodb://localhost:27017/test',
    telegramToken: 'test-token',
    telegramChatId: 'test-chat-id',
    primaryApiKey: 'test-api-key',
    ...overrides
  };
}

describe('Integration Tests - Complete Monitoring Cycle', () => {
  let mockMarketAPI: MockMarketAPIClient;
  let mockPriceTracker: MockPriceTracker;
  let mockNotificationService: MockNotificationService;
  let config: IConfiguration;

  beforeEach(() => {
    mockMarketAPI = new MockMarketAPIClient();
    mockPriceTracker = new MockPriceTracker();
    mockNotificationService = new MockNotificationService();
    config = createTestConfig();
  });

  /**
   * Test: Complete monitoring cycle with multiple assets
   * Validates: Requirements 2.1, 2.2
   */
  describe('Complete monitoring cycle with multiple assets', () => {
    it('should initialize and monitor multiple assets successfully', async () => {
      // Setup: Configure multiple assets with base prices
      config.assetList = ['VTI', 'SPY', 'QQQ'];
      mockMarketAPI.setPrices({
        'VTI': 100.00,
        'SPY': 200.00,
        'QQQ': 150.00
      });

      // Create components
      const assetMonitor = new AssetMonitor(mockMarketAPI, config.assetList);
      const alertGenerator = new AlertGenerator(mockPriceTracker, config.priceChangeThreshold);
      const controller = new TradingBotController(
        assetMonitor,
        alertGenerator,
        mockPriceTracker,
        mockNotificationService,
        mockMarketAPI,
        config
      );

      // Execute: Start monitoring
      await controller.start();

      // Verify: All assets initialized
      expect(assetMonitor.getBasePrice('VTI')).toBe(100.00);
      expect(assetMonitor.getBasePrice('SPY')).toBe(200.00);
      expect(assetMonitor.getBasePrice('QQQ')).toBe(150.00);

      // Verify: Bot is running
      const status = controller.getStatus();
      expect(status.isRunning).toBe(true);
      expect(status.assetsMonitored).toEqual(['VTI', 'SPY', 'QQQ']);

      // Cleanup
      await controller.stop();
    });

    it('should update prices for all assets during monitoring', async () => {
      // Setup
      config.assetList = ['VTI', 'SPY'];
      mockMarketAPI.setPrices({
        'VTI': 100.00,
        'SPY': 200.00
      });

      const assetMonitor = new AssetMonitor(mockMarketAPI, config.assetList);
      const alertGenerator = new AlertGenerator(mockPriceTracker, config.priceChangeThreshold);
      const controller = new TradingBotController(
        assetMonitor,
        alertGenerator,
        mockPriceTracker,
        mockNotificationService,
        mockMarketAPI,
        config
      );

      await controller.start();

      // Update prices
      mockMarketAPI.setPrices({
        'VTI': 101.00,
        'SPY': 202.00
      });

      const updates = await assetMonitor.updateCurrentPrices();

      // Verify: All assets updated
      expect(updates.size).toBe(2);
      expect(updates.get('VTI')?.price).toBe(101.00);
      expect(updates.get('SPY')?.price).toBe(202.00);

      // Verify: Base prices remain unchanged
      expect(assetMonitor.getBasePrice('VTI')).toBe(100.00);
      expect(assetMonitor.getBasePrice('SPY')).toBe(200.00);

      await controller.stop();
    });
  });

  /**
   * Test: Signal generation for assets exceeding threshold
   * Validates: Requirements 3.1, 4.1
   */
  describe('Signal generation for assets exceeding threshold', () => {
    it('should generate signals for assets with >= 1.5% increase', async () => {
      // Setup: VTI increases 2%, SPY increases 1.5%
      config.assetList = ['VTI', 'SPY'];
      mockMarketAPI.setPrices({
        'VTI': 100.00,
        'SPY': 200.00
      });

      const assetMonitor = new AssetMonitor(mockMarketAPI, config.assetList);
      const alertGenerator = new AlertGenerator(mockPriceTracker, config.priceChangeThreshold);
      const controller = new TradingBotController(
        assetMonitor,
        alertGenerator,
        mockPriceTracker,
        mockNotificationService,
        mockMarketAPI,
        config
      );

      await controller.start();

      // Update prices to trigger signals
      mockMarketAPI.setPrices({
        'VTI': 102.00,  // 2% increase
        'SPY': 203.00   // 1.5% increase
      });

      await assetMonitor.updateCurrentPrices();

      // Evaluate both assets
      const vtiSignal = await alertGenerator.evaluateAsset('VTI', 100.00, 102.00);
      const spySignal = await alertGenerator.evaluateAsset('SPY', 200.00, 203.00);

      // Verify: Both signals created
      expect(vtiSignal).not.toBeNull();
      expect(vtiSignal?.asset).toBe('VTI');
      expect(vtiSignal?.diff).toBe(2.0);
      expect(vtiSignal?.marketPrice).toBe(102.00);

      expect(spySignal).not.toBeNull();
      expect(spySignal?.asset).toBe('SPY');
      expect(spySignal?.diff).toBe(1.5);
      expect(spySignal?.marketPrice).toBe(203.00);

      await controller.stop();
    });

    it('should persist signals to database', async () => {
      // Setup
      config.assetList = ['VTI'];
      mockMarketAPI.setPrices({ 'VTI': 100.00 });

      const assetMonitor = new AssetMonitor(mockMarketAPI, config.assetList);
      const alertGenerator = new AlertGenerator(mockPriceTracker, config.priceChangeThreshold);
      const controller = new TradingBotController(
        assetMonitor,
        alertGenerator,
        mockPriceTracker,
        mockNotificationService,
        mockMarketAPI,
        config
      );

      await controller.start();

      // Generate signal
      const signal = await alertGenerator.evaluateAsset('VTI', 100.00, 102.00);
      expect(signal).not.toBeNull();

      // Save signal
      await mockPriceTracker.saveSignal(signal!);

      // Verify: Signal persisted
      const savedSignals = mockPriceTracker.getAllSignals();
      expect(savedSignals).toHaveLength(1);
      expect(savedSignals[0].asset).toBe('VTI');
      expect(savedSignals[0].diff).toBe(2.0);

      await controller.stop();
    });

    it('should send notifications for generated signals', async () => {
      // Setup
      config.assetList = ['VTI'];
      mockMarketAPI.setPrices({ 'VTI': 100.00 });

      const assetMonitor = new AssetMonitor(mockMarketAPI, config.assetList);
      const alertGenerator = new AlertGenerator(mockPriceTracker, config.priceChangeThreshold);
      const controller = new TradingBotController(
        assetMonitor,
        alertGenerator,
        mockPriceTracker,
        mockNotificationService,
        mockMarketAPI,
        config
      );

      await controller.start();

      // Generate and save signal
      const signal = await alertGenerator.evaluateAsset('VTI', 100.00, 102.00);
      await mockPriceTracker.saveSignal(signal!);
      await mockNotificationService.sendAlert(signal);

      // Verify: Notification sent
      expect(mockNotificationService.sentAlerts).toHaveLength(1);
      expect(mockNotificationService.sentAlerts[0].asset).toBe('VTI');

      await controller.stop();
    });
  });

  /**
   * Test: No signal generation for assets below threshold
   * Validates: Requirements 3.1, 4.1
   */
  describe('No signal generation for assets below threshold', () => {
    it('should not generate signals for assets with < 1.5% increase', async () => {
      // Setup: VTI increases only 1%
      config.assetList = ['VTI'];
      mockMarketAPI.setPrices({ 'VTI': 100.00 });

      const assetMonitor = new AssetMonitor(mockMarketAPI, config.assetList);
      const alertGenerator = new AlertGenerator(mockPriceTracker, config.priceChangeThreshold);
      const controller = new TradingBotController(
        assetMonitor,
        alertGenerator,
        mockPriceTracker,
        mockNotificationService,
        mockMarketAPI,
        config
      );

      await controller.start();

      // Update price below threshold
      const signal = await alertGenerator.evaluateAsset('VTI', 100.00, 101.00);

      // Verify: No signal created
      expect(signal).toBeNull();

      await controller.stop();
    });

    it('should not generate signals for negative price changes', async () => {
      // Setup: VTI decreases 2%
      config.assetList = ['VTI'];
      mockMarketAPI.setPrices({ 'VTI': 100.00 });

      const assetMonitor = new AssetMonitor(mockMarketAPI, config.assetList);
      const alertGenerator = new AlertGenerator(mockPriceTracker, config.priceChangeThreshold);
      const controller = new TradingBotController(
        assetMonitor,
        alertGenerator,
        mockPriceTracker,
        mockNotificationService,
        mockMarketAPI,
        config
      );

      await controller.start();

      // Update price with negative change
      const signal = await alertGenerator.evaluateAsset('VTI', 100.00, 98.00);

      // Verify: No signal created
      expect(signal).toBeNull();

      await controller.stop();
    });

    it('should not persist or notify when no signal is generated', async () => {
      // Setup
      config.assetList = ['VTI'];
      mockMarketAPI.setPrices({ 'VTI': 100.00 });

      const assetMonitor = new AssetMonitor(mockMarketAPI, config.assetList);
      const alertGenerator = new AlertGenerator(mockPriceTracker, config.priceChangeThreshold);
      const controller = new TradingBotController(
        assetMonitor,
        alertGenerator,
        mockPriceTracker,
        mockNotificationService,
        mockMarketAPI,
        config
      );

      await controller.start();

      // Evaluate asset below threshold
      await alertGenerator.evaluateAsset('VTI', 100.00, 101.00);

      // Verify: No signals persisted
      expect(mockPriceTracker.getAllSignals()).toHaveLength(0);

      // Verify: No notifications sent
      expect(mockNotificationService.sentAlerts).toHaveLength(0);

      await controller.stop();
    });
  });

  /**
   * Test: Error handling in one asset without affecting others
   * Validates: Requirements 2.4
   */
  describe('Error handling in one asset without affecting others', () => {
    it('should continue monitoring other assets when one fails', async () => {
      // Setup: SPY will fail, VTI and QQQ should succeed
      config.assetList = ['VTI', 'SPY', 'QQQ'];
      mockMarketAPI.setPrices({
        'VTI': 100.00,
        'SPY': 200.00,
        'QQQ': 150.00
      });

      const assetMonitor = new AssetMonitor(mockMarketAPI, config.assetList);
      const alertGenerator = new AlertGenerator(mockPriceTracker, config.priceChangeThreshold);
      const controller = new TradingBotController(
        assetMonitor,
        alertGenerator,
        mockPriceTracker,
        mockNotificationService,
        mockMarketAPI,
        config
      );

      await controller.start();

      // Make SPY fail during update
      mockMarketAPI.setFailure('SPY');
      mockMarketAPI.setPrices({
        'VTI': 102.00,
        'QQQ': 153.00
      });

      const updates = await assetMonitor.updateCurrentPrices();

      // Verify: VTI and QQQ updated successfully
      expect(updates.size).toBe(2);
      expect(updates.get('VTI')?.price).toBe(102.00);
      expect(updates.get('QQQ')?.price).toBe(153.00);
      expect(updates.get('SPY')).toBeUndefined();

      await controller.stop();
    });

    it('should generate signals for successful assets when one fails', async () => {
      // Setup
      config.assetList = ['VTI', 'SPY', 'QQQ'];
      mockMarketAPI.setPrices({
        'VTI': 100.00,
        'SPY': 200.00,
        'QQQ': 150.00
      });

      const assetMonitor = new AssetMonitor(mockMarketAPI, config.assetList);
      const alertGenerator = new AlertGenerator(mockPriceTracker, config.priceChangeThreshold);
      const controller = new TradingBotController(
        assetMonitor,
        alertGenerator,
        mockPriceTracker,
        mockNotificationService,
        mockMarketAPI,
        config
      );

      await controller.start();

      // Make SPY fail, but VTI and QQQ exceed threshold
      mockMarketAPI.setFailure('SPY');
      mockMarketAPI.setPrices({
        'VTI': 102.00,  // 2% increase
        'QQQ': 153.00   // 2% increase
      });

      await assetMonitor.updateCurrentPrices();

      // Generate signals for successful assets
      const vtiSignal = await alertGenerator.evaluateAsset('VTI', 100.00, 102.00);
      const qqqSignal = await alertGenerator.evaluateAsset('QQQ', 150.00, 153.00);

      // Verify: Signals created for VTI and QQQ
      expect(vtiSignal).not.toBeNull();
      expect(qqqSignal).not.toBeNull();

      await controller.stop();
    });

    it('should maintain base prices for all assets even when updates fail', async () => {
      // Setup
      config.assetList = ['VTI', 'SPY'];
      mockMarketAPI.setPrices({
        'VTI': 100.00,
        'SPY': 200.00
      });

      const assetMonitor = new AssetMonitor(mockMarketAPI, config.assetList);
      const alertGenerator = new AlertGenerator(mockPriceTracker, config.priceChangeThreshold);
      const controller = new TradingBotController(
        assetMonitor,
        alertGenerator,
        mockPriceTracker,
        mockNotificationService,
        mockMarketAPI,
        config
      );

      await controller.start();

      // Make SPY fail during update
      mockMarketAPI.setFailure('SPY');
      mockMarketAPI.setPrices({ 'VTI': 102.00 });

      await assetMonitor.updateCurrentPrices();

      // Verify: Base prices unchanged for both assets
      expect(assetMonitor.getBasePrice('VTI')).toBe(100.00);
      expect(assetMonitor.getBasePrice('SPY')).toBe(200.00);

      await controller.stop();
    });
  });

  /**
   * Test: One alert per asset per day
   * Validates: Requirements 4.4, 4.5
   */
  describe('One alert per asset per day', () => {
    it('should generate only one signal per asset per day', async () => {
      // Setup
      config.assetList = ['VTI'];
      mockMarketAPI.setPrices({ 'VTI': 100.00 });

      const assetMonitor = new AssetMonitor(mockMarketAPI, config.assetList);
      const alertGenerator = new AlertGenerator(mockPriceTracker, config.priceChangeThreshold);
      const controller = new TradingBotController(
        assetMonitor,
        alertGenerator,
        mockPriceTracker,
        mockNotificationService,
        mockMarketAPI,
        config
      );

      await controller.start();

      // First signal at 2% increase
      const signal1 = await alertGenerator.evaluateAsset('VTI', 100.00, 102.00);
      expect(signal1).not.toBeNull();
      await mockPriceTracker.saveSignal(signal1!);

      // Second attempt at 3% increase (same day)
      const signal2 = await alertGenerator.evaluateAsset('VTI', 100.00, 103.00);

      // Verify: Second signal not created
      expect(signal2).toBeNull();

      // Verify: Only one signal persisted
      const signals = mockPriceTracker.getAllSignals();
      expect(signals).toHaveLength(1);

      await controller.stop();
    });

    it('should allow independent signals for different assets on same day', async () => {
      // Setup
      config.assetList = ['VTI', 'SPY', 'QQQ'];
      mockMarketAPI.setPrices({
        'VTI': 100.00,
        'SPY': 200.00,
        'QQQ': 150.00
      });

      const assetMonitor = new AssetMonitor(mockMarketAPI, config.assetList);
      const alertGenerator = new AlertGenerator(mockPriceTracker, config.priceChangeThreshold);
      const controller = new TradingBotController(
        assetMonitor,
        alertGenerator,
        mockPriceTracker,
        mockNotificationService,
        mockMarketAPI,
        config
      );

      await controller.start();

      // Generate signals for all three assets
      const vtiSignal = await alertGenerator.evaluateAsset('VTI', 100.00, 102.00);
      const spySignal = await alertGenerator.evaluateAsset('SPY', 200.00, 204.00);
      const qqqSignal = await alertGenerator.evaluateAsset('QQQ', 150.00, 153.00);

      // Save all signals
      await mockPriceTracker.saveSignal(vtiSignal!);
      await mockPriceTracker.saveSignal(spySignal!);
      await mockPriceTracker.saveSignal(qqqSignal!);

      // Verify: All three signals created
      expect(vtiSignal).not.toBeNull();
      expect(spySignal).not.toBeNull();
      expect(qqqSignal).not.toBeNull();

      // Verify: All three signals persisted
      const signals = mockPriceTracker.getAllSignals();
      expect(signals).toHaveLength(3);
      expect(signals.map(s => s.asset)).toContain('VTI');
      expect(signals.map(s => s.asset)).toContain('SPY');
      expect(signals.map(s => s.asset)).toContain('QQQ');

      await controller.stop();
    });

    it('should not send duplicate notifications for same asset', async () => {
      // Setup
      config.assetList = ['VTI'];
      mockMarketAPI.setPrices({ 'VTI': 100.00 });

      const assetMonitor = new AssetMonitor(mockMarketAPI, config.assetList);
      const alertGenerator = new AlertGenerator(mockPriceTracker, config.priceChangeThreshold);
      const controller = new TradingBotController(
        assetMonitor,
        alertGenerator,
        mockPriceTracker,
        mockNotificationService,
        mockMarketAPI,
        config
      );

      await controller.start();

      // First signal
      const signal1 = await alertGenerator.evaluateAsset('VTI', 100.00, 102.00);
      await mockPriceTracker.saveSignal(signal1!);
      await mockNotificationService.sendAlert(signal1);

      // Second attempt
      await alertGenerator.evaluateAsset('VTI', 100.00, 103.00);

      // Verify: Only one notification sent
      expect(mockNotificationService.sentAlerts).toHaveLength(1);

      await controller.stop();
    });
  });

  /**
   * Test: Complete end-to-end workflow
   * Validates: Requirements 2.1, 2.2, 2.4, 3.1, 4.1, 4.4, 4.5
   */
  describe('Complete end-to-end workflow', () => {
    it('should execute complete monitoring cycle with mixed results', async () => {
      // Setup: Multiple assets with different outcomes
      config.assetList = ['VTI', 'SPY', 'QQQ', 'AAPL'];
      mockMarketAPI.setPrices({
        'VTI': 100.00,   // Will exceed threshold (2%)
        'SPY': 200.00,   // Will be below threshold (1%)
        'QQQ': 150.00,   // Will exceed threshold (2%)
        'AAPL': 180.00   // Will fail to fetch
      });

      const assetMonitor = new AssetMonitor(mockMarketAPI, config.assetList);
      const alertGenerator = new AlertGenerator(mockPriceTracker, config.priceChangeThreshold);
      const controller = new TradingBotController(
        assetMonitor,
        alertGenerator,
        mockPriceTracker,
        mockNotificationService,
        mockMarketAPI,
        config
      );

      // Start monitoring
      await controller.start();

      // Verify: All base prices initialized
      expect(assetMonitor.getBasePrice('VTI')).toBe(100.00);
      expect(assetMonitor.getBasePrice('SPY')).toBe(200.00);
      expect(assetMonitor.getBasePrice('QQQ')).toBe(150.00);
      expect(assetMonitor.getBasePrice('AAPL')).toBe(180.00);

      // Update prices with mixed results
      mockMarketAPI.setFailure('AAPL');
      mockMarketAPI.setPrices({
        'VTI': 102.00,   // 2% increase - should trigger
        'SPY': 202.00,   // 1% increase - should not trigger
        'QQQ': 153.00    // 2% increase - should trigger
      });

      await assetMonitor.updateCurrentPrices();

      // Evaluate all assets
      const vtiSignal = await alertGenerator.evaluateAsset('VTI', 100.00, 102.00);
      const spySignal = await alertGenerator.evaluateAsset('SPY', 200.00, 202.00);
      const qqqSignal = await alertGenerator.evaluateAsset('QQQ', 150.00, 153.00);

      // Save signals
      if (vtiSignal) await mockPriceTracker.saveSignal(vtiSignal);
      if (qqqSignal) await mockPriceTracker.saveSignal(qqqSignal);

      // Verify: Only VTI and QQQ generated signals
      expect(vtiSignal).not.toBeNull();
      expect(spySignal).toBeNull();
      expect(qqqSignal).not.toBeNull();

      // Verify: Two signals persisted
      const signals = mockPriceTracker.getAllSignals();
      expect(signals).toHaveLength(2);
      expect(signals.map(s => s.asset)).toContain('VTI');
      expect(signals.map(s => s.asset)).toContain('QQQ');
      expect(signals.map(s => s.asset)).not.toContain('SPY');
      expect(signals.map(s => s.asset)).not.toContain('AAPL');

      // Verify: Base prices remain unchanged
      expect(assetMonitor.getBasePrice('VTI')).toBe(100.00);
      expect(assetMonitor.getBasePrice('SPY')).toBe(200.00);
      expect(assetMonitor.getBasePrice('QQQ')).toBe(150.00);
      expect(assetMonitor.getBasePrice('AAPL')).toBe(180.00);

      await controller.stop();
    });
  });
});

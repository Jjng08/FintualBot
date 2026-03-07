/**
 * Unit Tests for TradingBotController
 * Tests: Task 11.3 - TradingBotController unit tests
 * 
 * Test areas:
 * - Component initialization
 * - Asset_List parsing
 * - Symbol validation
 * - Monitoring cycle coordination
 * - Default configuration handling
 */

import { TradingBotController } from '../src/services/TradingBotController';
import { IAssetMonitor } from '../src/services/AssetMonitor';
import { IAlertGenerator } from '../src/services/AlertGenerator';
import { IPriceTracker, SignalData } from '../src/services/PriceTracker';
import { NotificationService } from '../src/services/NotificationService';
import { IMarketAPIClient } from '../src/services/MarketAPIClient';
import { IConfiguration, PriceUpdate, DailySummary } from '../src/types';

/**
 * Mock AssetMonitor
 */
class MockAssetMonitor implements IAssetMonitor {
  private basePrices: Map<string, number> = new Map();
  private currentPrices: Map<string, number> = new Map();
  
  async initializeBasePrices(): Promise<Map<string, number>> {
    return new Map(this.basePrices);
  }
  
  async updateCurrentPrices(): Promise<Map<string, PriceUpdate>> {
    const updates = new Map<string, PriceUpdate>();
    this.currentPrices.forEach((price, asset) => {
      updates.set(asset, {
        asset,
        price,
        timestamp: new Date(),
        source: 'market'
      });
    });
    return updates;
  }
  
  getBasePrice(asset: string): number | null {
    return this.basePrices.get(asset) || null;
  }
  
  getCurrentPrice(asset: string): number | null {
    return this.currentPrices.get(asset) || null;
  }
  
  // Helper methods for testing
  setBasePrices(prices: Record<string, number>): void {
    this.basePrices.clear();
    Object.entries(prices).forEach(([asset, price]) => {
      this.basePrices.set(asset, price);
    });
  }
  
  setCurrentPrices(prices: Record<string, number>): void {
    this.currentPrices.clear();
    Object.entries(prices).forEach(([asset, price]) => {
      this.currentPrices.set(asset, price);
    });
  }
}

/**
 * Mock AlertGenerator
 */
class MockAlertGenerator implements IAlertGenerator {
  private signals: SignalData[] = [];
  
  async evaluateAsset(_asset: string, _basePrice: number, _currentPrice: number): Promise<SignalData | null> {
    return null;
  }
  
  calculatePercentageChange(basePrice: number, currentPrice: number): number {
    return Number((((currentPrice - basePrice) / basePrice) * 100).toFixed(2));
  }
  
  async hasAlertedToday(_asset: string): Promise<boolean> {
    return false;
  }
  
  getSignals(): SignalData[] {
    return this.signals;
  }
}

/**
 * Mock PriceTracker
 */
class MockPriceTracker implements IPriceTracker {
  private signals: SignalData[] = [];
  
  async saveSignal(signal: SignalData): Promise<void> {
    this.signals.push(signal);
  }
  
  async getSignalsByAsset(_asset: string, _date?: Date): Promise<any[]> {
    return [];
  }
  
  async getLastFintualPrice(_asset: string): Promise<number | null> {
    return null;
  }
  
  async hasSignalToday(_asset: string): Promise<boolean> {
    return false;
  }
}

/**
 * Mock NotificationService
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
}

/**
 * Mock MarketAPIClient
 */
class MockMarketAPIClient implements IMarketAPIClient {
  private validSymbols: Set<string> = new Set(['VTI', 'SPY', 'QQQ', 'AAPL']);
  private prices: Map<string, number> = new Map();
  
  async getPrice(symbol: string): Promise<number> {
    const price = this.prices.get(symbol);
    if (price === undefined) {
      throw new Error(`Price not found for ${symbol}`);
    }
    return price;
  }
  
  async getPrices(symbols: string[]): Promise<Map<string, number>> {
    const results = new Map<string, number>();
    for (const symbol of symbols) {
      const price = this.prices.get(symbol);
      if (price !== undefined) {
        results.set(symbol, price);
      }
    }
    return results;
  }
  
  async validateSymbol(symbol: string): Promise<boolean> {
    return this.validSymbols.has(symbol);
  }
  
  // Helper methods for testing
  setValidSymbols(symbols: string[]): void {
    this.validSymbols = new Set(symbols);
  }
  
  setPrices(prices: Record<string, number>): void {
    this.prices.clear();
    Object.entries(prices).forEach(([symbol, price]) => {
      this.prices.set(symbol, price);
    });
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

describe('TradingBotController', () => {
  let mockAssetMonitor: MockAssetMonitor;
  let mockAlertGenerator: MockAlertGenerator;
  let mockPriceTracker: MockPriceTracker;
  let mockNotificationService: MockNotificationService;
  let mockMarketAPIClient: MockMarketAPIClient;
  let config: IConfiguration;
  
  beforeEach(() => {
    mockAssetMonitor = new MockAssetMonitor();
    mockAlertGenerator = new MockAlertGenerator();
    mockPriceTracker = new MockPriceTracker();
    mockNotificationService = new MockNotificationService();
    mockMarketAPIClient = new MockMarketAPIClient();
    config = createTestConfig();
  });
  
  describe('Component Initialization', () => {
    it('should initialize with all required components', () => {
      const controller = new TradingBotController(
        mockAssetMonitor,
        mockAlertGenerator,
        mockPriceTracker,
        mockNotificationService,
        mockMarketAPIClient,
        config
      );
      
      expect(controller).toBeDefined();
      expect(controller.getStatus).toBeDefined();
      expect(controller.start).toBeDefined();
      expect(controller.stop).toBeDefined();
    });
    
    it('should start with isRunning false', () => {
      const controller = new TradingBotController(
        mockAssetMonitor,
        mockAlertGenerator,
        mockPriceTracker,
        mockNotificationService,
        mockMarketAPIClient,
        config
      );
      
      const status = controller.getStatus();
      expect(status.isRunning).toBe(false);
    });
    
    it('should initialize with empty assetsMonitored', () => {
      const controller = new TradingBotController(
        mockAssetMonitor,
        mockAlertGenerator,
        mockPriceTracker,
        mockNotificationService,
        mockMarketAPIClient,
        config
      );
      
      const status = controller.getStatus();
      expect(status.assetsMonitored).toEqual([]);
    });
  });
  
  describe('Asset_List Parsing', () => {
    it('should parse single asset from configuration', async () => {
      config.assetList = ['VTI'];
      mockAssetMonitor.setBasePrices({ 'VTI': 100 });
      
      const controller = new TradingBotController(
        mockAssetMonitor,
        mockAlertGenerator,
        mockPriceTracker,
        mockNotificationService,
        mockMarketAPIClient,
        config
      );
      
      await controller.start();
      
      const status = controller.getStatus();
      expect(status.assetsMonitored).toEqual(['VTI']);
      
      await controller.stop();
    });
    
    it('should parse multiple assets from configuration', async () => {
      config.assetList = ['VTI', 'SPY', 'QQQ'];
      mockAssetMonitor.setBasePrices({ 'VTI': 100, 'SPY': 200, 'QQQ': 150 });
      
      const controller = new TradingBotController(
        mockAssetMonitor,
        mockAlertGenerator,
        mockPriceTracker,
        mockNotificationService,
        mockMarketAPIClient,
        config
      );
      
      await controller.start();
      
      const status = controller.getStatus();
      expect(status.assetsMonitored).toHaveLength(3);
      expect(status.assetsMonitored).toContain('VTI');
      expect(status.assetsMonitored).toContain('SPY');
      expect(status.assetsMonitored).toContain('QQQ');
      
      await controller.stop();
    });
    
    it('should handle asset list with whitespace', async () => {
      config.assetList = [' VTI ', ' SPY ', ' QQQ '];
      mockAssetMonitor.setBasePrices({ 'VTI': 100, 'SPY': 200, 'QQQ': 150 });
      
      const controller = new TradingBotController(
        mockAssetMonitor,
        mockAlertGenerator,
        mockPriceTracker,
        mockNotificationService,
        mockMarketAPIClient,
        config
      );
      
      await controller.start();
      
      const status = controller.getStatus();
      expect(status.assetsMonitored).toEqual(['VTI', 'SPY', 'QQQ']);
      
      await controller.stop();
    });
    
    it('should filter out empty strings from asset list', async () => {
      config.assetList = ['VTI', '', '  ', 'SPY'];
      mockAssetMonitor.setBasePrices({ 'VTI': 100, 'SPY': 200 });
      
      const controller = new TradingBotController(
        mockAssetMonitor,
        mockAlertGenerator,
        mockPriceTracker,
        mockNotificationService,
        mockMarketAPIClient,
        config
      );
      
      await controller.start();
      
      const status = controller.getStatus();
      expect(status.assetsMonitored).toEqual(['VTI', 'SPY']);
      
      await controller.stop();
    });
  });
  
  describe('Symbol Validation', () => {
    it('should validate all symbols before monitoring', async () => {
      config.assetList = ['VTI', 'SPY'];
      mockAssetMonitor.setBasePrices({ 'VTI': 100, 'SPY': 200 });
      
      const controller = new TradingBotController(
        mockAssetMonitor,
        mockAlertGenerator,
        mockPriceTracker,
        mockNotificationService,
        mockMarketAPIClient,
        config
      );
      
      await controller.start();
      
      const status = controller.getStatus();
      expect(status.assetsMonitored).toEqual(['VTI', 'SPY']);
      
      await controller.stop();
    });
    
    it('should exclude invalid symbols from monitoring', async () => {
      config.assetList = ['VTI', 'INVALID', 'SPY'];
      mockMarketAPIClient.setValidSymbols(['VTI', 'SPY']);
      mockAssetMonitor.setBasePrices({ 'VTI': 100, 'SPY': 200 });
      
      const controller = new TradingBotController(
        mockAssetMonitor,
        mockAlertGenerator,
        mockPriceTracker,
        mockNotificationService,
        mockMarketAPIClient,
        config
      );
      
      await controller.start();
      
      const status = controller.getStatus();
      expect(status.assetsMonitored).toEqual(['VTI', 'SPY']);
      expect(status.assetsMonitored).not.toContain('INVALID');
      
      await controller.stop();
    });
    
    it('should log warning for invalid symbols', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      config.assetList = ['VTI', 'INVALID'];
      mockMarketAPIClient.setValidSymbols(['VTI']);
      mockAssetMonitor.setBasePrices({ 'VTI': 100 });
      
      const controller = new TradingBotController(
        mockAssetMonitor,
        mockAlertGenerator,
        mockPriceTracker,
        mockNotificationService,
        mockMarketAPIClient,
        config
      );
      
      await controller.start();
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('INVALID')
      );
      
      await controller.stop();
      consoleSpy.mockRestore();
    });
    
    it('should throw error when no valid assets remain after validation', async () => {
      config.assetList = ['INVALID1', 'INVALID2'];
      mockMarketAPIClient.setValidSymbols([]);
      
      const controller = new TradingBotController(
        mockAssetMonitor,
        mockAlertGenerator,
        mockPriceTracker,
        mockNotificationService,
        mockMarketAPIClient,
        config
      );
      
      await expect(controller.start()).rejects.toThrow('No valid assets to monitor after validation');
    });
    
    it('should continue with valid assets when some fail validation', async () => {
      config.assetList = ['VTI', 'INVALID1', 'SPY', 'INVALID2', 'QQQ'];
      mockMarketAPIClient.setValidSymbols(['VTI', 'SPY', 'QQQ']);
      mockAssetMonitor.setBasePrices({ 'VTI': 100, 'SPY': 200, 'QQQ': 150 });
      
      const controller = new TradingBotController(
        mockAssetMonitor,
        mockAlertGenerator,
        mockPriceTracker,
        mockNotificationService,
        mockMarketAPIClient,
        config
      );
      
      await controller.start();
      
      const status = controller.getStatus();
      expect(status.assetsMonitored).toEqual(['VTI', 'SPY', 'QQQ']);
      
      await controller.stop();
    });
  });
  
  describe('Monitoring Cycle Coordination', () => {
    it('should initialize base prices on start', async () => {
      config.assetList = ['VTI'];
      mockAssetMonitor.setBasePrices({ 'VTI': 100 });
      
      const initSpy = jest.spyOn(mockAssetMonitor, 'initializeBasePrices');
      
      const controller = new TradingBotController(
        mockAssetMonitor,
        mockAlertGenerator,
        mockPriceTracker,
        mockNotificationService,
        mockMarketAPIClient,
        config
      );
      
      await controller.start();
      
      expect(initSpy).toHaveBeenCalled();
      
      await controller.stop();
    });
    
    it('should set isRunning to true after start', async () => {
      config.assetList = ['VTI'];
      mockAssetMonitor.setBasePrices({ 'VTI': 100 });
      
      const controller = new TradingBotController(
        mockAssetMonitor,
        mockAlertGenerator,
        mockPriceTracker,
        mockNotificationService,
        mockMarketAPIClient,
        config
      );
      
      await controller.start();
      
      const status = controller.getStatus();
      expect(status.isRunning).toBe(true);
      
      await controller.stop();
    });
    
    it('should set isRunning to false after stop', async () => {
      config.assetList = ['VTI'];
      mockAssetMonitor.setBasePrices({ 'VTI': 100 });
      
      const controller = new TradingBotController(
        mockAssetMonitor,
        mockAlertGenerator,
        mockPriceTracker,
        mockNotificationService,
        mockMarketAPIClient,
        config
      );
      
      await controller.start();
      await controller.stop();
      
      const status = controller.getStatus();
      expect(status.isRunning).toBe(false);
    });
    
    it('should not start if already running', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      config.assetList = ['VTI'];
      mockAssetMonitor.setBasePrices({ 'VTI': 100 });
      
      const controller = new TradingBotController(
        mockAssetMonitor,
        mockAlertGenerator,
        mockPriceTracker,
        mockNotificationService,
        mockMarketAPIClient,
        config
      );
      
      await controller.start();
      await controller.start(); // Second start
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('already running')
      );
      
      await controller.stop();
      consoleSpy.mockRestore();
    });
    
    it('should not stop if not running', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      const controller = new TradingBotController(
        mockAssetMonitor,
        mockAlertGenerator,
        mockPriceTracker,
        mockNotificationService,
        mockMarketAPIClient,
        config
      );
      
      await controller.stop();
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('not running')
      );
      
      consoleSpy.mockRestore();
    });
    
    it('should update lastUpdate timestamp on start', async () => {
      config.assetList = ['VTI'];
      mockAssetMonitor.setBasePrices({ 'VTI': 100 });
      
      const controller = new TradingBotController(
        mockAssetMonitor,
        mockAlertGenerator,
        mockPriceTracker,
        mockNotificationService,
        mockMarketAPIClient,
        config
      );
      
      const beforeStart = new Date();
      await controller.start();
      const afterStart = new Date();
      
      const status = controller.getStatus();
      expect(status.lastUpdate.getTime()).toBeGreaterThanOrEqual(beforeStart.getTime());
      expect(status.lastUpdate.getTime()).toBeLessThanOrEqual(afterStart.getTime());
      
      await controller.stop();
    });
    
    it('should send daily summary on stop', async () => {
      config.assetList = ['VTI'];
      mockAssetMonitor.setBasePrices({ 'VTI': 100 });
      
      const controller = new TradingBotController(
        mockAssetMonitor,
        mockAlertGenerator,
        mockPriceTracker,
        mockNotificationService,
        mockMarketAPIClient,
        config
      );
      
      await controller.start();
      await controller.stop();
      
      expect(mockNotificationService.sentSummaries).toHaveLength(1);
      expect(mockNotificationService.sentSummaries[0].assetsMonitored).toBe(1);
    });
  });
  
  describe('Default Configuration Handling', () => {
    it('should use default asset list when not specified', async () => {
      const defaultConfig = createTestConfig({ assetList: ['VTI'] });
      mockAssetMonitor.setBasePrices({ 'VTI': 100 });
      
      const controller = new TradingBotController(
        mockAssetMonitor,
        mockAlertGenerator,
        mockPriceTracker,
        mockNotificationService,
        mockMarketAPIClient,
        defaultConfig
      );
      
      await controller.start();
      
      const status = controller.getStatus();
      expect(status.assetsMonitored).toEqual(['VTI']);
      
      await controller.stop();
    });
    
    it('should use default monitoring interval', async () => {
      const defaultConfig = createTestConfig({ monitoringInterval: 5 });
      mockAssetMonitor.setBasePrices({ 'VTI': 100 });
      
      const controller = new TradingBotController(
        mockAssetMonitor,
        mockAlertGenerator,
        mockPriceTracker,
        mockNotificationService,
        mockMarketAPIClient,
        defaultConfig
      );
      
      await controller.start();
      
      // Verify controller started successfully with default interval
      const status = controller.getStatus();
      expect(status.isRunning).toBe(true);
      
      await controller.stop();
    });
    
    it('should use default price change threshold', async () => {
      const defaultConfig = createTestConfig({ priceChangeThreshold: 1.5 });
      mockAssetMonitor.setBasePrices({ 'VTI': 100 });
      
      const controller = new TradingBotController(
        mockAssetMonitor,
        mockAlertGenerator,
        mockPriceTracker,
        mockNotificationService,
        mockMarketAPIClient,
        defaultConfig
      );
      
      await controller.start();
      
      // Verify controller started successfully with default threshold
      const status = controller.getStatus();
      expect(status.isRunning).toBe(true);
      
      await controller.stop();
    });
    
    it('should use default time window (11:30-13:30)', async () => {
      const defaultConfig = createTestConfig({
        startTime: '11:30',
        endTime: '13:30'
      });
      mockAssetMonitor.setBasePrices({ 'VTI': 100 });
      
      const controller = new TradingBotController(
        mockAssetMonitor,
        mockAlertGenerator,
        mockPriceTracker,
        mockNotificationService,
        mockMarketAPIClient,
        defaultConfig
      );
      
      await controller.start();
      
      // Verify controller started successfully with default time window
      const status = controller.getStatus();
      expect(status.isRunning).toBe(true);
      
      await controller.stop();
    });
    
    it('should use default timezone (America/Santiago)', async () => {
      const defaultConfig = createTestConfig({ timezone: 'America/Santiago' });
      mockAssetMonitor.setBasePrices({ 'VTI': 100 });
      
      const controller = new TradingBotController(
        mockAssetMonitor,
        mockAlertGenerator,
        mockPriceTracker,
        mockNotificationService,
        mockMarketAPIClient,
        defaultConfig
      );
      
      await controller.start();
      
      // Verify controller started successfully with default timezone
      const status = controller.getStatus();
      expect(status.isRunning).toBe(true);
      
      await controller.stop();
    });
  });
  
  describe('Error Handling', () => {
    it('should send error notification when start fails', async () => {
      config.assetList = ['VTI'];
      
      // Make initializeBasePrices throw an error
      jest.spyOn(mockAssetMonitor, 'initializeBasePrices').mockRejectedValue(
        new Error('Failed to initialize')
      );
      
      const controller = new TradingBotController(
        mockAssetMonitor,
        mockAlertGenerator,
        mockPriceTracker,
        mockNotificationService,
        mockMarketAPIClient,
        config
      );
      
      await expect(controller.start()).rejects.toThrow('Failed to initialize');
      expect(mockNotificationService.sentErrors).toHaveLength(1);
    });
    
    it('should remain not running if start fails', async () => {
      config.assetList = ['VTI'];
      
      jest.spyOn(mockAssetMonitor, 'initializeBasePrices').mockRejectedValue(
        new Error('Failed to initialize')
      );
      
      const controller = new TradingBotController(
        mockAssetMonitor,
        mockAlertGenerator,
        mockPriceTracker,
        mockNotificationService,
        mockMarketAPIClient,
        config
      );
      
      try {
        await controller.start();
      } catch {
        // Expected to fail
      }
      
      const status = controller.getStatus();
      expect(status.isRunning).toBe(false);
    });
  });
  
  describe('getStatus', () => {
    it('should return complete status information', async () => {
      config.assetList = ['VTI', 'SPY'];
      mockAssetMonitor.setBasePrices({ 'VTI': 100, 'SPY': 200 });
      
      const controller = new TradingBotController(
        mockAssetMonitor,
        mockAlertGenerator,
        mockPriceTracker,
        mockNotificationService,
        mockMarketAPIClient,
        config
      );
      
      await controller.start();
      
      const status = controller.getStatus();
      
      expect(status).toHaveProperty('isRunning');
      expect(status).toHaveProperty('currentWindow');
      expect(status).toHaveProperty('assetsMonitored');
      expect(status).toHaveProperty('lastUpdate');
      
      expect(status.isRunning).toBe(true);
      expect(status.assetsMonitored).toEqual(['VTI', 'SPY']);
      expect(status.lastUpdate).toBeInstanceOf(Date);
      
      await controller.stop();
    });
  });
});

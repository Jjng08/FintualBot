/**
 * Unit tests for Logger service
 * Validates: Requirements 10.1, 10.2, 10.3, 10.4
 */

import { Logger } from '../src/services/Logger';

describe('Logger', () => {
  let logger: Logger;
  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;
  let consoleDebugSpy: jest.SpyInstance;

  beforeEach(() => {
    logger = new Logger('TestComponent');
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    consoleDebugSpy = jest.spyOn(console, 'debug').mockImplementation();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleDebugSpy.mockRestore();
  });

  describe('Log Levels', () => {
    it('should log ERROR messages to console.error', () => {
      logger.error('Test error message');
      
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      const logOutput = consoleErrorSpy.mock.calls[0][0];
      expect(logOutput).toContain('ERROR');
      expect(logOutput).toContain('TestComponent');
      expect(logOutput).toContain('Test error message');
    });

    it('should log WARN messages to console.warn', () => {
      logger.warn('Test warning message');
      
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      const logOutput = consoleWarnSpy.mock.calls[0][0];
      expect(logOutput).toContain('WARN');
      expect(logOutput).toContain('TestComponent');
      expect(logOutput).toContain('Test warning message');
    });

    it('should log INFO messages to console.log', () => {
      logger.info('Test info message');
      
      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const logOutput = consoleLogSpy.mock.calls[0][0];
      expect(logOutput).toContain('INFO');
      expect(logOutput).toContain('TestComponent');
      expect(logOutput).toContain('Test info message');
    });

    it('should log DEBUG messages to console.debug', () => {
      logger.debug('Test debug message');
      
      expect(consoleDebugSpy).toHaveBeenCalledTimes(1);
      const logOutput = consoleDebugSpy.mock.calls[0][0];
      expect(logOutput).toContain('DEBUG');
      expect(logOutput).toContain('TestComponent');
      expect(logOutput).toContain('Test debug message');
    });
  });

  describe('Log Entry Format', () => {
    it('should include timestamp in ISO format', () => {
      logger.info('Test message');
      
      const logOutput = consoleLogSpy.mock.calls[0][0];
      // Check for ISO timestamp pattern (YYYY-MM-DDTHH:mm:ss.sssZ)
      expect(logOutput).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/);
    });

    it('should include component name', () => {
      logger.info('Test message');
      
      const logOutput = consoleLogSpy.mock.calls[0][0];
      expect(logOutput).toContain('[TestComponent]');
    });

    it('should include asset symbol when provided', () => {
      logger.info('Test message', 'VTI');
      
      const logOutput = consoleLogSpy.mock.calls[0][0];
      expect(logOutput).toContain('[VTI]');
    });

    it('should not include asset symbol when not provided', () => {
      logger.info('Test message');
      
      const logOutput = consoleLogSpy.mock.calls[0][0];
      expect(logOutput).not.toMatch(/\[VTI\]/);
    });

    it('should include metadata when provided', () => {
      const metadata = { price: 100.50, change: 1.75 };
      logger.info('Test message', undefined, metadata);
      
      const logOutput = consoleLogSpy.mock.calls[0][0];
      expect(logOutput).toContain(JSON.stringify(metadata));
    });

    it('should include both asset and metadata when provided', () => {
      const metadata = { error: 'API timeout' };
      logger.error('Failed to fetch price', 'SPY', metadata);
      
      const logOutput = consoleErrorSpy.mock.calls[0][0];
      expect(logOutput).toContain('[SPY]');
      expect(logOutput).toContain(JSON.stringify(metadata));
    });
  });

  describe('Error Logging with Context', () => {
    it('should log errors with stack traces in metadata', () => {
      const error = new Error('Test error');
      logger.error('Operation failed', 'VTI', { 
        stack: error.stack,
        errorMessage: error.message 
      });
      
      const logOutput = consoleErrorSpy.mock.calls[0][0];
      expect(logOutput).toContain('ERROR');
      expect(logOutput).toContain('[VTI]');
      expect(logOutput).toContain('Operation failed');
      expect(logOutput).toContain('stack');
    });

    it('should log API errors with request context', () => {
      logger.error('API request failed', 'SPY', {
        endpoint: '/api/prices',
        statusCode: 500,
        responseTime: 3000,
        retryAttempt: 2
      });
      
      const logOutput = consoleErrorSpy.mock.calls[0][0];
      expect(logOutput).toContain('ERROR');
      expect(logOutput).toContain('[SPY]');
      expect(logOutput).toContain('API request failed');
      expect(logOutput).toContain('/api/prices');
      expect(logOutput).toContain('500');
    });

    it('should log database errors with operation context', () => {
      logger.error('Database operation failed', undefined, {
        operation: 'INSERT',
        table: 'signals',
        errorCode: 'SQLITE_CONSTRAINT',
        details: 'UNIQUE constraint failed'
      });
      
      const logOutput = consoleErrorSpy.mock.calls[0][0];
      expect(logOutput).toContain('ERROR');
      expect(logOutput).toContain('Database operation failed');
      expect(logOutput).toContain('INSERT');
      expect(logOutput).toContain('signals');
      expect(logOutput).toContain('SQLITE_CONSTRAINT');
    });

    it('should log validation errors with input context', () => {
      logger.error('Invalid configuration', undefined, {
        field: 'threshold',
        value: -1.5,
        constraint: 'must be positive',
        providedConfig: { threshold: -1.5, interval: 5 }
      });
      
      const logOutput = consoleErrorSpy.mock.calls[0][0];
      expect(logOutput).toContain('ERROR');
      expect(logOutput).toContain('Invalid configuration');
      expect(logOutput).toContain('threshold');
      expect(logOutput).toContain('-1.5');
      expect(logOutput).toContain('must be positive');
    });

    it('should log network errors with connection context', () => {
      logger.error('Network connection failed', 'QQQ', {
        host: 'api.example.com',
        port: 443,
        timeout: 5000,
        errorType: 'ETIMEDOUT'
      });
      
      const logOutput = consoleErrorSpy.mock.calls[0][0];
      expect(logOutput).toContain('ERROR');
      expect(logOutput).toContain('[QQQ]');
      expect(logOutput).toContain('Network connection failed');
      expect(logOutput).toContain('api.example.com');
      expect(logOutput).toContain('ETIMEDOUT');
    });
  });

  describe('Asset Logger', () => {
    it('should create asset-specific logger with withAsset', () => {
      const assetLogger = logger.withAsset('QQQ');
      assetLogger.info('Price updated');
      
      const logOutput = consoleLogSpy.mock.calls[0][0];
      expect(logOutput).toContain('[QQQ]');
      expect(logOutput).toContain('Price updated');
    });

    it('should automatically include asset in all logs from asset logger', () => {
      const assetLogger = logger.withAsset('AAPL');
      
      assetLogger.error('Error message');
      assetLogger.warn('Warning message');
      assetLogger.info('Info message');
      assetLogger.debug('Debug message');
      
      expect(consoleErrorSpy.mock.calls[0][0]).toContain('[AAPL]');
      expect(consoleWarnSpy.mock.calls[0][0]).toContain('[AAPL]');
      expect(consoleLogSpy.mock.calls[0][0]).toContain('[AAPL]');
      expect(consoleDebugSpy.mock.calls[0][0]).toContain('[AAPL]');
    });

    it('should support metadata in asset logger', () => {
      const assetLogger = logger.withAsset('TSLA');
      assetLogger.info('Price updated', { price: 250.75 });
      
      const logOutput = consoleLogSpy.mock.calls[0][0];
      expect(logOutput).toContain('[TSLA]');
      expect(logOutput).toContain('"price":250.75');
    });
  });

  describe('Critical Events Logging', () => {
    it('should log bot startup with configuration', () => {
      const config = {
        assetList: ['VTI', 'SPY', 'QQQ'],
        threshold: 1.5,
        interval: 5
      };
      
      logger.info('Bot started', undefined, config);
      
      const logOutput = consoleLogSpy.mock.calls[0][0];
      expect(logOutput).toContain('Bot started');
      expect(logOutput).toContain('VTI');
      expect(logOutput).toContain('SPY');
      expect(logOutput).toContain('QQQ');
    });

    it('should log base price capture per asset', () => {
      logger.info('Base price captured', 'VTI', { basePrice: 100.50 });
      
      const logOutput = consoleLogSpy.mock.calls[0][0];
      expect(logOutput).toContain('[VTI]');
      expect(logOutput).toContain('Base price captured');
      expect(logOutput).toContain('100.5');
    });

    it('should log signal generation with details', () => {
      const signal = {
        asset: 'SPY',
        marketPrice: 450.25,
        fintualPrice: 448.50,
        diff: 1.75,
        createAt: new Date()
      };
      
      logger.info('Signal generated', 'SPY', signal);
      
      const logOutput = consoleLogSpy.mock.calls[0][0];
      expect(logOutput).toContain('[SPY]');
      expect(logOutput).toContain('Signal generated');
      expect(logOutput).toContain('450.25');
      expect(logOutput).toContain('1.75');
    });

    it('should log daily summary', () => {
      const summary = {
        date: new Date(),
        assetsMonitored: 3,
        priceUpdates: 15,
        signalsGenerated: 2
      };
      
      logger.info('Daily summary', undefined, summary);
      
      const logOutput = consoleLogSpy.mock.calls[0][0];
      expect(logOutput).toContain('Daily summary');
      expect(logOutput).toContain('"assetsMonitored":3');
      expect(logOutput).toContain('"priceUpdates":15');
      expect(logOutput).toContain('"signalsGenerated":2');
    });
  });

  describe('Multiple Components', () => {
    it('should distinguish logs from different components', () => {
      const logger1 = new Logger('AssetMonitor');
      const logger2 = new Logger('AlertGenerator');
      
      logger1.info('Monitoring started');
      logger2.info('Evaluating conditions');
      
      expect(consoleLogSpy.mock.calls[0][0]).toContain('[AssetMonitor]');
      expect(consoleLogSpy.mock.calls[1][0]).toContain('[AlertGenerator]');
    });
  });
});

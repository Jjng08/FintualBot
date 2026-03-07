import fc from 'fast-check';
import { TradingBotController } from '../src/services/TradingBotController';
import { IAssetMonitor } from '../src/services/AssetMonitor';
import { IAlertGenerator } from '../src/services/AlertGenerator';
import { IPriceTracker } from '../src/services/PriceTracker';
import { NotificationService } from '../src/services/NotificationService';
import { IMarketAPIClient } from '../src/services/MarketAPIClient';
import { IConfiguration } from '../src/types';

/**
 * Property-Based Tests for Asset List Parsing
 * Feature: vti-gap-trading-alert
 * Task 11.2: Write property test for asset list parsing
 * 
 * These tests validate universal properties that should hold true
 * for all possible asset list inputs.
 */

describe('Property 1: Asset List Parsing', () => {
  /**
   * **Validates: Requirements 1.2**
   * 
   * Property: For any string containing comma-separated asset symbols,
   * parsing the Asset_List should produce a valid array where each element
   * is a trimmed, non-empty string.
   * 
   * This property ensures that asset list parsing correctly handles:
   * - Trimming whitespace from symbols
   * - Filtering out empty strings
   * - Preserving valid symbols
   */
  it('should parse any comma-separated string into valid array with trimmed non-empty strings', () => {
    // Generator for asset symbols with various whitespace patterns
    const assetSymbolWithWhitespace = fc.tuple(
      fc.string({ minLength: 0, maxLength: 5 }), // Leading whitespace
      fc.string({ minLength: 1, maxLength: 5 }).filter(s => s.trim().length > 0), // Actual symbol
      fc.string({ minLength: 0, maxLength: 5 })  // Trailing whitespace
    ).map(([leading, symbol, trailing]) => leading + symbol + trailing);
    
    // Generator for array of symbols (some may be empty after trimming)
    const assetListArray = fc.array(
      fc.oneof(
        assetSymbolWithWhitespace,
        fc.constant(''),  // Empty strings
        fc.constant('   '), // Whitespace-only strings
        fc.constant('\t\t'), // Tab characters
        fc.constant('\n')  // Newlines
      ),
      { minLength: 1, maxLength: 10 }
    );
    
    fc.assert(
      fc.property(assetListArray, (symbols) => {
        // Create a mock configuration with the asset list
        const config: IConfiguration = {
          assetList: symbols,
          priceChangeThreshold: 1.5,
          monitoringInterval: 5,
          startTime: '11:30',
          endTime: '13:30',
          timezone: 'America/Santiago',
          mongoUri: 'mongodb://localhost:27017/test',
          telegramToken: 'test-token',
          telegramChatId: '123456',
          primaryApiKey: 'test-api-key'
        };
        
        // Create mock dependencies
        const mockAssetMonitor = {
          initializeBasePrices: jest.fn().mockResolvedValue(new Map()),
          updateCurrentPrices: jest.fn().mockResolvedValue(new Map()),
          getBasePrice: jest.fn().mockReturnValue(null),
          getCurrentPrice: jest.fn().mockReturnValue(null)
        } as unknown as IAssetMonitor;
        
        const mockAlertGenerator = {
          evaluateAsset: jest.fn().mockResolvedValue(null),
          calculatePercentageChange: jest.fn().mockReturnValue(0),
          hasAlertedToday: jest.fn().mockResolvedValue(false)
        } as unknown as IAlertGenerator;
        
        const mockPriceTracker = {
          saveSignal: jest.fn().mockResolvedValue(undefined),
          getSignalsByAsset: jest.fn().mockResolvedValue([]),
          getLastFintualPrice: jest.fn().mockResolvedValue(null),
          hasSignalToday: jest.fn().mockResolvedValue(false)
        } as unknown as IPriceTracker;
        
        const mockNotificationService = {
          sendAlert: jest.fn().mockResolvedValue(undefined),
          sendError: jest.fn().mockResolvedValue(undefined),
          sendDailySummary: jest.fn().mockResolvedValue(undefined)
        } as unknown as NotificationService;
        
        const mockMarketAPIClient = {
          getPrice: jest.fn().mockResolvedValue(100),
          getPrices: jest.fn().mockResolvedValue(new Map()),
          validateSymbol: jest.fn().mockResolvedValue(true)
        } as unknown as IMarketAPIClient;
        
        // Create controller instance
        const controller = new TradingBotController(
          mockAssetMonitor,
          mockAlertGenerator,
          mockPriceTracker,
          mockNotificationService,
          mockMarketAPIClient,
          config
        );
        
        // Access the private parseAssetList method via reflection
        const parseAssetList = (controller as any).parseAssetList.bind(controller);
        const parsed = parseAssetList(symbols);
        
        // Property 1: Each element should be a trimmed, non-empty string
        parsed.forEach((symbol: string) => {
          // Should be trimmed (no leading/trailing whitespace)
          expect(symbol).toBe(symbol.trim());
          
          // Should be non-empty
          expect(symbol.length).toBeGreaterThan(0);
          
          // Should not contain only whitespace
          expect(symbol.trim().length).toBeGreaterThan(0);
        });
        
        // Property 2: Parsed array should only contain symbols that were non-empty after trimming
        const expectedSymbols = symbols
          .map(s => s.trim())
          .filter(s => s.length > 0);
        
        expect(parsed).toEqual(expectedSymbols);
        expect(parsed.length).toBe(expectedSymbols.length);
      }),
      { numRuns: 20 }
    );
  });

  /**
   * Property: Parsing should be idempotent - parsing an already parsed list
   * should produce the same result.
   */
  it('should be idempotent - parsing twice produces same result', () => {
    const assetListArray = fc.array(
      fc.string({ minLength: 1, maxLength: 10 }),
      { minLength: 1, maxLength: 10 }
    );
    
    fc.assert(
      fc.property(assetListArray, (symbols) => {
        const config: IConfiguration = {
          assetList: symbols,
          priceChangeThreshold: 1.5,
          monitoringInterval: 5,
          startTime: '11:30',
          endTime: '13:30',
          timezone: 'America/Santiago',
          mongoUri: 'mongodb://localhost:27017/test',
          telegramToken: 'test-token',
          telegramChatId: '123456',
          primaryApiKey: 'test-api-key'
        };
        
        const mockAssetMonitor = {} as IAssetMonitor;
        const mockAlertGenerator = {} as IAlertGenerator;
        const mockPriceTracker = {} as IPriceTracker;
        const mockNotificationService = {} as NotificationService;
        const mockMarketAPIClient = {} as IMarketAPIClient;
        
        const controller = new TradingBotController(
          mockAssetMonitor,
          mockAlertGenerator,
          mockPriceTracker,
          mockNotificationService,
          mockMarketAPIClient,
          config
        );
        
        const parseAssetList = (controller as any).parseAssetList.bind(controller);
        
        // Parse once
        const parsed1 = parseAssetList(symbols);
        
        // Parse the result again
        const parsed2 = parseAssetList(parsed1);
        
        // Should be identical
        expect(parsed2).toEqual(parsed1);
      }),
      { numRuns: 20 }
    );
  });

  /**
   * Property: Parsing should preserve the order of symbols.
   */
  it('should preserve the order of symbols', () => {
    const assetListArray = fc.array(
      fc.string({ minLength: 1, maxLength: 5 }).filter(s => s.trim().length > 0),
      { minLength: 2, maxLength: 10 }
    );
    
    fc.assert(
      fc.property(assetListArray, (symbols) => {
        const config: IConfiguration = {
          assetList: symbols,
          priceChangeThreshold: 1.5,
          monitoringInterval: 5,
          startTime: '11:30',
          endTime: '13:30',
          timezone: 'America/Santiago',
          mongoUri: 'mongodb://localhost:27017/test',
          telegramToken: 'test-token',
          telegramChatId: '123456',
          primaryApiKey: 'test-api-key'
        };
        
        const mockAssetMonitor = {} as IAssetMonitor;
        const mockAlertGenerator = {} as IAlertGenerator;
        const mockPriceTracker = {} as IPriceTracker;
        const mockNotificationService = {} as NotificationService;
        const mockMarketAPIClient = {} as IMarketAPIClient;
        
        const controller = new TradingBotController(
          mockAssetMonitor,
          mockAlertGenerator,
          mockPriceTracker,
          mockNotificationService,
          mockMarketAPIClient,
          config
        );
        
        const parseAssetList = (controller as any).parseAssetList.bind(controller);
        const parsed = parseAssetList(symbols);
        
        // Check that order is preserved
        const expectedOrder = symbols.map(s => s.trim()).filter(s => s.length > 0);
        expect(parsed).toEqual(expectedOrder);
      }),
      { numRuns: 20 }
    );
  });
});

describe('Property 2: Symbol Validation and Exclusion', () => {
  /**
   * **Validates: Requirements 1.3, 1.4, 12.3**
   * 
   * Property: For any Asset_List containing both valid and invalid symbols,
   * after validation, the monitored assets should only include valid symbols,
   * and warnings should be logged for each invalid symbol.
   * 
   * This property ensures that:
   * - Invalid symbols are excluded from monitoring
   * - Valid symbols are retained
   * - The system continues with valid symbols even when some are invalid
   */
  it('should exclude invalid symbols and retain only valid ones after validation', async () => {
    // Generator for asset symbols
    const validSymbol = fc.constantFrom('VTI', 'SPY', 'QQQ', 'AAPL', 'GOOGL', 'MSFT');
    const invalidSymbol = fc.constantFrom('INVALID', 'BADSTOCK', 'NOTREAL', 'XXX', 'ZZZ');
    
    // Generator for mixed list of valid and invalid symbols
    const mixedAssetList = fc.array(
      fc.oneof(
        validSymbol.map(s => ({ symbol: s, isValid: true })),
        invalidSymbol.map(s => ({ symbol: s, isValid: false }))
      ),
      { minLength: 2, maxLength: 10 }
    );
    
    await fc.assert(
      fc.asyncProperty(mixedAssetList, async (symbolData) => {
        // Ensure we have at least one valid and one invalid symbol
        const hasValid = symbolData.some(s => s.isValid);
        const hasInvalid = symbolData.some(s => !s.isValid);
        
        if (!hasValid || !hasInvalid) {
          // Skip this test case if we don't have both valid and invalid
          return;
        }
        
        const symbols = symbolData.map(s => s.symbol);
        const expectedValidSymbols = symbolData.filter(s => s.isValid).map(s => s.symbol);
        const expectedInvalidSymbols = symbolData.filter(s => !s.isValid).map(s => s.symbol);
        
        const config: IConfiguration = {
          assetList: symbols,
          priceChangeThreshold: 1.5,
          monitoringInterval: 5,
          startTime: '11:30',
          endTime: '13:30',
          timezone: 'America/Santiago',
          mongoUri: 'mongodb://localhost:27017/test',
          telegramToken: 'test-token',
          telegramChatId: '123456',
          primaryApiKey: 'test-api-key'
        };
        
        // Create mock dependencies
        const mockAssetMonitor = {
          initializeBasePrices: jest.fn().mockResolvedValue(new Map()),
          updateCurrentPrices: jest.fn().mockResolvedValue(new Map()),
          getBasePrice: jest.fn().mockReturnValue(null),
          getCurrentPrice: jest.fn().mockReturnValue(null)
        } as unknown as IAssetMonitor;
        
        const mockAlertGenerator = {
          evaluateAsset: jest.fn().mockResolvedValue(null),
          calculatePercentageChange: jest.fn().mockReturnValue(0),
          hasAlertedToday: jest.fn().mockResolvedValue(false)
        } as unknown as IAlertGenerator;
        
        const mockPriceTracker = {
          saveSignal: jest.fn().mockResolvedValue(undefined),
          getSignalsByAsset: jest.fn().mockResolvedValue([]),
          getLastFintualPrice: jest.fn().mockResolvedValue(null),
          hasSignalToday: jest.fn().mockResolvedValue(false)
        } as unknown as IPriceTracker;
        
        const mockNotificationService = {
          sendAlert: jest.fn().mockResolvedValue(undefined),
          sendError: jest.fn().mockResolvedValue(undefined),
          sendDailySummary: jest.fn().mockResolvedValue(undefined)
        } as unknown as NotificationService;
        
        // Mock API client that validates based on our test data
        const mockMarketAPIClient = {
          getPrice: jest.fn().mockResolvedValue(100),
          getPrices: jest.fn().mockResolvedValue(new Map()),
          validateSymbol: jest.fn().mockImplementation(async (symbol: string) => {
            const data = symbolData.find(s => s.symbol === symbol);
            return data ? data.isValid : false;
          })
        } as unknown as IMarketAPIClient;
        
        // Spy on console.warn to verify warnings are logged
        const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
        const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
        
        try {
          // Create controller instance
          const controller = new TradingBotController(
            mockAssetMonitor,
            mockAlertGenerator,
            mockPriceTracker,
            mockNotificationService,
            mockMarketAPIClient,
            config
          );
          
          // Access the private validateAndFilterAssets method
          const validateAndFilterAssets = (controller as any).validateAndFilterAssets.bind(controller);
          const validatedAssets = await validateAndFilterAssets(symbols);
          
          // Property 1: Only valid symbols should be in the result
          expect(validatedAssets).toEqual(expect.arrayContaining(expectedValidSymbols));
          expect(validatedAssets.length).toBe(expectedValidSymbols.length);
          
          // Property 2: Invalid symbols should not be in the result
          expectedInvalidSymbols.forEach(invalidSymbol => {
            expect(validatedAssets).not.toContain(invalidSymbol);
          });
          
          // Property 3: Warnings should be logged for invalid symbols
          expectedInvalidSymbols.forEach(invalidSymbol => {
            const warningLogged = consoleWarnSpy.mock.calls.some(call => 
              call.some(arg => typeof arg === 'string' && arg.includes(invalidSymbol) && arg.includes('invalid'))
            );
            expect(warningLogged).toBe(true);
          });
          
          // Property 4: Valid symbols should be logged as valid
          expectedValidSymbols.forEach(validSymbol => {
            const loggedAsValid = consoleLogSpy.mock.calls.some(call =>
              call.some(arg => typeof arg === 'string' && arg.includes(validSymbol) && arg.includes('valid'))
            );
            expect(loggedAsValid).toBe(true);
          });
          
        } finally {
          // Restore console methods
          consoleWarnSpy.mockRestore();
          consoleLogSpy.mockRestore();
        }
      }),
      { numRuns: 10 } // Reduced runs for async tests
    );
  });

  /**
   * Property: When all symbols are invalid, validation should return an empty array.
   */
  it('should return empty array when all symbols are invalid', async () => {
    const invalidSymbols = fc.array(
      fc.constantFrom('INVALID', 'BADSTOCK', 'NOTREAL', 'XXX', 'ZZZ'),
      { minLength: 1, maxLength: 5 }
    );
    
    await fc.assert(
      fc.asyncProperty(invalidSymbols, async (symbols) => {
        const config: IConfiguration = {
          assetList: symbols,
          priceChangeThreshold: 1.5,
          monitoringInterval: 5,
          startTime: '11:30',
          endTime: '13:30',
          timezone: 'America/Santiago',
          mongoUri: 'mongodb://localhost:27017/test',
          telegramToken: 'test-token',
          telegramChatId: '123456',
          primaryApiKey: 'test-api-key'
        };
        
        const mockAssetMonitor = {} as IAssetMonitor;
        const mockAlertGenerator = {} as IAlertGenerator;
        const mockPriceTracker = {} as IPriceTracker;
        const mockNotificationService = {} as NotificationService;
        
        // Mock API client that always returns false for validation
        const mockMarketAPIClient = {
          validateSymbol: jest.fn().mockResolvedValue(false)
        } as unknown as IMarketAPIClient;
        
        const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
        const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
        
        try {
          const controller = new TradingBotController(
            mockAssetMonitor,
            mockAlertGenerator,
            mockPriceTracker,
            mockNotificationService,
            mockMarketAPIClient,
            config
          );
          
          const validateAndFilterAssets = (controller as any).validateAndFilterAssets.bind(controller);
          const validatedAssets = await validateAndFilterAssets(symbols);
          
          // Should return empty array
          expect(validatedAssets).toEqual([]);
          expect(validatedAssets.length).toBe(0);
          
          // All symbols should have warnings
          expect(consoleWarnSpy).toHaveBeenCalled();
          
        } finally {
          consoleWarnSpy.mockRestore();
          consoleLogSpy.mockRestore();
        }
      }),
      { numRuns: 10 }
    );
  });

  /**
   * Property: When all symbols are valid, validation should return all symbols.
   */
  it('should return all symbols when all are valid', async () => {
    const validSymbols = fc.array(
      fc.constantFrom('VTI', 'SPY', 'QQQ', 'AAPL', 'GOOGL', 'MSFT'),
      { minLength: 1, maxLength: 5 }
    );
    
    await fc.assert(
      fc.asyncProperty(validSymbols, async (symbols) => {
        const config: IConfiguration = {
          assetList: symbols,
          priceChangeThreshold: 1.5,
          monitoringInterval: 5,
          startTime: '11:30',
          endTime: '13:30',
          timezone: 'America/Santiago',
          mongoUri: 'mongodb://localhost:27017/test',
          telegramToken: 'test-token',
          telegramChatId: '123456',
          primaryApiKey: 'test-api-key'
        };
        
        const mockAssetMonitor = {} as IAssetMonitor;
        const mockAlertGenerator = {} as IAlertGenerator;
        const mockPriceTracker = {} as IPriceTracker;
        const mockNotificationService = {} as NotificationService;
        
        // Mock API client that always returns true for validation
        const mockMarketAPIClient = {
          validateSymbol: jest.fn().mockResolvedValue(true)
        } as unknown as IMarketAPIClient;
        
        const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
        const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
        
        try {
          const controller = new TradingBotController(
            mockAssetMonitor,
            mockAlertGenerator,
            mockPriceTracker,
            mockNotificationService,
            mockMarketAPIClient,
            config
          );
          
          const validateAndFilterAssets = (controller as any).validateAndFilterAssets.bind(controller);
          const validatedAssets = await validateAndFilterAssets(symbols);
          
          // Should return all symbols
          expect(validatedAssets).toEqual(symbols);
          expect(validatedAssets.length).toBe(symbols.length);
          
          // No warnings should be logged for invalid symbols
          const invalidWarnings = consoleWarnSpy.mock.calls.filter(call =>
            call.some(arg => typeof arg === 'string' && arg.includes('invalid'))
          );
          expect(invalidWarnings.length).toBe(0);
          
        } finally {
          consoleWarnSpy.mockRestore();
          consoleLogSpy.mockRestore();
        }
      }),
      { numRuns: 10 }
    );
  });

  /**
   * Property: Validation should handle API errors gracefully and exclude symbols that fail validation.
   */
  it('should exclude symbols that throw errors during validation', async () => {
    const symbols = fc.array(
      fc.constantFrom('VTI', 'SPY', 'ERROR_SYMBOL', 'QQQ'),
      { minLength: 2, maxLength: 5 }
    );
    
    await fc.assert(
      fc.asyncProperty(symbols, async (symbolList) => {
        const config: IConfiguration = {
          assetList: symbolList,
          priceChangeThreshold: 1.5,
          monitoringInterval: 5,
          startTime: '11:30',
          endTime: '13:30',
          timezone: 'America/Santiago',
          mongoUri: 'mongodb://localhost:27017/test',
          telegramToken: 'test-token',
          telegramChatId: '123456',
          primaryApiKey: 'test-api-key'
        };
        
        const mockAssetMonitor = {} as IAssetMonitor;
        const mockAlertGenerator = {} as IAlertGenerator;
        const mockPriceTracker = {} as IPriceTracker;
        const mockNotificationService = {} as NotificationService;
        
        // Mock API client that throws error for ERROR_SYMBOL
        const mockMarketAPIClient = {
          validateSymbol: jest.fn().mockImplementation(async (symbol: string) => {
            if (symbol === 'ERROR_SYMBOL') {
              throw new Error('API Error');
            }
            return symbol !== 'ERROR_SYMBOL';
          })
        } as unknown as IMarketAPIClient;
        
        const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
        const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
        
        try {
          const controller = new TradingBotController(
            mockAssetMonitor,
            mockAlertGenerator,
            mockPriceTracker,
            mockNotificationService,
            mockMarketAPIClient,
            config
          );
          
          const validateAndFilterAssets = (controller as any).validateAndFilterAssets.bind(controller);
          const validatedAssets = await validateAndFilterAssets(symbolList);
          
          // ERROR_SYMBOL should not be in the result
          expect(validatedAssets).not.toContain('ERROR_SYMBOL');
          
          // Other valid symbols should be included
          const expectedValid = symbolList.filter(s => s !== 'ERROR_SYMBOL');
          expect(validatedAssets).toEqual(expectedValid);
          
          // Warning should be logged for ERROR_SYMBOL if it was in the list
          if (symbolList.includes('ERROR_SYMBOL')) {
            const errorWarningLogged = consoleWarnSpy.mock.calls.some(call =>
              call.some(arg => typeof arg === 'string' && arg.includes('ERROR_SYMBOL'))
            );
            expect(errorWarningLogged).toBe(true);
          }
          
        } finally {
          consoleWarnSpy.mockRestore();
          consoleLogSpy.mockRestore();
        }
      }),
      { numRuns: 10 }
    );
  });
});

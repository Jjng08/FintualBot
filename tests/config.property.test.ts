import fc from 'fast-check';
import { loadConfiguration, validateConfiguration } from '../src/utils/config';
import { IConfiguration } from '../src/types';

/**
 * Property-Based Tests for Configuration Validation
 * Feature: vti-gap-trading-alert
 * Task 2.5: Write property test for configuration validation
 * 
 * These tests validate universal properties that should hold true
 * for all possible configuration inputs.
 */

describe('Property 25: Configuration Validation', () => {
  // Store original environment
  const originalEnv = process.env;
  
  beforeEach(() => {
    // Reset environment before each test
    jest.resetModules();
    process.env = {};
  });
  
  afterAll(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  /**
   * **Validates: Requirements 11.6**
   * 
   * Property: For any required configuration variable that is missing or invalid,
   * the system should log an error and refuse to start the monitoring process.
   * 
   * This property ensures that the system fails fast with clear error messages
   * when configuration is incomplete or invalid.
   */
  it('should refuse to load configuration when any required variable is missing', () => {
    // Generator for valid configuration values
    const validMongoUri = fc.constantFrom(
      'mongodb://localhost:27017/test',
      'mongodb://user:pass@host:27017/db',
      'mongodb+srv://cluster.mongodb.net/db'
    );
    
    const validToken = fc.string({ minLength: 10, maxLength: 100 });
    const validChatId = fc.string({ minLength: 1, maxLength: 20 });
    const validApiKey = fc.string({ minLength: 10, maxLength: 100 });
    
    // Generator for which required field to omit
    const requiredFieldToOmit = fc.constantFrom(
      'MONGO_URI',
      'TELEGRAM_TOKEN',
      'TELEGRAM_CHAT_ID',
      'PRIMARY_API_KEY'
    );
    
    fc.assert(
      fc.property(
        validMongoUri,
        validToken,
        validChatId,
        validApiKey,
        requiredFieldToOmit,
        (mongoUri, token, chatId, apiKey, fieldToOmit) => {
          // Set all required fields except the one to omit
          if (fieldToOmit !== 'MONGO_URI') {
            process.env.MONGO_URI = mongoUri;
          }
          if (fieldToOmit !== 'TELEGRAM_TOKEN') {
            process.env.TELEGRAM_TOKEN = token;
          }
          if (fieldToOmit !== 'TELEGRAM_CHAT_ID') {
            process.env.TELEGRAM_CHAT_ID = chatId;
          }
          if (fieldToOmit !== 'PRIMARY_API_KEY') {
            process.env.PRIMARY_API_KEY = apiKey;
          }
          
          // Attempt to load configuration should throw
          expect(() => loadConfiguration()).toThrow();
          
          // Clean up for next iteration
          process.env = {};
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property: For any invalid numeric configuration value (negative or zero),
   * the system should refuse to load configuration.
   */
  it('should refuse to load configuration with invalid numeric values', () => {
    const validMongoUri = fc.constant('mongodb://localhost:27017/test');
    const validToken = fc.constant('test-token-12345');
    const validChatId = fc.constant('123456');
    const validApiKey = fc.constant('api-key-12345');
    
    // Generator for invalid numeric values (negative or zero)
    const invalidNumeric = fc.oneof(
      fc.double({ max: 0, noNaN: true }),  // Zero or negative
      fc.constant('not-a-number'),
      fc.constant('NaN'),
      fc.constant('-Infinity')
    );
    
    // Generator for which numeric field to make invalid
    const numericFieldToInvalidate = fc.constantFrom(
      'PRICE_CHANGE_THRESHOLD',
      'MONITORING_INTERVAL'
    );
    
    fc.assert(
      fc.property(
        validMongoUri,
        validToken,
        validChatId,
        validApiKey,
        invalidNumeric,
        numericFieldToInvalidate,
        (mongoUri, token, chatId, apiKey, invalidValue, fieldToInvalidate) => {
          // Set all required fields
          process.env.MONGO_URI = mongoUri;
          process.env.TELEGRAM_TOKEN = token;
          process.env.TELEGRAM_CHAT_ID = chatId;
          process.env.PRIMARY_API_KEY = apiKey;
          
          // Set the invalid numeric field
          process.env[fieldToInvalidate] = String(invalidValue);
          
          // Attempt to load configuration should throw
          expect(() => loadConfiguration()).toThrow();
          
          // Clean up for next iteration
          process.env = {};
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property: For any invalid time format, the system should refuse to load configuration.
   */
  it('should refuse to load configuration with invalid time format', () => {
    const validMongoUri = fc.constant('mongodb://localhost:27017/test');
    const validToken = fc.constant('test-token-12345');
    const validChatId = fc.constant('123456');
    const validApiKey = fc.constant('api-key-12345');
    
    // Generator for invalid time formats
    const invalidTimeFormat = fc.oneof(
      fc.constant('25:00'),  // Invalid hour
      fc.constant('12:60'),  // Invalid minute
      fc.constant('1:30'),   // Missing leading zero
      fc.constant('12:5'),   // Missing leading zero in minutes
      fc.constant('12-30'),  // Wrong separator
      fc.constant('1230'),   // No separator
      fc.constant('not-a-time')
    );
    
    // Generator for which time field to make invalid
    const timeFieldToInvalidate = fc.constantFrom('START_TIME', 'END_TIME');
    
    fc.assert(
      fc.property(
        validMongoUri,
        validToken,
        validChatId,
        validApiKey,
        invalidTimeFormat,
        timeFieldToInvalidate,
        (mongoUri, token, chatId, apiKey, invalidTime, fieldToInvalidate) => {
          // Set all required fields
          process.env.MONGO_URI = mongoUri;
          process.env.TELEGRAM_TOKEN = token;
          process.env.TELEGRAM_CHAT_ID = chatId;
          process.env.PRIMARY_API_KEY = apiKey;
          
          // Set the invalid time field
          process.env[fieldToInvalidate] = invalidTime;
          
          // Attempt to load configuration should throw
          expect(() => loadConfiguration()).toThrow();
          
          // Clean up for next iteration
          process.env = {};
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property: For any configuration with empty or whitespace-only asset list,
   * the system should refuse to load configuration.
   */
  it('should refuse to load configuration with empty asset list', () => {
    const validMongoUri = fc.constant('mongodb://localhost:27017/test');
    const validToken = fc.constant('test-token-12345');
    const validChatId = fc.constant('123456');
    const validApiKey = fc.constant('api-key-12345');
    
    // Generator for empty or whitespace-only asset lists that result in empty array after parsing
    // Note: Empty string "" falls back to default "VTI", so we test strings that parse to empty
    const emptyAssetList = fc.oneof(
      fc.constant('   '),
      fc.constant(',,,'),
      fc.constant('  ,  ,  '),
      fc.constant('\t\t'),
      fc.constant('\n\n'),
      fc.constant(' , , ')
    );
    
    fc.assert(
      fc.property(
        validMongoUri,
        validToken,
        validChatId,
        validApiKey,
        emptyAssetList,
        (mongoUri, token, chatId, apiKey, assetList) => {
          // Set all required fields
          process.env.MONGO_URI = mongoUri;
          process.env.TELEGRAM_TOKEN = token;
          process.env.TELEGRAM_CHAT_ID = chatId;
          process.env.PRIMARY_API_KEY = apiKey;
          process.env.ASSET_LIST = assetList;
          
          // Attempt to load configuration should throw
          expect(() => loadConfiguration()).toThrow('ASSET_LIST must contain at least one asset symbol');
          
          // Clean up for next iteration
          process.env = {};
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property: For any valid complete configuration, the system should
   * successfully load without throwing errors.
   */
  it('should successfully load configuration when all required fields are valid', () => {
    // Generators for valid configuration values
    const validMongoUri = fc.constantFrom(
      'mongodb://localhost:27017/test',
      'mongodb://user:pass@host:27017/db',
      'mongodb+srv://cluster.mongodb.net/db'
    );
    
    const validToken = fc.string({ minLength: 10, maxLength: 100 });
    const validChatId = fc.string({ minLength: 1, maxLength: 20 });
    const validApiKey = fc.string({ minLength: 10, maxLength: 100 });
    
    const validAssetList = fc.oneof(
      fc.constant('VTI'),
      fc.constant('VTI,SPY'),
      fc.constant('VTI,SPY,QQQ'),
      fc.constant('AAPL,GOOGL,MSFT')
    );
    
    const validThreshold = fc.double({ min: 0.1, max: 10, noNaN: true });
    const validInterval = fc.integer({ min: 1, max: 60 });
    
    fc.assert(
      fc.property(
        validMongoUri,
        validToken,
        validChatId,
        validApiKey,
        validAssetList,
        validThreshold,
        validInterval,
        (mongoUri, token, chatId, apiKey, assetList, threshold, interval) => {
          // Set all required fields with valid values
          process.env.MONGO_URI = mongoUri;
          process.env.TELEGRAM_TOKEN = token;
          process.env.TELEGRAM_CHAT_ID = chatId;
          process.env.PRIMARY_API_KEY = apiKey;
          process.env.ASSET_LIST = assetList;
          process.env.PRICE_CHANGE_THRESHOLD = String(threshold);
          process.env.MONITORING_INTERVAL = String(interval);
          
          // Should not throw
          expect(() => loadConfiguration()).not.toThrow();
          
          // Verify configuration was loaded correctly
          const config = loadConfiguration();
          expect(config.mongoUri).toBe(mongoUri);
          expect(config.telegramToken).toBe(token);
          expect(config.telegramChatId).toBe(chatId);
          expect(config.primaryApiKey).toBe(apiKey);
          expect(config.priceChangeThreshold).toBe(threshold);
          expect(config.monitoringInterval).toBe(interval);
          expect(config.assetList.length).toBeGreaterThan(0);
          
          // Clean up for next iteration
          process.env = {};
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property: validateConfiguration should throw for any configuration
   * object with missing or invalid required fields.
   */
  it('should reject configuration objects with invalid fields via validateConfiguration', () => {
    // Generator for configuration with one invalid field
    const invalidConfigArb = fc.oneof(
      // Missing mongoUri
      fc.record({
        assetList: fc.constant(['VTI'] as string[]),
        priceChangeThreshold: fc.constant(1.5),
        monitoringInterval: fc.constant(5),
        startTime: fc.constant('11:30'),
        endTime: fc.constant('13:30'),
        timezone: fc.constant('America/Santiago'),
        mongoUri: fc.constant(''),
        telegramToken: fc.constant('token'),
        telegramChatId: fc.constant('123'),
        primaryApiKey: fc.constant('key')
      }),
      // Missing telegramToken
      fc.record({
        assetList: fc.constant(['VTI'] as string[]),
        priceChangeThreshold: fc.constant(1.5),
        monitoringInterval: fc.constant(5),
        startTime: fc.constant('11:30'),
        endTime: fc.constant('13:30'),
        timezone: fc.constant('America/Santiago'),
        mongoUri: fc.constant('mongodb://localhost:27017/test'),
        telegramToken: fc.constant(''),
        telegramChatId: fc.constant('123'),
        primaryApiKey: fc.constant('key')
      }),
      // Empty asset list
      fc.record({
        assetList: fc.constant([] as string[]),
        priceChangeThreshold: fc.constant(1.5),
        monitoringInterval: fc.constant(5),
        startTime: fc.constant('11:30'),
        endTime: fc.constant('13:30'),
        timezone: fc.constant('America/Santiago'),
        mongoUri: fc.constant('mongodb://localhost:27017/test'),
        telegramToken: fc.constant('token'),
        telegramChatId: fc.constant('123'),
        primaryApiKey: fc.constant('key')
      }),
      // Negative threshold
      fc.record({
        assetList: fc.constant(['VTI'] as string[]),
        priceChangeThreshold: fc.double({ max: 0, noNaN: true }),
        monitoringInterval: fc.constant(5),
        startTime: fc.constant('11:30'),
        endTime: fc.constant('13:30'),
        timezone: fc.constant('America/Santiago'),
        mongoUri: fc.constant('mongodb://localhost:27017/test'),
        telegramToken: fc.constant('token'),
        telegramChatId: fc.constant('123'),
        primaryApiKey: fc.constant('key')
      }),
      // Negative interval
      fc.record({
        assetList: fc.constant(['VTI'] as string[]),
        priceChangeThreshold: fc.constant(1.5),
        monitoringInterval: fc.integer({ max: 0 }),
        startTime: fc.constant('11:30'),
        endTime: fc.constant('13:30'),
        timezone: fc.constant('America/Santiago'),
        mongoUri: fc.constant('mongodb://localhost:27017/test'),
        telegramToken: fc.constant('token'),
        telegramChatId: fc.constant('123'),
        primaryApiKey: fc.constant('key')
      })
    );
    
    fc.assert(
      fc.property(invalidConfigArb, (config) => {
        // validateConfiguration should throw for invalid config
        expect(() => validateConfiguration(config as unknown as IConfiguration)).toThrow();
      }),
      { numRuns: 20 }
    );
  });

  /**
   * Property: validateConfiguration should accept any configuration
   * object with all valid required fields.
   */
  it('should accept configuration objects with all valid fields via validateConfiguration', () => {
    const validConfigArb = fc.record({
      assetList: fc.array(
        fc.string({ minLength: 1, maxLength: 5 }),
        { minLength: 1, maxLength: 10 }
      ),
      priceChangeThreshold: fc.double({ min: 0.1, max: 10, noNaN: true }),
      monitoringInterval: fc.integer({ min: 1, max: 60 }),
      startTime: fc.constant('11:30'),
      endTime: fc.constant('13:30'),
      timezone: fc.constant('America/Santiago'),
      mongoUri: fc.constantFrom(
        'mongodb://localhost:27017/test',
        'mongodb://user:pass@host:27017/db'
      ),
      telegramToken: fc.string({ minLength: 10, maxLength: 100 }),
      telegramChatId: fc.string({ minLength: 1, maxLength: 20 }),
      primaryApiKey: fc.string({ minLength: 10, maxLength: 100 }),
      secondaryApiKey: fc.option(fc.string({ minLength: 10, maxLength: 100 }))
    });
    
    fc.assert(
      fc.property(validConfigArb, (config) => {
        // validateConfiguration should not throw for valid config
        expect(() => validateConfiguration(config as unknown as IConfiguration)).not.toThrow();
      }),
      { numRuns: 20 }
    );
  });
});

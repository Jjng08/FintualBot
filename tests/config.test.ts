/**
 * Unit Tests for Configuration Loader
 * Tests: Task 2.4 - Configuration loading from environment variables
 * Validates: Requirements 11.1, 11.2, 11.3, 11.4, 11.5, 11.6
 */

import { loadConfiguration, validateConfiguration } from '../src/utils/config';
import { IConfiguration } from '../src/types';

describe('Configuration Loader', () => {
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
  
  describe('loadConfiguration', () => {
    it('should load configuration with all required environment variables', () => {
      process.env.ASSET_LIST = 'VTI,SPY,QQQ';
      process.env.PRICE_CHANGE_THRESHOLD = '2.0';
      process.env.MONITORING_INTERVAL = '10';
      process.env.START_TIME = '11:30';
      process.env.END_TIME = '13:30';
      process.env.TIMEZONE = 'America/Santiago';
      process.env.MONGO_URI = 'mongodb://localhost:27017/test';
      process.env.TELEGRAM_TOKEN = 'test-token';
      process.env.TELEGRAM_CHAT_ID = '123456';
      process.env.PRIMARY_API_KEY = 'primary-key';
      process.env.SECONDARY_API_KEY = 'secondary-key';
      
      const config = loadConfiguration();
      
      expect(config.assetList).toEqual(['VTI', 'SPY', 'QQQ']);
      expect(config.priceChangeThreshold).toBe(2.0);
      expect(config.monitoringInterval).toBe(10);
      expect(config.startTime).toBe('11:30');
      expect(config.endTime).toBe('13:30');
      expect(config.timezone).toBe('America/Santiago');
      expect(config.mongoUri).toBe('mongodb://localhost:27017/test');
      expect(config.telegramToken).toBe('test-token');
      expect(config.telegramChatId).toBe('123456');
      expect(config.primaryApiKey).toBe('primary-key');
      expect(config.secondaryApiKey).toBe('secondary-key');
    });
    
    it('should use default values when optional variables are not set', () => {
      process.env.MONGO_URI = 'mongodb://localhost:27017/test';
      process.env.TELEGRAM_TOKEN = 'test-token';
      process.env.TELEGRAM_CHAT_ID = '123456';
      process.env.PRIMARY_API_KEY = 'primary-key';
      
      const config = loadConfiguration();
      
      // Requirement 11.5: Default Asset_List is "VTI"
      expect(config.assetList).toEqual(['VTI']);
      
      // Requirement 11.1: Default threshold is 1.5
      expect(config.priceChangeThreshold).toBe(1.5);
      
      // Requirement 11.4: Default interval is 5 minutes
      expect(config.monitoringInterval).toBe(5);
      
      expect(config.startTime).toBe('11:30');
      expect(config.endTime).toBe('13:30');
      expect(config.timezone).toBe('America/Santiago');
    });
    
    it('should accept TOKEN as alias for TELEGRAM_TOKEN', () => {
      process.env.MONGO_URI = 'mongodb://localhost:27017/test';
      process.env.TOKEN = 'test-token-from-token-var';
      process.env.TELEGRAM_CHAT_ID = '123456';
      process.env.PRIMARY_API_KEY = 'primary-key';
      
      const config = loadConfiguration();
      
      expect(config.telegramToken).toBe('test-token-from-token-var');
    });
    
    it('should prefer TELEGRAM_TOKEN over TOKEN if both are set', () => {
      process.env.MONGO_URI = 'mongodb://localhost:27017/test';
      process.env.TELEGRAM_TOKEN = 'telegram-token';
      process.env.TOKEN = 'token-var';
      process.env.TELEGRAM_CHAT_ID = '123456';
      process.env.PRIMARY_API_KEY = 'primary-key';
      
      const config = loadConfiguration();
      
      expect(config.telegramToken).toBe('telegram-token');
    });
    
    it('should trim whitespace from asset symbols', () => {
      process.env.ASSET_LIST = ' VTI , SPY , QQQ ';
      process.env.MONGO_URI = 'mongodb://localhost:27017/test';
      process.env.TELEGRAM_TOKEN = 'test-token';
      process.env.TELEGRAM_CHAT_ID = '123456';
      process.env.PRIMARY_API_KEY = 'primary-key';
      
      const config = loadConfiguration();
      
      expect(config.assetList).toEqual(['VTI', 'SPY', 'QQQ']);
    });
    
    it('should filter out empty asset symbols', () => {
      process.env.ASSET_LIST = 'VTI,,SPY,  ,QQQ';
      process.env.MONGO_URI = 'mongodb://localhost:27017/test';
      process.env.TELEGRAM_TOKEN = 'test-token';
      process.env.TELEGRAM_CHAT_ID = '123456';
      process.env.PRIMARY_API_KEY = 'primary-key';
      
      const config = loadConfiguration();
      
      expect(config.assetList).toEqual(['VTI', 'SPY', 'QQQ']);
    });
    
    // Requirement 11.6: Throw error if required variable is missing
    it('should throw error if MONGO_URI is missing', () => {
      process.env.TELEGRAM_TOKEN = 'test-token';
      process.env.TELEGRAM_CHAT_ID = '123456';
      process.env.PRIMARY_API_KEY = 'primary-key';
      
      expect(() => loadConfiguration()).toThrow('MONGO_URI environment variable is required');
    });
    
    it('should throw error if TELEGRAM_TOKEN and TOKEN are both missing', () => {
      process.env.MONGO_URI = 'mongodb://localhost:27017/test';
      process.env.TELEGRAM_CHAT_ID = '123456';
      process.env.PRIMARY_API_KEY = 'primary-key';
      
      expect(() => loadConfiguration()).toThrow('TELEGRAM_TOKEN or TOKEN environment variable is required');
    });
    
    it('should throw error if TELEGRAM_CHAT_ID is missing', () => {
      process.env.MONGO_URI = 'mongodb://localhost:27017/test';
      process.env.TELEGRAM_TOKEN = 'test-token';
      process.env.PRIMARY_API_KEY = 'primary-key';
      
      expect(() => loadConfiguration()).toThrow('TELEGRAM_CHAT_ID environment variable is required');
    });
    
    it('should throw error if PRIMARY_API_KEY is missing', () => {
      process.env.MONGO_URI = 'mongodb://localhost:27017/test';
      process.env.TELEGRAM_TOKEN = 'test-token';
      process.env.TELEGRAM_CHAT_ID = '123456';
      
      expect(() => loadConfiguration()).toThrow('PRIMARY_API_KEY environment variable is required');
    });
    
    it('should throw error if PRICE_CHANGE_THRESHOLD is not a positive number', () => {
      process.env.PRICE_CHANGE_THRESHOLD = '-1.5';
      process.env.MONGO_URI = 'mongodb://localhost:27017/test';
      process.env.TELEGRAM_TOKEN = 'test-token';
      process.env.TELEGRAM_CHAT_ID = '123456';
      process.env.PRIMARY_API_KEY = 'primary-key';
      
      expect(() => loadConfiguration()).toThrow('PRICE_CHANGE_THRESHOLD must be a positive number');
    });
    
    it('should throw error if PRICE_CHANGE_THRESHOLD is zero', () => {
      process.env.PRICE_CHANGE_THRESHOLD = '0';
      process.env.MONGO_URI = 'mongodb://localhost:27017/test';
      process.env.TELEGRAM_TOKEN = 'test-token';
      process.env.TELEGRAM_CHAT_ID = '123456';
      process.env.PRIMARY_API_KEY = 'primary-key';
      
      expect(() => loadConfiguration()).toThrow('PRICE_CHANGE_THRESHOLD must be a positive number');
    });
    
    it('should throw error if PRICE_CHANGE_THRESHOLD is not a number', () => {
      process.env.PRICE_CHANGE_THRESHOLD = 'not-a-number';
      process.env.MONGO_URI = 'mongodb://localhost:27017/test';
      process.env.TELEGRAM_TOKEN = 'test-token';
      process.env.TELEGRAM_CHAT_ID = '123456';
      process.env.PRIMARY_API_KEY = 'primary-key';
      
      expect(() => loadConfiguration()).toThrow('PRICE_CHANGE_THRESHOLD must be a positive number');
    });
    
    it('should throw error if MONITORING_INTERVAL is not a positive number', () => {
      process.env.MONITORING_INTERVAL = '-5';
      process.env.MONGO_URI = 'mongodb://localhost:27017/test';
      process.env.TELEGRAM_TOKEN = 'test-token';
      process.env.TELEGRAM_CHAT_ID = '123456';
      process.env.PRIMARY_API_KEY = 'primary-key';
      
      expect(() => loadConfiguration()).toThrow('MONITORING_INTERVAL must be a positive number');
    });
    
    it('should throw error if START_TIME is not in HH:mm format', () => {
      process.env.START_TIME = '25:00';
      process.env.MONGO_URI = 'mongodb://localhost:27017/test';
      process.env.TELEGRAM_TOKEN = 'test-token';
      process.env.TELEGRAM_CHAT_ID = '123456';
      process.env.PRIMARY_API_KEY = 'primary-key';
      
      expect(() => loadConfiguration()).toThrow('START_TIME must be in HH:mm format');
    });
    
    it('should throw error if END_TIME is not in HH:mm format', () => {
      process.env.END_TIME = '1:30';
      process.env.MONGO_URI = 'mongodb://localhost:27017/test';
      process.env.TELEGRAM_TOKEN = 'test-token';
      process.env.TELEGRAM_CHAT_ID = '123456';
      process.env.PRIMARY_API_KEY = 'primary-key';
      
      expect(() => loadConfiguration()).toThrow('END_TIME must be in HH:mm format');
    });
    
    it('should throw error if ASSET_LIST results in empty array', () => {
      process.env.ASSET_LIST = '  ,  ,  ';
      process.env.MONGO_URI = 'mongodb://localhost:27017/test';
      process.env.TELEGRAM_TOKEN = 'test-token';
      process.env.TELEGRAM_CHAT_ID = '123456';
      process.env.PRIMARY_API_KEY = 'primary-key';
      
      expect(() => loadConfiguration()).toThrow('ASSET_LIST must contain at least one asset symbol');
    });
  });
  
  describe('validateConfiguration', () => {
    it('should not throw for valid configuration', () => {
      const config: IConfiguration = {
        assetList: ['VTI'],
        priceChangeThreshold: 1.5,
        monitoringInterval: 5,
        startTime: '11:30',
        endTime: '13:30',
        timezone: 'America/Santiago',
        mongoUri: 'mongodb://localhost:27017/test',
        telegramToken: 'test-token',
        telegramChatId: '123456',
        primaryApiKey: 'primary-key'
      };
      
      expect(() => validateConfiguration(config)).not.toThrow();
    });
    
    it('should throw for missing mongoUri', () => {
      const config: IConfiguration = {
        assetList: ['VTI'],
        priceChangeThreshold: 1.5,
        monitoringInterval: 5,
        startTime: '11:30',
        endTime: '13:30',
        timezone: 'America/Santiago',
        mongoUri: '',
        telegramToken: 'test-token',
        telegramChatId: '123456',
        primaryApiKey: 'primary-key'
      };
      
      expect(() => validateConfiguration(config)).toThrow('MongoDB URI is required');
    });
    
    it('should throw for missing telegramToken', () => {
      const config: IConfiguration = {
        assetList: ['VTI'],
        priceChangeThreshold: 1.5,
        monitoringInterval: 5,
        startTime: '11:30',
        endTime: '13:30',
        timezone: 'America/Santiago',
        mongoUri: 'mongodb://localhost:27017/test',
        telegramToken: '',
        telegramChatId: '123456',
        primaryApiKey: 'primary-key'
      };
      
      expect(() => validateConfiguration(config)).toThrow('Telegram token is required');
    });
    
    it('should throw for empty asset list', () => {
      const config: IConfiguration = {
        assetList: [],
        priceChangeThreshold: 1.5,
        monitoringInterval: 5,
        startTime: '11:30',
        endTime: '13:30',
        timezone: 'America/Santiago',
        mongoUri: 'mongodb://localhost:27017/test',
        telegramToken: 'test-token',
        telegramChatId: '123456',
        primaryApiKey: 'primary-key'
      };
      
      expect(() => validateConfiguration(config)).toThrow('Asset list must contain at least one symbol');
    });
    
    it('should throw for negative price change threshold', () => {
      const config: IConfiguration = {
        assetList: ['VTI'],
        priceChangeThreshold: -1.5,
        monitoringInterval: 5,
        startTime: '11:30',
        endTime: '13:30',
        timezone: 'America/Santiago',
        mongoUri: 'mongodb://localhost:27017/test',
        telegramToken: 'test-token',
        telegramChatId: '123456',
        primaryApiKey: 'primary-key'
      };
      
      expect(() => validateConfiguration(config)).toThrow('Price change threshold must be positive');
    });
    
    it('should throw multiple errors in one message', () => {
      const config: IConfiguration = {
        assetList: [],
        priceChangeThreshold: -1.5,
        monitoringInterval: -5,
        startTime: '11:30',
        endTime: '13:30',
        timezone: 'America/Santiago',
        mongoUri: '',
        telegramToken: '',
        telegramChatId: '',
        primaryApiKey: ''
      };
      
      expect(() => validateConfiguration(config)).toThrow('Configuration validation failed');
    });
  });
});

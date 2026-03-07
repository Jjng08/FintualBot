/**
 * Unit Tests for MarketAPIClient
 * Tests: Task 4.4 - Market API Client functionality
 * Validates: Requirements 7.1, 7.2, 7.3, 7.4
 */

import { MarketAPIClient } from '../src/services/MarketAPIClient';

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

describe('MarketAPIClient', () => {
  let client: MarketAPIClient;
  const primaryApiKey = 'primary-test-key';
  const secondaryApiKey = 'secondary-test-key';
  
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'warn').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
  });
  
  afterEach(() => {
    jest.restoreAllMocks();
  });
  
  describe('getPrice - successful API calls', () => {
    it('should successfully fetch price from primary API', async () => {
      client = new MarketAPIClient(primaryApiKey);
      
      // Mock successful primary API call
      jest.spyOn(client as any, 'fetchPriceFromPrimaryAPI')
        .mockResolvedValueOnce(150.25);
      
      const price = await client.getPrice('VTI');
      
      expect(price).toBe(150.25);
      expect((client as any).fetchPriceFromPrimaryAPI).toHaveBeenCalledWith('VTI');
    });
    
    it('should return valid positive price', async () => {
      client = new MarketAPIClient(primaryApiKey);
      
      jest.spyOn(client as any, 'fetchPriceFromPrimaryAPI')
        .mockResolvedValueOnce(99.99);
      
      const price = await client.getPrice('SPY');
      
      expect(price).toBeGreaterThan(0);
      expect(typeof price).toBe('number');
      expect(isFinite(price)).toBe(true);
    });
  });
  
  describe('getPrice - fallback when primary fails', () => {
    it('should fallback to secondary API when primary fails', async () => {
      client = new MarketAPIClient(primaryApiKey, secondaryApiKey);
      
      // Mock primary failure and secondary success
      jest.spyOn(client as any, 'fetchPriceFromPrimaryAPI')
        .mockRejectedValueOnce(new Error('Primary API timeout'));
      jest.spyOn(client as any, 'fetchPriceFromSecondaryAPI')
        .mockResolvedValueOnce(150.50);
      
      const price = await client.getPrice('VTI');
      
      expect(price).toBe(150.50);
      expect((client as any).fetchPriceFromPrimaryAPI).toHaveBeenCalledWith('VTI');
      expect((client as any).fetchPriceFromSecondaryAPI).toHaveBeenCalledWith('VTI');
    });
    
    it('should not attempt fallback if secondary API key is not provided', async () => {
      client = new MarketAPIClient(primaryApiKey); // No secondary key
      
      jest.spyOn(client as any, 'fetchPriceFromPrimaryAPI')
        .mockRejectedValueOnce(new Error('Primary API failed'));
      
      await expect(client.getPrice('VTI')).rejects.toThrow('Failed to fetch price for VTI');
    });
    
    it('should throw error if both APIs fail', async () => {
      client = new MarketAPIClient(primaryApiKey, secondaryApiKey);
      
      jest.spyOn(client as any, 'fetchPriceFromPrimaryAPI')
        .mockRejectedValueOnce(new Error('Primary API failed'));
      jest.spyOn(client as any, 'fetchPriceFromSecondaryAPI')
        .mockRejectedValueOnce(new Error('Secondary API failed'));
      
      await expect(client.getPrice('VTI')).rejects.toThrow('Failed to fetch price for VTI');
    });
  });
  
  describe('getPrice - invalid price rejection', () => {
    it('should reject negative prices from primary API', async () => {
      client = new MarketAPIClient(primaryApiKey, secondaryApiKey);
      
      jest.spyOn(client as any, 'fetchPriceFromPrimaryAPI')
        .mockResolvedValueOnce(-10.5);
      jest.spyOn(client as any, 'fetchPriceFromSecondaryAPI')
        .mockResolvedValueOnce(150.25);
      
      // Should fallback to secondary due to invalid primary price
      const price = await client.getPrice('VTI');
      
      expect(price).toBe(150.25);
      expect((client as any).fetchPriceFromSecondaryAPI).toHaveBeenCalled();
    });
    
    it('should reject zero prices', async () => {
      client = new MarketAPIClient(primaryApiKey, secondaryApiKey);
      
      jest.spyOn(client as any, 'fetchPriceFromPrimaryAPI')
        .mockResolvedValueOnce(0);
      jest.spyOn(client as any, 'fetchPriceFromSecondaryAPI')
        .mockResolvedValueOnce(150.25);
      
      const price = await client.getPrice('VTI');
      
      expect(price).toBe(150.25);
    });
    
    it('should reject NaN prices', async () => {
      client = new MarketAPIClient(primaryApiKey, secondaryApiKey);
      
      jest.spyOn(client as any, 'fetchPriceFromPrimaryAPI')
        .mockResolvedValueOnce(NaN);
      jest.spyOn(client as any, 'fetchPriceFromSecondaryAPI')
        .mockResolvedValueOnce(150.25);
      
      const price = await client.getPrice('VTI');
      
      expect(price).toBe(150.25);
    });
    
    it('should reject Infinity prices', async () => {
      client = new MarketAPIClient(primaryApiKey, secondaryApiKey);
      
      jest.spyOn(client as any, 'fetchPriceFromPrimaryAPI')
        .mockResolvedValueOnce(Infinity);
      jest.spyOn(client as any, 'fetchPriceFromSecondaryAPI')
        .mockResolvedValueOnce(150.25);
      
      const price = await client.getPrice('VTI');
      
      expect(price).toBe(150.25);
    });
    
    it('should throw error if both APIs return invalid prices', async () => {
      client = new MarketAPIClient(primaryApiKey, secondaryApiKey);
      
      jest.spyOn(client as any, 'fetchPriceFromPrimaryAPI')
        .mockResolvedValueOnce(-10);
      jest.spyOn(client as any, 'fetchPriceFromSecondaryAPI')
        .mockResolvedValueOnce(0);
      
      await expect(client.getPrice('VTI')).rejects.toThrow('Failed to fetch price for VTI');
    });
  });
  
  describe('getPrice - timeout handling', () => {
    it('should handle primary API timeout and fallback', async () => {
      client = new MarketAPIClient(primaryApiKey, secondaryApiKey);
      
      jest.spyOn(client as any, 'fetchPriceFromPrimaryAPI')
        .mockRejectedValueOnce(new Error('Request timeout'));
      jest.spyOn(client as any, 'fetchPriceFromSecondaryAPI')
        .mockResolvedValueOnce(150.25);
      
      const price = await client.getPrice('VTI');
      
      expect(price).toBe(150.25);
    });
    
    it('should throw error if both APIs timeout', async () => {
      client = new MarketAPIClient(primaryApiKey, secondaryApiKey);
      
      jest.spyOn(client as any, 'fetchPriceFromPrimaryAPI')
        .mockRejectedValueOnce(new Error('Request timeout'));
      jest.spyOn(client as any, 'fetchPriceFromSecondaryAPI')
        .mockRejectedValueOnce(new Error('Request timeout'));
      
      await expect(client.getPrice('VTI')).rejects.toThrow('Failed to fetch price for VTI');
    });
  });
  
  describe('getPrices - batch requests', () => {
    it('should fetch prices for multiple symbols', async () => {
      client = new MarketAPIClient(primaryApiKey);
      
      jest.spyOn(client as any, 'fetchPriceFromPrimaryAPI')
        .mockResolvedValueOnce(150.25)
        .mockResolvedValueOnce(420.50)
        .mockResolvedValueOnce(380.75);
      
      const prices = await client.getPrices(['VTI', 'SPY', 'QQQ']);
      
      expect(prices.size).toBe(3);
      expect(prices.get('VTI')).toBe(150.25);
      expect(prices.get('SPY')).toBe(420.50);
      expect(prices.get('QQQ')).toBe(380.75);
    });
    
    it('should handle partial failures without affecting other symbols', async () => {
      client = new MarketAPIClient(primaryApiKey);
      
      jest.spyOn(client as any, 'fetchPriceFromPrimaryAPI')
        .mockResolvedValueOnce(150.25)
        .mockRejectedValueOnce(new Error('API error'))
        .mockResolvedValueOnce(380.75);
      
      const prices = await client.getPrices(['VTI', 'SPY', 'QQQ']);
      
      // Should have 2 successful prices
      expect(prices.size).toBe(2);
      expect(prices.get('VTI')).toBe(150.25);
      expect(prices.get('QQQ')).toBe(380.75);
      expect(prices.has('SPY')).toBe(false);
    });
    
    it('should return empty map if all symbols fail', async () => {
      client = new MarketAPIClient(primaryApiKey);
      
      jest.spyOn(client as any, 'fetchPriceFromPrimaryAPI')
        .mockRejectedValue(new Error('API error'));
      
      const prices = await client.getPrices(['VTI', 'SPY', 'QQQ']);
      
      expect(prices.size).toBe(0);
    });
  });
  
  describe('validateSymbol', () => {
    it('should validate valid symbols', async () => {
      client = new MarketAPIClient(primaryApiKey);
      
      jest.spyOn(client as any, 'validateSymbolWithAPI')
        .mockResolvedValueOnce(true);
      
      const isValid = await client.validateSymbol('VTI');
      
      expect(isValid).toBe(true);
    });
    
    it('should reject invalid symbols', async () => {
      client = new MarketAPIClient(primaryApiKey);
      
      jest.spyOn(client as any, 'validateSymbolWithAPI')
        .mockResolvedValueOnce(false);
      
      const isValid = await client.validateSymbol('INVALID123');
      
      expect(isValid).toBe(false);
    });
    
    it('should return false on validation error', async () => {
      client = new MarketAPIClient(primaryApiKey);
      
      jest.spyOn(client as any, 'validateSymbolWithAPI')
        .mockRejectedValueOnce(new Error('Validation API error'));
      
      const isValid = await client.validateSymbol('VTI');
      
      expect(isValid).toBe(false);
    });
  });
  
  describe('isValidPrice - private method validation', () => {
    beforeEach(() => {
      client = new MarketAPIClient(primaryApiKey);
    });
    
    it('should accept valid positive prices', () => {
      expect((client as any).isValidPrice(150.25)).toBe(true);
      expect((client as any).isValidPrice(0.01)).toBe(true);
      expect((client as any).isValidPrice(999999.99)).toBe(true);
    });
    
    it('should reject zero', () => {
      expect((client as any).isValidPrice(0)).toBe(false);
    });
    
    it('should reject negative numbers', () => {
      expect((client as any).isValidPrice(-1)).toBe(false);
      expect((client as any).isValidPrice(-150.25)).toBe(false);
    });
    
    it('should reject NaN', () => {
      expect((client as any).isValidPrice(NaN)).toBe(false);
    });
    
    it('should reject Infinity', () => {
      expect((client as any).isValidPrice(Infinity)).toBe(false);
      expect((client as any).isValidPrice(-Infinity)).toBe(false);
    });
    
    it('should reject non-number types', () => {
      expect((client as any).isValidPrice('150.25')).toBe(false);
      expect((client as any).isValidPrice(null)).toBe(false);
      expect((client as any).isValidPrice(undefined)).toBe(false);
    });
  });
});

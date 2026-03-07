import {
  retryWithBackoff,
  CircuitBreaker,
  CategorizedError,
  ErrorCategory,
  handleError
} from '../src/utils/errorHandling';

describe('Error Handling Utilities', () => {
  describe('retryWithBackoff', () => {
    it('should succeed on first attempt', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      const result = await retryWithBackoff(operation);
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });
    
    it('should retry with exponential backoff', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
        .mockResolvedValueOnce('success');
      
      const startTime = Date.now();
      const result = await retryWithBackoff(operation, 3, 100);
      const duration = Date.now() - startTime;
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(3);
      // Should have delays: 100ms (2^0) + 200ms (2^1) = 300ms minimum
      expect(duration).toBeGreaterThanOrEqual(300);
    });
    
    it('should throw after max retries exhausted', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('persistent failure'));
      
      await expect(retryWithBackoff(operation, 3, 10)).rejects.toThrow('persistent failure');
      expect(operation).toHaveBeenCalledTimes(3);
    });
    
    it('should use default parameters', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValueOnce('success');
      
      const result = await retryWithBackoff(operation);
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });
  });
  
  describe('CircuitBreaker', () => {
    it('should execute operation when circuit is closed', async () => {
      const breaker = new CircuitBreaker(3, 1000);
      const operation = jest.fn().mockResolvedValue('success');
      
      const result = await breaker.execute(operation);
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });
    
    it('should open circuit after threshold failures', async () => {
      const breaker = new CircuitBreaker(3, 1000);
      const operation = jest.fn().mockRejectedValue(new Error('failure'));
      
      // Fail 3 times to reach threshold
      await expect(breaker.execute(operation)).rejects.toThrow('failure');
      await expect(breaker.execute(operation)).rejects.toThrow('failure');
      await expect(breaker.execute(operation)).rejects.toThrow('failure');
      
      // Circuit should now be open
      const state = breaker.getState();
      expect(state.failures).toBe(3);
      expect(state.isOpen).toBe(true);
      
      // Next call should fail immediately without calling operation
      const callCount = operation.mock.calls.length;
      await expect(breaker.execute(operation)).rejects.toThrow('Circuit breaker is open');
      expect(operation).toHaveBeenCalledTimes(callCount); // No additional call
    });
    
    it('should reset circuit after timeout', async () => {
      const breaker = new CircuitBreaker(2, 100); // 100ms timeout
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('failure'))
        .mockRejectedValueOnce(new Error('failure'))
        .mockResolvedValueOnce('success');
      
      // Fail twice to open circuit
      await expect(breaker.execute(operation)).rejects.toThrow('failure');
      await expect(breaker.execute(operation)).rejects.toThrow('failure');
      
      expect(breaker.getState().isOpen).toBe(true);
      
      // Wait for reset timeout
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Circuit should be reset and allow operation
      const result = await breaker.execute(operation);
      expect(result).toBe('success');
      expect(breaker.getState().failures).toBe(0);
    });
    
    it('should reset failures on successful operation', async () => {
      const breaker = new CircuitBreaker(3, 1000);
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('failure'))
        .mockResolvedValueOnce('success');
      
      // One failure
      await expect(breaker.execute(operation)).rejects.toThrow('failure');
      expect(breaker.getState().failures).toBe(1);
      
      // Success should reset
      await breaker.execute(operation);
      expect(breaker.getState().failures).toBe(0);
    });
    
    it('should use custom threshold and timeout', async () => {
      const breaker = new CircuitBreaker(5, 2000);
      const operation = jest.fn().mockRejectedValue(new Error('failure'));
      
      // Fail 4 times - should not open yet
      for (let i = 0; i < 4; i++) {
        await expect(breaker.execute(operation)).rejects.toThrow('failure');
      }
      expect(breaker.getState().isOpen).toBe(false);
      
      // 5th failure should open circuit
      await expect(breaker.execute(operation)).rejects.toThrow('failure');
      expect(breaker.getState().isOpen).toBe(true);
    });
  });
  
  describe('CategorizedError', () => {
    it('should create error with category', () => {
      const error = new CategorizedError(
        'Test error',
        ErrorCategory.NETWORK,
        'VTI'
      );
      
      expect(error.message).toBe('Test error');
      expect(error.category).toBe(ErrorCategory.NETWORK);
      expect(error.asset).toBe('VTI');
      expect(error.name).toBe('CategorizedError');
    });
    
    it('should include original error', () => {
      const originalError = new Error('Original');
      const error = new CategorizedError(
        'Wrapped error',
        ErrorCategory.DATABASE,
        undefined,
        originalError
      );
      
      expect(error.originalError).toBe(originalError);
    });
  });
  
  describe('handleError', () => {
    let consoleErrorSpy: jest.SpyInstance;
    let consoleWarnSpy: jest.SpyInstance;
    
    beforeEach(() => {
      consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    });
    
    afterEach(() => {
      consoleErrorSpy.mockRestore();
      consoleWarnSpy.mockRestore();
    });
    
    it('should handle configuration errors as fatal', () => {
      const error = new CategorizedError(
        'Missing config',
        ErrorCategory.CONFIGURATION
      );
      
      const isRecoverable = handleError(error, { component: 'Config' });
      
      expect(isRecoverable).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[FATAL]'),
        expect.any(String)
      );
    });
    
    it('should handle network errors as recoverable', () => {
      const error = new CategorizedError(
        'Connection timeout',
        ErrorCategory.NETWORK,
        'VTI'
      );
      
      const isRecoverable = handleError(error, { 
        component: 'MarketAPI',
        asset: 'VTI'
      });
      
      expect(isRecoverable).toBe(true);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[WARN]'),
        expect.any(String)
      );
    });
    
    it('should handle validation errors as recoverable', () => {
      const error = new CategorizedError(
        'Invalid price',
        ErrorCategory.VALIDATION,
        'SPY'
      );
      
      const isRecoverable = handleError(error, {
        component: 'AssetMonitor',
        asset: 'SPY'
      });
      
      expect(isRecoverable).toBe(true);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[WARN]'),
        expect.any(String)
      );
    });
    
    it('should handle database errors as recoverable', () => {
      const error = new CategorizedError(
        'Connection lost',
        ErrorCategory.DATABASE
      );
      
      const isRecoverable = handleError(error, {
        component: 'DatabaseService'
      });
      
      expect(isRecoverable).toBe(true);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ERROR]'),
        expect.any(String)
      );
    });
    
    it('should handle uncategorized errors as recoverable', () => {
      const error = new Error('Unknown error');
      
      const isRecoverable = handleError(error, {
        component: 'SomeComponent'
      });
      
      expect(isRecoverable).toBe(true);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ERROR]'),
        expect.any(String)
      );
    });
    
    it('should include asset in log when provided', () => {
      const error = new CategorizedError(
        'Test error',
        ErrorCategory.NETWORK,
        'QQQ'
      );
      
      handleError(error, {
        component: 'TestComponent',
        asset: 'QQQ'
      });
      
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('QQQ'),
        expect.any(String)
      );
    });
  });
});

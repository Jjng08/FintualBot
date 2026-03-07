/**
 * Unit Tests for DatabaseService
 * Tests: Task 3.3 - Database connection management
 * Validates: Requirements 9.1, 9.4
 */

import mongoose from 'mongoose';
import { DatabaseService } from '../src/services/DatabaseService';

// Mock mongoose
jest.mock('mongoose', () => {
  const mockSchema = jest.fn().mockImplementation(() => ({
    index: jest.fn()
  }));
  
  return {
    connect: jest.fn(),
    disconnect: jest.fn(),
    connection: {
      readyState: 0,
      on: jest.fn()
    },
    Schema: mockSchema,
    model: jest.fn().mockReturnValue({})
  };
});

describe('DatabaseService', () => {
  let databaseService: DatabaseService;
  const testMongoUri = 'mongodb://localhost:27017/test';
  
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    
    // Reset connection state
    (mongoose.connection as any).readyState = 0;
    
    databaseService = new DatabaseService(testMongoUri);
  });
  
  afterEach(() => {
    jest.useRealTimers();
  });
  
  describe('connect', () => {
    it('should successfully connect to MongoDB', async () => {
      // Mock successful connection
      (mongoose.connect as jest.Mock).mockImplementationOnce(async () => {
        // Simulate successful connection by setting readyState
        (mongoose.connection as any).readyState = 1;
      });
      
      await databaseService.connect();
      
      expect(mongoose.connect).toHaveBeenCalledWith(testMongoUri);
      expect(databaseService.isConnected()).toBe(true);
    });
    
    it('should not attempt connection if already connected', async () => {
      // Set as already connected
      (mongoose.connection as any).readyState = 1;
      
      await databaseService.connect();
      
      expect(mongoose.connect).not.toHaveBeenCalled();
    });
    
    it('should not attempt connection if connection is in progress', async () => {
      // Use real timers for this test since we need actual async behavior
      jest.useRealTimers();
      
      // Mock a slow connection
      (mongoose.connect as jest.Mock).mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 50))
      );
      
      // Start first connection
      const firstConnect = databaseService.connect();
      
      // Give it a moment to start
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Try to connect again while first is in progress
      await databaseService.connect();
      
      // Only one call should have been made
      expect(mongoose.connect).toHaveBeenCalledTimes(1);
      
      // Clean up - wait for first connection to complete
      await firstConnect;
      
      // Restore fake timers for other tests
      jest.useFakeTimers();
    });
  });
  
  describe('retry on failure', () => {
    it('should schedule retry after connection failure', async () => {
      const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
      
      // Mock connection failure
      const connectionError = new Error('Connection failed');
      (mongoose.connect as jest.Mock).mockRejectedValueOnce(connectionError);
      
      // Attempt connection and expect it to throw
      await expect(databaseService.connect()).rejects.toThrow('Connection failed');
      
      // Verify retry is scheduled (by checking setTimeout was called)
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 30000);
      
      setTimeoutSpy.mockRestore();
    });
    
    it('should retry connection after 30 seconds', async () => {
      // Mock first connection failure, then success
      (mongoose.connect as jest.Mock)
        .mockRejectedValueOnce(new Error('Connection failed'))
        .mockResolvedValueOnce(undefined);
      
      // First attempt fails
      await expect(databaseService.connect()).rejects.toThrow('Connection failed');
      
      // Fast-forward 30 seconds
      jest.advanceTimersByTime(30000);
      
      // Wait for retry to complete
      await Promise.resolve();
      
      // Verify connect was called twice (initial + retry)
      expect(mongoose.connect).toHaveBeenCalledTimes(2);
    });
    
    it('should not schedule multiple retries', async () => {
      // Mock connection failures
      (mongoose.connect as jest.Mock).mockRejectedValue(new Error('Connection failed'));
      
      // First attempt fails
      await expect(databaseService.connect()).rejects.toThrow('Connection failed');
      
      // Clear the mock to count new calls
      jest.clearAllTimers();
      const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
      
      // Second attempt fails
      await expect(databaseService.connect()).rejects.toThrow('Connection failed');
      
      // Should not schedule another retry since one is already scheduled
      expect(setTimeoutSpy).not.toHaveBeenCalled();
      
      setTimeoutSpy.mockRestore();
    });
    
    it('should continue retrying on repeated failures', async () => {
      // Mock repeated connection failures
      (mongoose.connect as jest.Mock).mockRejectedValue(new Error('Connection failed'));
      
      // First attempt fails
      await expect(databaseService.connect()).rejects.toThrow('Connection failed');
      
      // Fast-forward and let retry happen
      jest.advanceTimersByTime(30000);
      await Promise.resolve();
      
      // Fast-forward and let second retry happen
      jest.advanceTimersByTime(30000);
      await Promise.resolve();
      
      // Verify multiple retry attempts
      expect(mongoose.connect).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });
  });
  
  describe('disconnect', () => {
    it('should successfully disconnect from MongoDB', async () => {
      // Set as connected
      (mongoose.connection as any).readyState = 1;
      (mongoose.disconnect as jest.Mock).mockResolvedValueOnce(undefined);
      
      await databaseService.disconnect();
      
      expect(mongoose.disconnect).toHaveBeenCalled();
    });
    
    it('should not attempt disconnect if not connected', async () => {
      // Set as not connected
      (mongoose.connection as any).readyState = 0;
      
      await databaseService.disconnect();
      
      expect(mongoose.disconnect).not.toHaveBeenCalled();
    });
    
    it('should clear retry timer on disconnect', async () => {
      const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
      
      // Mock connection failure to schedule retry
      (mongoose.connect as jest.Mock).mockRejectedValueOnce(new Error('Connection failed'));
      
      await expect(databaseService.connect()).rejects.toThrow('Connection failed');
      
      // Verify retry was scheduled
      expect(setTimeoutSpy).toHaveBeenCalled();
      
      // Disconnect should clear the timer
      await databaseService.disconnect();
      
      // Fast-forward time - retry should not happen
      const connectCallsBefore = (mongoose.connect as jest.Mock).mock.calls.length;
      jest.advanceTimersByTime(30000);
      await Promise.resolve();
      
      // Connect should not have been called again
      expect(mongoose.connect).toHaveBeenCalledTimes(connectCallsBefore);
      
      setTimeoutSpy.mockRestore();
    });
    
    it('should throw error if disconnect fails', async () => {
      // Set as connected
      (mongoose.connection as any).readyState = 1;
      
      const disconnectError = new Error('Disconnect failed');
      (mongoose.disconnect as jest.Mock).mockRejectedValueOnce(disconnectError);
      
      await expect(databaseService.disconnect()).rejects.toThrow('Disconnect failed');
    });
  });
  
  describe('isConnected', () => {
    it('should return true when connected', () => {
      (mongoose.connection as any).readyState = 1;
      
      expect(databaseService.isConnected()).toBe(true);
    });
    
    it('should return false when disconnected', () => {
      (mongoose.connection as any).readyState = 0;
      
      expect(databaseService.isConnected()).toBe(false);
    });
    
    it('should return false when connecting', () => {
      (mongoose.connection as any).readyState = 2;
      
      expect(databaseService.isConnected()).toBe(false);
    });
    
    it('should return false when disconnecting', () => {
      (mongoose.connection as any).readyState = 3;
      
      expect(databaseService.isConnected()).toBe(false);
    });
  });
  
  describe('getSignalModel', () => {
    it('should return Signal model when connected', () => {
      // Set as connected
      (mongoose.connection as any).readyState = 1;
      
      const model = databaseService.getSignalModel();
      
      expect(model).toBeDefined();
    });
    
    it('should throw error when not connected', () => {
      // Set as not connected
      (mongoose.connection as any).readyState = 0;
      
      expect(() => databaseService.getSignalModel()).toThrow(
        'Database is not connected. Call connect() first.'
      );
    });
  });
});

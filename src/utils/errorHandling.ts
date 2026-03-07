/**
 * Error handling utilities for VTI Gap Trading Alert
 * Implements retry mechanisms and circuit breaker patterns
 */

/**
 * Error categories for different handling strategies
 */
export enum ErrorCategory {
  CONFIGURATION = 'CONFIGURATION',  // Fatal - stop bot
  NETWORK = 'NETWORK',              // Recoverable with retry
  VALIDATION = 'VALIDATION',        // Recoverable - skip asset
  DATABASE = 'DATABASE'             // Retry up to 3 times
}

/**
 * Custom error class with category
 */
export class CategorizedError extends Error {
  constructor(
    message: string,
    public category: ErrorCategory,
    public asset?: string,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'CategorizedError';
  }
}

/**
 * Sleep utility for delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry an operation with exponential backoff
 * 
 * @param operation - Async function to retry
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 * @param baseDelay - Base delay in milliseconds (default: 1000)
 * @returns Result of the operation
 * @throws Error if all retries are exhausted
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === maxRetries - 1) {
        throw error;
      }
      const delay = baseDelay * Math.pow(2, attempt);
      await sleep(delay);
    }
  }
  throw new Error('Max retries exceeded');
}

/**
 * Circuit breaker for API calls
 * Prevents cascading failures by opening circuit after threshold failures
 */
export class CircuitBreaker {
  private failures = 0;
  private lastFailureTime?: Date;
  private readonly threshold: number;
  private readonly resetTimeout: number;
  
  /**
   * @param threshold - Number of failures before opening circuit (default: 5)
   * @param resetTimeout - Time in ms before attempting to close circuit (default: 60000)
   */
  constructor(threshold: number = 5, resetTimeout: number = 60000) {
    this.threshold = threshold;
    this.resetTimeout = resetTimeout;
  }
  
  /**
   * Execute an operation through the circuit breaker
   * 
   * @param operation - Async function to execute
   * @returns Result of the operation
   * @throws Error if circuit is open or operation fails
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.isOpen()) {
      throw new Error('Circuit breaker is open');
    }
    
    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
  
  /**
   * Check if circuit is open
   */
  private isOpen(): boolean {
    if (this.failures >= this.threshold) {
      const now = new Date();
      if (this.lastFailureTime && 
          now.getTime() - this.lastFailureTime.getTime() < this.resetTimeout) {
        return true;
      }
      this.reset();
    }
    return false;
  }
  
  /**
   * Handle successful operation
   */
  private onSuccess(): void {
    this.failures = 0;
  }
  
  /**
   * Handle failed operation
   */
  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = new Date();
  }
  
  /**
   * Reset circuit breaker state
   */
  private reset(): void {
    this.failures = 0;
    this.lastFailureTime = undefined;
  }
  
  /**
   * Get current state for monitoring
   */
  getState(): { failures: number; isOpen: boolean } {
    return {
      failures: this.failures,
      isOpen: this.isOpen()
    };
  }
}

/**
 * Handle errors based on their category
 * 
 * @param error - Error to handle
 * @param context - Additional context (component, asset, etc.)
 * @returns true if error is recoverable, false if fatal
 */
export function handleError(
  error: Error | CategorizedError,
  context: { component: string; asset?: string }
): boolean {
  if (error instanceof CategorizedError) {
    switch (error.category) {
      case ErrorCategory.CONFIGURATION:
        // Fatal - log and return false to stop bot
        console.error(`[FATAL] Configuration error in ${context.component}:`, error.message);
        return false;
      
      case ErrorCategory.NETWORK:
        // Recoverable with retry - log warning
        console.warn(`[WARN] Network error in ${context.component}${context.asset ? ` for ${context.asset}` : ''}:`, error.message);
        return true;
      
      case ErrorCategory.VALIDATION:
        // Recoverable - skip asset and continue
        console.warn(`[WARN] Validation error in ${context.component}${context.asset ? ` for ${context.asset}` : ''}:`, error.message);
        return true;
      
      case ErrorCategory.DATABASE:
        // Retry up to 3 times
        console.error(`[ERROR] Database error in ${context.component}:`, error.message);
        return true;
      
      default:
        console.error(`[ERROR] Unknown error in ${context.component}:`, error.message);
        return true;
    }
  }
  
  // Unknown error type - log and treat as recoverable
  console.error(`[ERROR] Uncategorized error in ${context.component}:`, error.message);
  return true;
}

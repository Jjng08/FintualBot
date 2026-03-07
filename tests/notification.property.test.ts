import fc from 'fast-check';
import TelegramBot from 'node-telegram-bot-api';
import { NotificationService } from '../src/services/NotificationService';
import { ISignal } from '../src/models/Signal';

/**
 * Property-Based Tests for Notification Service
 * Feature: vti-gap-trading-alert
 * 
 * These tests validate universal properties related to notification
 * completeness and message formatting.
 */

describe('Notification Properties', () => {
  let notificationService: NotificationService;
  let mockBot: jest.Mocked<TelegramBot>;
  let sentMessages: Array<{ chatId: string; message: string; options?: any }>;

  beforeEach(() => {
    // Track all sent messages
    sentMessages = [];

    // Create a mock Telegram bot
    mockBot = {
      sendMessage: jest.fn().mockImplementation((chatId, message, options) => {
        sentMessages.push({ chatId, message, options });
        return Promise.resolve({ message_id: 1, chat: { id: chatId }, date: Date.now() });
      })
    } as any;

    // Create notification service with mock bot
    const testChatId = '123456789';
    notificationService = new NotificationService('test-token', testChatId);
    
    // Replace the internal bot with our mock
    (notificationService as any).bot = mockBot;
  });

  /**
   * Property 11: Notification on Signal Creation
   * **Validates: Requirements 4.3**
   * 
   * For any Signal created, the system should send exactly one notification
   * to Telegram containing the signal information.
   */
  describe('Property 11: Notification on Signal Creation', () => {
    it('should send exactly one notification for any signal', async () => {
      // Generator for valid asset symbols
      const assetSymbolArb = fc.string({ 
        minLength: 1, 
        maxLength: 5,
        unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ')
      });

      // Generator for prices
      const priceArb = fc.double({ 
        min: 1, 
        max: 10000, 
        noNaN: true,
        noDefaultInfinity: true
      });

      // Generator for percentage changes >= 1.5%
      const percentageChangeArb = fc.double({ 
        min: 1.5, 
        max: 50, 
        noNaN: true,
        noDefaultInfinity: true
      });

      // Generator for dates
      const dateArb = fc.date({ 
        min: new Date('2024-01-01'), 
        max: new Date('2025-12-31') 
      });

      await fc.assert(
        fc.asyncProperty(
          assetSymbolArb,
          priceArb,
          priceArb,
          percentageChangeArb,
          dateArb,
          async (asset, marketPrice, fintualPrice, diff, createAt) => {
            // Reset sent messages for this iteration
            sentMessages = [];
            mockBot.sendMessage.mockClear();

            // Create a signal
            const signal: ISignal = {
              asset,
              marketPrice,
              fintualPrice,
              diff,
              createAt
            } as ISignal;

            // Send alert
            await notificationService.sendAlert(signal);

            // Verify exactly one message was sent
            expect(mockBot.sendMessage).toHaveBeenCalledTimes(1);
            expect(sentMessages).toHaveLength(1);
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should send notification to correct chat ID', async () => {
      const testChatId = '987654321';
      const customService = new NotificationService('test-token', testChatId);
      (customService as any).bot = mockBot;

      const assetSymbolArb = fc.string({ 
        minLength: 1, 
        maxLength: 5,
        unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ')
      });

      const priceArb = fc.double({ 
        min: 1, 
        max: 10000, 
        noNaN: true,
        noDefaultInfinity: true
      });

      const percentageChangeArb = fc.double({ 
        min: 1.5, 
        max: 50, 
        noNaN: true,
        noDefaultInfinity: true
      });

      await fc.assert(
        fc.asyncProperty(
          assetSymbolArb,
          priceArb,
          priceArb,
          percentageChangeArb,
          async (asset, marketPrice, fintualPrice, diff) => {
            sentMessages = [];
            mockBot.sendMessage.mockClear();

            const signal: ISignal = {
              asset,
              marketPrice,
              fintualPrice,
              diff,
              createAt: new Date()
            } as ISignal;

            await customService.sendAlert(signal);

            // Verify message was sent to correct chat ID
            expect(mockBot.sendMessage).toHaveBeenCalledWith(
              testChatId,
              expect.any(String),
              expect.any(Object)
            );
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  /**
   * Property 14: Notification Message Completeness
   * **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5**
   * 
   * For any Signal, the notification message should contain all required information:
   * Asset_Symbol, current market price, percentage change, timestamp, and action recommendation.
   */
  describe('Property 14: Notification Message Completeness', () => {
    it('should include all required fields in notification message', async () => {
      const assetSymbolArb = fc.string({ 
        minLength: 1, 
        maxLength: 5,
        unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ')
      });

      const priceArb = fc.double({ 
        min: 1, 
        max: 10000, 
        noNaN: true,
        noDefaultInfinity: true
      });

      const percentageChangeArb = fc.double({ 
        min: 1.5, 
        max: 50, 
        noNaN: true,
        noDefaultInfinity: true
      });

      const dateArb = fc.date({ 
        min: new Date('2024-01-01'), 
        max: new Date('2025-12-31') 
      });

      await fc.assert(
        fc.asyncProperty(
          assetSymbolArb,
          priceArb,
          priceArb,
          percentageChangeArb,
          dateArb,
          async (asset, marketPrice, fintualPrice, diff, createAt) => {
            sentMessages = [];
            mockBot.sendMessage.mockClear();

            const signal: ISignal = {
              asset,
              marketPrice,
              fintualPrice,
              diff,
              createAt
            } as ISignal;

            await notificationService.sendAlert(signal);

            // Get the sent message
            expect(sentMessages).toHaveLength(1);
            const message = sentMessages[0].message;

            // Requirement 5.1: Message SHALL include Asset_Symbol
            expect(message).toContain(asset);

            // Requirement 5.2: Message SHALL include current market price
            const marketPriceFormatted = marketPrice.toFixed(2);
            expect(message).toContain(marketPriceFormatted);

            // Requirement 5.3: Message SHALL include percentage change
            const diffFormatted = diff.toFixed(2);
            expect(message).toContain(diffFormatted);
            expect(message).toMatch(/%/); // Should contain percentage symbol

            // Requirement 5.4: Message SHALL include timestamp
            // The timestamp should be formatted in Chilean time
            const timestamp = createAt.toLocaleString('es-CL', {
              timeZone: 'America/Santiago',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit'
            });
            expect(message).toContain(timestamp);

            // Requirement 5.5: Message SHALL include action recommendation
            // Should contain recommendation to buy in Fintual
            expect(message.toLowerCase()).toMatch(/comprar|recomendación/);
            expect(message.toLowerCase()).toContain('fintual');
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should format prices with exactly 2 decimal places', async () => {
      const assetSymbolArb = fc.string({ 
        minLength: 1, 
        maxLength: 5,
        unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ')
      });

      // Generate prices with various decimal places
      const priceArb = fc.double({ 
        min: 1, 
        max: 10000, 
        noNaN: true,
        noDefaultInfinity: true
      });

      const percentageChangeArb = fc.double({ 
        min: 1.5, 
        max: 50, 
        noNaN: true,
        noDefaultInfinity: true
      });

      await fc.assert(
        fc.asyncProperty(
          assetSymbolArb,
          priceArb,
          priceArb,
          percentageChangeArb,
          async (asset, marketPrice, fintualPrice, diff) => {
            sentMessages = [];
            mockBot.sendMessage.mockClear();

            const signal: ISignal = {
              asset,
              marketPrice,
              fintualPrice,
              diff,
              createAt: new Date()
            } as ISignal;

            await notificationService.sendAlert(signal);

            const message = sentMessages[0].message;

            // Verify prices are formatted with 2 decimal places
            const marketPriceFormatted = marketPrice.toFixed(2);
            const fintualPriceFormatted = fintualPrice.toFixed(2);
            const diffFormatted = diff.toFixed(2);

            expect(message).toContain(marketPriceFormatted);
            expect(message).toContain(fintualPriceFormatted);
            expect(message).toContain(diffFormatted);
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should use Chilean timezone for timestamp formatting', async () => {
      const assetSymbolArb = fc.string({ 
        minLength: 1, 
        maxLength: 5,
        unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ')
      });

      const priceArb = fc.double({ 
        min: 1, 
        max: 10000, 
        noNaN: true,
        noDefaultInfinity: true
      });

      const percentageChangeArb = fc.double({ 
        min: 1.5, 
        max: 50, 
        noNaN: true,
        noDefaultInfinity: true
      });

      // Generate dates during trading hours
      const dateArb = fc.date({ 
        min: new Date('2024-01-01T11:30:00'), 
        max: new Date('2024-12-31T13:30:00') 
      });

      await fc.assert(
        fc.asyncProperty(
          assetSymbolArb,
          priceArb,
          priceArb,
          percentageChangeArb,
          dateArb,
          async (asset, marketPrice, fintualPrice, diff, createAt) => {
            sentMessages = [];
            mockBot.sendMessage.mockClear();

            const signal: ISignal = {
              asset,
              marketPrice,
              fintualPrice,
              diff,
              createAt
            } as ISignal;

            await notificationService.sendAlert(signal);

            const message = sentMessages[0].message;

            // Verify timestamp is formatted in Chilean timezone
            const expectedTimestamp = createAt.toLocaleString('es-CL', {
              timeZone: 'America/Santiago',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit'
            });

            expect(message).toContain(expectedTimestamp);
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should include both market and estimated Fintual prices', async () => {
      const assetSymbolArb = fc.string({ 
        minLength: 1, 
        maxLength: 5,
        unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ')
      });

      const priceArb = fc.double({ 
        min: 1, 
        max: 10000, 
        noNaN: true,
        noDefaultInfinity: true
      });

      const percentageChangeArb = fc.double({ 
        min: 1.5, 
        max: 50, 
        noNaN: true,
        noDefaultInfinity: true
      });

      await fc.assert(
        fc.asyncProperty(
          assetSymbolArb,
          priceArb,
          priceArb,
          percentageChangeArb,
          async (asset, marketPrice, fintualPrice, diff) => {
            sentMessages = [];
            mockBot.sendMessage.mockClear();

            const signal: ISignal = {
              asset,
              marketPrice,
              fintualPrice,
              diff,
              createAt: new Date()
            } as ISignal;

            await notificationService.sendAlert(signal);

            const message = sentMessages[0].message;

            // Both prices should be present and different (in most cases)
            const marketPriceStr = marketPrice.toFixed(2);
            const fintualPriceStr = fintualPrice.toFixed(2);

            expect(message).toContain(marketPriceStr);
            expect(message).toContain(fintualPriceStr);
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should use Markdown formatting', async () => {
      const assetSymbolArb = fc.string({ 
        minLength: 1, 
        maxLength: 5,
        unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ')
      });

      const priceArb = fc.double({ 
        min: 1, 
        max: 10000, 
        noNaN: true,
        noDefaultInfinity: true
      });

      const percentageChangeArb = fc.double({ 
        min: 1.5, 
        max: 50, 
        noNaN: true,
        noDefaultInfinity: true
      });

      await fc.assert(
        fc.asyncProperty(
          assetSymbolArb,
          priceArb,
          priceArb,
          percentageChangeArb,
          async (asset, marketPrice, fintualPrice, diff) => {
            sentMessages = [];
            mockBot.sendMessage.mockClear();

            const signal: ISignal = {
              asset,
              marketPrice,
              fintualPrice,
              diff,
              createAt: new Date()
            } as ISignal;

            await notificationService.sendAlert(signal);

            // Verify Markdown parse mode was used
            expect(mockBot.sendMessage).toHaveBeenCalledWith(
              expect.any(String),
              expect.any(String),
              expect.objectContaining({ parse_mode: 'Markdown' })
            );
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe('Error Handling', () => {
    it('should not throw when Telegram API fails', async () => {
      // Make the mock throw an error
      mockBot.sendMessage.mockRejectedValue(new Error('Telegram API error'));

      const signal: ISignal = {
        asset: 'VTI',
        marketPrice: 102,
        fintualPrice: 100,
        diff: 2.0,
        createAt: new Date()
      } as ISignal;

      // Should not throw
      await expect(notificationService.sendAlert(signal)).resolves.not.toThrow();
    });

    it('should handle any signal without throwing', async () => {
      const assetSymbolArb = fc.string({ 
        minLength: 1, 
        maxLength: 5,
        unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ')
      });

      const priceArb = fc.double({ 
        min: 1, 
        max: 10000, 
        noNaN: true,
        noDefaultInfinity: true
      });

      const percentageChangeArb = fc.double({ 
        min: 1.5, 
        max: 50, 
        noNaN: true,
        noDefaultInfinity: true
      });

      await fc.assert(
        fc.asyncProperty(
          assetSymbolArb,
          priceArb,
          priceArb,
          percentageChangeArb,
          async (asset, marketPrice, fintualPrice, diff) => {
            const signal: ISignal = {
              asset,
              marketPrice,
              fintualPrice,
              diff,
              createAt: new Date()
            } as ISignal;

            // Should not throw regardless of input
            await expect(notificationService.sendAlert(signal)).resolves.not.toThrow();
          }
        ),
        { numRuns: 20 }
      );
    });
  });
});

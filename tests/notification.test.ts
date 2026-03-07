/**
 * Unit tests for NotificationService
 * Tests specific examples and edge cases for notification formatting and sending
 */

import { NotificationService } from '../src/services/NotificationService';
import { ISignal } from '../src/models/Signal';
import { DailySummary } from '../src/types';
import TelegramBot from 'node-telegram-bot-api';

// Mock TelegramBot
jest.mock('node-telegram-bot-api');

describe('NotificationService', () => {
  let notificationService: NotificationService;
  let mockSendMessage: jest.Mock;
  const testToken = 'test-token';
  const testChatId = 'test-chat-id';

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Setup mock sendMessage
    mockSendMessage = jest.fn().mockResolvedValue({});
    (TelegramBot as jest.MockedClass<typeof TelegramBot>).mockImplementation(() => ({
      sendMessage: mockSendMessage,
    } as any));

    notificationService = new NotificationService(testToken, testChatId);
  });

  describe('formatAlertMessage', () => {
    it('should format alert message with correct structure', async () => {
      const signal: ISignal = {
        asset: 'VTI',
        marketPrice: 102.50,
        fintualPrice: 100.00,
        diff: 2.50,
        createAt: new Date('2024-01-15T11:35:00-03:00'),
      } as ISignal;

      await notificationService.sendAlert(signal);

      expect(mockSendMessage).toHaveBeenCalledTimes(1);
      expect(mockSendMessage).toHaveBeenCalledWith(
        testChatId,
        expect.stringContaining('🚀 *Alerta de Trading - VTI*'),
        { parse_mode: 'Markdown' }
      );

      const message = mockSendMessage.mock.calls[0][1];
      expect(message).toContain('📊 *Precio Actual del Mercado:*');
      expect(message).toContain('102.50');
      expect(message).toContain('📈 *Cambio Porcentual:* 2.50%');
      expect(message).toContain('💰 *Precio Estimado Fintual:*');
      expect(message).toContain('100.00');
      expect(message).toContain('✅ *Recomendación:* Comprar en Fintual');
    });

    it('should format prices with 2 decimal places', async () => {
      const signal: ISignal = {
        asset: 'SPY',
        marketPrice: 450.123,
        fintualPrice: 445.678,
        diff: 1.00,
        createAt: new Date(),
      } as ISignal;

      await notificationService.sendAlert(signal);

      const message = mockSendMessage.mock.calls[0][1];
      expect(message).toContain('450.12');
      expect(message).toContain('445.68');
    });

    it('should include timestamp in Chilean timezone', async () => {
      const signal: ISignal = {
        asset: 'VTI',
        marketPrice: 100,
        fintualPrice: 98,
        diff: 2.04,
        createAt: new Date('2024-01-15T11:35:00-03:00'),
      } as ISignal;

      await notificationService.sendAlert(signal);

      const message = mockSendMessage.mock.calls[0][1];
      expect(message).toContain('⏰ *Hora:*');
      // Should contain time format (HH:MM:SS)
      expect(message).toMatch(/\d{2}:\d{2}:\d{2}/);
    });

    it('should include asset symbol in message', async () => {
      const signal: ISignal = {
        asset: 'QQQ',
        marketPrice: 380.50,
        fintualPrice: 375.00,
        diff: 1.47,
        createAt: new Date(),
      } as ISignal;

      await notificationService.sendAlert(signal);

      const message = mockSendMessage.mock.calls[0][1];
      expect(message).toContain('QQQ');
      expect(message).toContain('El activo QQQ ha subido');
    });

    it('should format negative percentage changes', async () => {
      const signal: ISignal = {
        asset: 'VTI',
        marketPrice: 98.00,
        fintualPrice: 100.00,
        diff: -2.00,
        createAt: new Date(),
      } as ISignal;

      await notificationService.sendAlert(signal);

      const message = mockSendMessage.mock.calls[0][1];
      expect(message).toContain('-2.00%');
    });
  });

  describe('sendAlert', () => {
    it('should send alert successfully', async () => {
      const signal: ISignal = {
        asset: 'VTI',
        marketPrice: 102,
        fintualPrice: 100,
        diff: 2.0,
        createAt: new Date(),
      } as ISignal;

      await notificationService.sendAlert(signal);

      expect(mockSendMessage).toHaveBeenCalledTimes(1);
      expect(mockSendMessage).toHaveBeenCalledWith(
        testChatId,
        expect.any(String),
        { parse_mode: 'Markdown' }
      );
    });

    it('should use Markdown parse mode', async () => {
      const signal: ISignal = {
        asset: 'VTI',
        marketPrice: 102,
        fintualPrice: 100,
        diff: 2.0,
        createAt: new Date(),
      } as ISignal;

      await notificationService.sendAlert(signal);

      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        { parse_mode: 'Markdown' }
      );
    });

    it('should handle Telegram API errors gracefully', async () => {
      const signal: ISignal = {
        asset: 'VTI',
        marketPrice: 102,
        fintualPrice: 100,
        diff: 2.0,
        createAt: new Date(),
      } as ISignal;

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockSendMessage.mockRejectedValueOnce(new Error('Telegram API error'));

      // Should not throw
      await expect(notificationService.sendAlert(signal)).resolves.not.toThrow();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error sending alert notification:',
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });

    it('should handle network errors', async () => {
      const signal: ISignal = {
        asset: 'VTI',
        marketPrice: 102,
        fintualPrice: 100,
        diff: 2.0,
        createAt: new Date(),
      } as ISignal;

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockSendMessage.mockRejectedValueOnce(new Error('Network timeout'));

      await notificationService.sendAlert(signal);

      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });

    it('should handle invalid chat ID errors', async () => {
      const signal: ISignal = {
        asset: 'VTI',
        marketPrice: 102,
        fintualPrice: 100,
        diff: 2.0,
        createAt: new Date(),
      } as ISignal;

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockSendMessage.mockRejectedValueOnce(new Error('Chat not found'));

      await notificationService.sendAlert(signal);

      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });

  describe('sendError', () => {
    it('should send error notification with Error object', async () => {
      const error = new Error('Database connection failed');

      await notificationService.sendError(error);

      expect(mockSendMessage).toHaveBeenCalledTimes(1);
      const message = mockSendMessage.mock.calls[0][1];
      expect(message).toContain('🚨 *Error Crítico*');
      expect(message).toContain('Database connection failed');
      expect(message).toContain('_Timestamp:');
    });

    it('should send error notification with string message', async () => {
      const errorMessage = 'API rate limit exceeded';

      await notificationService.sendError(errorMessage);

      expect(mockSendMessage).toHaveBeenCalledTimes(1);
      const message = mockSendMessage.mock.calls[0][1];
      expect(message).toContain('🚨 *Error Crítico*');
      expect(message).toContain('API rate limit exceeded');
    });

    it('should include timestamp in error message', async () => {
      await notificationService.sendError('Test error');

      const message = mockSendMessage.mock.calls[0][1];
      expect(message).toContain('_Timestamp:');
      // Date format varies by locale, just check it contains date-like pattern
      expect(message).toMatch(/\d{1,2}[-\/]\d{1,2}[-\/]\d{4}/); // Date format with - or /
    });

    it('should handle Telegram API errors when sending error notification', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockSendMessage.mockRejectedValueOnce(new Error('Telegram API error'));

      await notificationService.sendError('Test error');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error sending error notification:',
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('sendDailySummary', () => {
    it('should format and send daily summary', async () => {
      const summary: DailySummary = {
        date: new Date('2024-01-15'),
        assetsMonitored: 3,
        priceUpdates: 24,
        signalsGenerated: 2,
        signalsByAsset: new Map([
          ['VTI', 1],
          ['SPY', 1],
        ]),
      };

      await notificationService.sendDailySummary(summary);

      expect(mockSendMessage).toHaveBeenCalledTimes(1);
      const message = mockSendMessage.mock.calls[0][1];
      expect(message).toContain('📋 *Resumen Diario');
      expect(message).toContain('• Activos monitoreados: 3');
      expect(message).toContain('• Actualizaciones de precio: 24');
      expect(message).toContain('• Señales generadas: 2');
    });

    it('should include per-asset breakdown when signals exist', async () => {
      const summary: DailySummary = {
        date: new Date('2024-01-15'),
        assetsMonitored: 2,
        priceUpdates: 10,
        signalsGenerated: 2,
        signalsByAsset: new Map([
          ['VTI', 1],
          ['QQQ', 1],
        ]),
      };

      await notificationService.sendDailySummary(summary);

      const message = mockSendMessage.mock.calls[0][1];
      expect(message).toContain('*Señales por activo:*');
      expect(message).toContain('• VTI: 1');
      expect(message).toContain('• QQQ: 1');
    });

    it('should handle summary with no signals', async () => {
      const summary: DailySummary = {
        date: new Date('2024-01-15'),
        assetsMonitored: 3,
        priceUpdates: 24,
        signalsGenerated: 0,
        signalsByAsset: new Map(),
      };

      await notificationService.sendDailySummary(summary);

      const message = mockSendMessage.mock.calls[0][1];
      expect(message).toContain('• Señales generadas: 0');
      expect(message).not.toContain('*Señales por activo:*');
    });

    it('should format date in Chilean locale', async () => {
      const summary: DailySummary = {
        date: new Date('2024-01-15'),
        assetsMonitored: 1,
        priceUpdates: 5,
        signalsGenerated: 0,
        signalsByAsset: new Map(),
      };

      await notificationService.sendDailySummary(summary);

      const message = mockSendMessage.mock.calls[0][1];
      // Should contain a date in Spanish format
      expect(message).toMatch(/\d{1,2} de \w+ de \d{4}/);
    });

    it('should include session end message', async () => {
      const summary: DailySummary = {
        date: new Date('2024-01-15'),
        assetsMonitored: 1,
        priceUpdates: 5,
        signalsGenerated: 0,
        signalsByAsset: new Map(),
      };

      await notificationService.sendDailySummary(summary);

      const message = mockSendMessage.mock.calls[0][1];
      expect(message).toContain('_Sesión de trading finalizada._');
    });

    it('should handle multiple assets in breakdown', async () => {
      const summary: DailySummary = {
        date: new Date('2024-01-15'),
        assetsMonitored: 4,
        priceUpdates: 32,
        signalsGenerated: 4,
        signalsByAsset: new Map([
          ['VTI', 2],
          ['SPY', 1],
          ['QQQ', 1],
        ]),
      };

      await notificationService.sendDailySummary(summary);

      const message = mockSendMessage.mock.calls[0][1];
      expect(message).toContain('• VTI: 2');
      expect(message).toContain('• SPY: 1');
      expect(message).toContain('• QQQ: 1');
    });

    it('should handle Telegram API errors when sending summary', async () => {
      const summary: DailySummary = {
        date: new Date('2024-01-15'),
        assetsMonitored: 1,
        priceUpdates: 5,
        signalsGenerated: 0,
        signalsByAsset: new Map(),
      };

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockSendMessage.mockRejectedValueOnce(new Error('Telegram API error'));

      await notificationService.sendDailySummary(summary);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error sending daily summary:',
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Edge cases', () => {
    it('should handle very large price values', async () => {
      const signal: ISignal = {
        asset: 'BRK.A',
        marketPrice: 500000.50,
        fintualPrice: 490000.00,
        diff: 2.04,
        createAt: new Date(),
      } as ISignal;

      await notificationService.sendAlert(signal);

      const message = mockSendMessage.mock.calls[0][1];
      expect(message).toContain('500000.50');
      expect(message).toContain('490000.00');
    });

    it('should handle very small price values', async () => {
      const signal: ISignal = {
        asset: 'PENNY',
        marketPrice: 0.05,
        fintualPrice: 0.04,
        diff: 25.00,
        createAt: new Date(),
      } as ISignal;

      await notificationService.sendAlert(signal);

      const message = mockSendMessage.mock.calls[0][1];
      expect(message).toContain('0.05');
      expect(message).toContain('0.04');
    });

    it('should handle asset symbols with special characters', async () => {
      const signal: ISignal = {
        asset: 'BRK.B',
        marketPrice: 350.00,
        fintualPrice: 345.00,
        diff: 1.45,
        createAt: new Date(),
      } as ISignal;

      await notificationService.sendAlert(signal);

      const message = mockSendMessage.mock.calls[0][1];
      expect(message).toContain('BRK.B');
    });

    it('should handle zero percentage change', async () => {
      const signal: ISignal = {
        asset: 'VTI',
        marketPrice: 100.00,
        fintualPrice: 100.00,
        diff: 0.00,
        createAt: new Date(),
      } as ISignal;

      await notificationService.sendAlert(signal);

      const message = mockSendMessage.mock.calls[0][1];
      expect(message).toContain('0.00%');
    });
  });
});

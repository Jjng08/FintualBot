/**
 * Notification Service
 * Validates: Requirements 4.3, 5.1, 5.2, 5.3, 5.4, 5.5
 * 
 * Handles sending notifications to users via Telegram.
 * Formats and sends alerts, error notifications, and daily summaries.
 */

import TelegramBot from 'node-telegram-bot-api';
import { ISignal } from '../models/Signal';
import { DailySummary } from '../types';

/**
 * NotificationService class
 * Manages Telegram bot integration and message formatting
 */
export class NotificationService {
  private bot: TelegramBot;
  private chatId: string;

  /**
   * Creates a new NotificationService instance
   * 
   * @param token - Telegram bot token
   * @param chatId - Telegram chat ID to send messages to
   */
  constructor(token: string, chatId: string) {
    this.bot = new TelegramBot(token, { polling: false });
    this.chatId = chatId;
  }

  /**
   * Sends a trading alert notification
   * Validates: Requirements 4.3, 5.1, 5.2, 5.3, 5.4, 5.5
   * 
   * @param signal - The trading signal to notify about
   * @returns Promise that resolves when message is sent
   */
  async sendAlert(signal: ISignal): Promise<void> {
    try {
      const message = this.formatAlertMessage(signal);
      await this.bot.sendMessage(this.chatId, message, { parse_mode: 'Markdown' });
    } catch (error) {
      // Log error but don't throw - we don't want to stop the system
      console.error('Error sending alert notification:', error);
      // Optionally, could implement a fallback notification mechanism here
    }
  }

  /**
   * Sends an error notification for critical system errors
   * 
   * @param error - Error message or Error object
   * @returns Promise that resolves when message is sent
   */
  async sendError(error: string | Error): Promise<void> {
    try {
      const errorMessage = error instanceof Error ? error.message : error;
      const message = `🚨 *Error Crítico*\n\n${errorMessage}\n\n_Timestamp: ${new Date().toLocaleString('es-CL', { timeZone: 'America/Santiago' })}_`;
      await this.bot.sendMessage(this.chatId, message, { parse_mode: 'Markdown' });
    } catch (err) {
      // Log error but don't throw
      console.error('Error sending error notification:', err);
    }
  }

  /**
   * Sends a daily summary at the end of the trading session
   * 
   * @param summary - Daily summary statistics
   * @returns Promise that resolves when message is sent
   */
  async sendDailySummary(summary: DailySummary): Promise<void> {
    try {
      const message = this.formatDailySummary(summary);
      await this.bot.sendMessage(this.chatId, message, { parse_mode: 'Markdown' });
    } catch (error) {
      // Log error but don't throw
      console.error('Error sending daily summary:', error);
    }
  }

  /**
   * Formats a trading signal into a user-friendly message
   * Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5
   * 
   * @param signal - The signal to format
   * @returns Formatted message string
   */
  private formatAlertMessage(signal: ISignal): string {
    // Format timestamp in Chilean timezone
    const timestamp = signal.createAt.toLocaleString('es-CL', {
      timeZone: 'America/Santiago',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    // Format prices with 2 decimal places
    const marketPrice = signal.marketPrice.toFixed(2);
    const fintualPrice = signal.fintualPrice.toFixed(2);
    const diffFormatted = signal.diff.toFixed(2);

    // Build the message with all required information
    const message = `
🚀 *Alerta de Trading - ${signal.asset}*

📊 *Precio Actual del Mercado:* $${marketPrice}
📈 *Cambio Porcentual:* ${diffFormatted}%
💰 *Precio Estimado Fintual:* $${fintualPrice}
⏰ *Hora:* ${timestamp}

✅ *Recomendación:* Comprar en Fintual antes de que actualicen sus precios (después de las 13:00)

_El activo ${signal.asset} ha subido ${diffFormatted}% desde las 11:30. Esta es una oportunidad de arbitraje._
`.trim();

    return message;
  }

  /**
   * Formats a daily summary into a user-friendly message
   * 
   * @param summary - The summary to format
   * @returns Formatted message string
   */
  private formatDailySummary(summary: DailySummary): string {
    const date = summary.date.toLocaleDateString('es-CL', {
      timeZone: 'America/Santiago',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    let message = `
📋 *Resumen Diario - ${date}*

📊 *Estadísticas:*
• Activos monitoreados: ${summary.assetsMonitored}
• Actualizaciones de precio: ${summary.priceUpdates}
• Señales generadas: ${summary.signalsGenerated}
`.trim();

    // Add per-asset breakdown if there are signals
    if (summary.signalsByAsset.size > 0) {
      message += '\n\n*Señales por activo:*\n';
      summary.signalsByAsset.forEach((count, asset) => {
        message += `• ${asset}: ${count}\n`;
      });
    }

    message += '\n\n_Sesión de trading finalizada._';

    return message;
  }
}

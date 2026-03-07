import { Schema, model, Document } from 'mongoose';

/**
 * Interface for Signal document
 * Represents a trading signal generated when an asset exceeds the price change threshold
 */
export interface ISignal extends Document {
  asset: string;           // Asset symbol (e.g., "VTI", "SPY")
  marketPrice: number;     // Current market price
  fintualPrice: number;    // Estimated Fintual price
  diff: number;            // Percentage change
  createAt: Date;          // Timestamp of signal creation
}

/**
 * Mongoose schema for Signal model
 * Validates: Requirements 4.1, 9.2
 */
const signalSchema = new Schema<ISignal>({
  asset: { 
    type: String, 
    required: true, 
    index: true 
  },
  marketPrice: { 
    type: Number, 
    required: true,
    min: [0, 'Market price must be greater than 0']
  },
  fintualPrice: { 
    type: Number, 
    required: true,
    min: [0, 'Fintual price must be greater than 0']
  },
  diff: { 
    type: Number, 
    required: true 
  },
  createAt: { 
    type: Date, 
    default: Date.now,
    index: true
  }
});

// Compound index for efficient queries by asset and date
signalSchema.index({ asset: 1, createAt: -1 });

export const Signal = model<ISignal>('Signal', signalSchema);

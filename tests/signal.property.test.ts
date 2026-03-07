import fc from 'fast-check';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { Signal } from '../src/models/Signal';

/**
 * Property-Based Tests for Signal Model
 * Feature: vti-gap-trading-alert
 * 
 * These tests validate universal properties that should hold true
 * for all valid Signal instances across all possible inputs.
 */

describe('Property 10: Signal Persistence', () => {
  let mongoServer: MongoMemoryServer;

  beforeAll(async () => {
    // Create in-memory MongoDB instance for testing
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);
  });

  afterAll(async () => {
    // Clean up database connections
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  afterEach(async () => {
    // Clear all signals after each test
    await Signal.deleteMany({});
  });

  /**
   * **Validates: Requirements 4.2, 9.2**
   * 
   * Property: For any Signal created, the system should persist it to the database
   * and the persisted record should contain all the same field values as the created Signal.
   * 
   * This property ensures data integrity during persistence operations.
   */
  it('should persist Signal with all field values intact', async () => {
    // Generator for valid asset symbols (1-5 uppercase letters)
    const assetSymbolArb = fc.string({ 
      minLength: 1, 
      maxLength: 5,
      unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ')
    });

    // Generator for valid prices (positive numbers)
    const priceArb = fc.double({ 
      min: 0.01, 
      max: 10000, 
      noNaN: true,
      noDefaultInfinity: true
    });

    // Generator for percentage changes
    const percentageChangeArb = fc.double({ 
      min: -50, 
      max: 50, 
      noNaN: true,
      noDefaultInfinity: true
    });

    // Generator for timestamps (dates within reasonable range)
    const timestampArb = fc.date({
      min: new Date('2020-01-01'),
      max: new Date('2030-12-31')
    });

    // Generator for complete Signal objects
    const signalArb = fc.record({
      asset: assetSymbolArb,
      marketPrice: priceArb,
      fintualPrice: priceArb,
      diff: percentageChangeArb,
      createAt: timestampArb
    });

    await fc.assert(
      fc.asyncProperty(signalArb, async (signalData) => {
        // Create and save the signal
        const signal = new Signal(signalData);
        const savedSignal = await signal.save();

        // Retrieve the persisted signal from database
        const retrievedSignal = await Signal.findById(savedSignal._id);

        // Verify the signal was persisted
        expect(retrievedSignal).not.toBeNull();

        // Verify all field values match exactly
        expect(retrievedSignal!.asset).toBe(signalData.asset);
        expect(retrievedSignal!.marketPrice).toBe(signalData.marketPrice);
        expect(retrievedSignal!.fintualPrice).toBe(signalData.fintualPrice);
        expect(retrievedSignal!.diff).toBe(signalData.diff);
        
        // For dates, compare timestamps (milliseconds since epoch)
        expect(retrievedSignal!.createAt.getTime()).toBe(signalData.createAt.getTime());
      }),
      { numRuns: 20 }
    );
  });

  /**
   * Additional property test: Verify that persisted signals maintain
   * data integrity for edge case values
   */
  it('should persist Signal with edge case values correctly', async () => {
    const edgeCaseSignalArb = fc.record({
      asset: fc.constantFrom('A', 'ZZZZZ', 'VTI', 'SPY'),
      marketPrice: fc.constantFrom(0.01, 0.99, 1.00, 9999.99, 10000),
      fintualPrice: fc.constantFrom(0.01, 0.99, 1.00, 9999.99, 10000),
      diff: fc.constantFrom(-50, -1.5, 0, 1.5, 50),
      createAt: fc.date()
    });

    await fc.assert(
      fc.asyncProperty(edgeCaseSignalArb, async (signalData) => {
        const signal = new Signal(signalData);
        const savedSignal = await signal.save();

        const retrievedSignal = await Signal.findById(savedSignal._id);

        expect(retrievedSignal).not.toBeNull();
        expect(retrievedSignal!.asset).toBe(signalData.asset);
        expect(retrievedSignal!.marketPrice).toBe(signalData.marketPrice);
        expect(retrievedSignal!.fintualPrice).toBe(signalData.fintualPrice);
        expect(retrievedSignal!.diff).toBe(signalData.diff);
        expect(retrievedSignal!.createAt.getTime()).toBe(signalData.createAt.getTime());
      }),
      { numRuns: 10 }
    );
  });

  /**
   * Property test: Verify that multiple signals can be persisted
   * independently without interference
   */
  it('should persist multiple Signals independently', async () => {
    const assetSymbolArb = fc.string({ 
      minLength: 1, 
      maxLength: 5,
      unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ')
    });

    const priceArb = fc.double({ 
      min: 0.01, 
      max: 10000, 
      noNaN: true,
      noDefaultInfinity: true
    });

    const percentageChangeArb = fc.double({ 
      min: -50, 
      max: 50, 
      noNaN: true,
      noDefaultInfinity: true
    });

    const signalArb = fc.record({
      asset: assetSymbolArb,
      marketPrice: priceArb,
      fintualPrice: priceArb,
      diff: percentageChangeArb,
      createAt: fc.date()
    });

    // Generate array of 2-5 signals
    const signalArrayArb = fc.array(signalArb, { minLength: 2, maxLength: 5 });

    await fc.assert(
      fc.asyncProperty(signalArrayArb, async (signalsData) => {
        // Clean up before this iteration - wait for completion
        await Signal.deleteMany({});
        
        // Verify database is empty before starting
        const countBefore = await Signal.countDocuments();
        expect(countBefore).toBe(0);

        // Persist all signals
        const savedSignals = await Promise.all(
          signalsData.map(data => new Signal(data).save())
        );

        // Verify all signals were persisted
        expect(savedSignals).toHaveLength(signalsData.length);

        // Retrieve and verify each signal independently
        for (let i = 0; i < signalsData.length; i++) {
          const retrievedSignal = await Signal.findById(savedSignals[i]._id);
          
          expect(retrievedSignal).not.toBeNull();
          expect(retrievedSignal!.asset).toBe(signalsData[i].asset);
          expect(retrievedSignal!.marketPrice).toBe(signalsData[i].marketPrice);
          expect(retrievedSignal!.fintualPrice).toBe(signalsData[i].fintualPrice);
          expect(retrievedSignal!.diff).toBe(signalsData[i].diff);
          expect(retrievedSignal!.createAt.getTime()).toBe(signalsData[i].createAt.getTime());
        }

        // Verify total count in database
        const totalCount = await Signal.countDocuments();
        expect(totalCount).toBe(signalsData.length);
        
        // Clean up after this iteration
        await Signal.deleteMany({});
      }),
      { numRuns: 10 }
    );
  });
});

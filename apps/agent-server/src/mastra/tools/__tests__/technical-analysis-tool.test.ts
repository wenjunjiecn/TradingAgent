import { describe, it, expect } from 'vitest';
import { calculateIndicators } from '../technical-analysis-tool';
import type { KLineData } from '@trading-agent/shared';

/** 生成模拟 K 线数据（收盘价递增） */
function generateKLines(count: number): KLineData[] {
  const klines: KLineData[] = [];
  for (let i = 0; i < count; i++) {
    const close = 100 + i * 0.5;
    klines.push({
      time: 1700000000 + i * 86400,
      open: close - 0.3,
      high: close + 0.5,
      low: close - 0.5,
      close,
      volume: 1000000 + i * 1000,
    });
  }
  return klines;
}

describe('Technical Analysis Tool', () => {
  describe('calculateIndicators', () => {
    it('should calculate indicators correctly with sufficient data', () => {
      const klines = generateKLines(100);
      const result = calculateIndicators(klines);

      expect(result).toBeDefined();
      expect(result.ma20).toBeTypeOf('number');
      expect(result.ma60).toBeTypeOf('number');
      expect(result.rsi).toBeGreaterThanOrEqual(0);
      expect(result.rsi).toBeLessThanOrEqual(100);
      expect(result.macd).toBeTypeOf('number');
      expect(result.macdSignal).toBeTypeOf('number');
      expect(result.macdHistogram).toBeTypeOf('number');
    });

    it('should throw when insufficient data', () => {
      const klines = generateKLines(30);
      expect(() => calculateIndicators(klines)).toThrow(/Insufficient data/);
    });

    it('should produce RSI > 50 for an uptrend', () => {
      const klines = generateKLines(100);
      const result = calculateIndicators(klines);
      // In a consistent uptrend, RSI should be above 50
      expect(result.rsi).toBeGreaterThan(50);
    });

    it('should handle edge case of exactly 60 bars', () => {
      const klines = generateKLines(60);
      expect(() => calculateIndicators(klines)).not.toThrow();
    });
  });
});

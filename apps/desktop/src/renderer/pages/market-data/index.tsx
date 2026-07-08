import { Button } from '@mastra/playground-ui/components/Button';
import { ErrorState } from '@mastra/playground-ui/components/ErrorState';
import { PageLayout } from '@mastra/playground-ui/components/PageLayout';
import { Search, TrendingUp, TrendingDown, Loader2 } from 'lucide-react';
import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { useMarketData, useIndicators } from '@/lib/research-api';
import type { KLineData, Indicators } from '@trading-agent/shared';

// ── 简易 K 线图（Canvas 实现，无外部依赖） ────────────────────────────

function KLineChart({ klines }: { klines: KLineData[] }) {
  const canvasRef = useState<HTMLCanvasElement | null>(null);
  const [ref, setRef] = canvasRef;

  useMemo(() => {
    if (!ref || klines.length === 0) return;
    const canvas = ref;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.offsetWidth;
    const height = canvas.offsetHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // 清空
    ctx.clearRect(0, 0, width, height);

    // 计算价格范围
    const prices = klines.flatMap(k => [k.high, k.low]);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const range = maxPrice - minPrice || 1;
    const padding = range * 0.05;
    const pMin = minPrice - padding;
    const pMax = maxPrice + padding;

    // 图表区域
    const chartLeft = 50;
    const chartRight = width - 10;
    const chartTop = 10;
    const chartBottom = height - 30;
    const chartWidth = chartRight - chartLeft;
    const chartHeight = chartBottom - chartTop;

    const barWidth = chartWidth / klines.length;
    const candleWidth = Math.max(2, barWidth * 0.7);

    // 绘制网格
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = chartTop + (chartHeight / 4) * i;
      ctx.beginPath();
      ctx.moveTo(chartLeft, y);
      ctx.lineTo(chartRight, y);
      ctx.stroke();

      // 价格标签
      const price = pMax - ((pMax - pMin) / 4) * i;
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.font = '10px monospace';
      ctx.fillText(price.toFixed(2), 5, y + 3);
    }

    // 绘制 K 线
    klines.forEach((k, i) => {
      const x = chartLeft + barWidth * i + barWidth / 2;
      const isUp = k.close >= k.open;
      const color = isUp ? '#22c55e' : '#ef4444';

      // 影线
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, chartTop + ((pMax - k.high) / (pMax - pMin)) * chartHeight);
      ctx.lineTo(x, chartTop + ((pMax - k.low) / (pMax - pMin)) * chartHeight);
      ctx.stroke();

      // 实体
      const openY = chartTop + ((pMax - k.open) / (pMax - pMin)) * chartHeight;
      const closeY = chartTop + ((pMax - k.close) / (pMax - pMin)) * chartHeight;
      const bodyTop = Math.min(openY, closeY);
      const bodyHeight = Math.max(1, Math.abs(closeY - openY));

      ctx.fillStyle = color;
      ctx.fillRect(x - candleWidth / 2, bodyTop, candleWidth, bodyHeight);
    });

    // X 轴日期标签
    const labelCount = Math.min(6, klines.length);
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    for (let i = 0; i < labelCount; i++) {
      const idx = Math.floor((klines.length / labelCount) * i);
      const k = klines[idx];
      const x = chartLeft + barWidth * idx + barWidth / 2;
      const date = new Date(k.time * 1000);
      ctx.fillText(
        `${date.getMonth() + 1}/${date.getDate()}`,
        x,
        height - 10,
      );
    }
    ctx.textAlign = 'left';
  }, [ref, klines]);

  return (
    <div className="relative w-full" style={{ height: '320px' }}>
      <canvas
        ref={setRef}
        className="w-full h-full"
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
}

// ── 技术指标面板 ──────────────────────────────────────────────────────

function IndicatorPanel({
  indicators,
  latestPrice,
}: {
  indicators: Indicators;
  latestPrice: number;
}) {
  const { t } = useTranslation('market');
  const ma20Above = indicators.ma20 > indicators.ma60;
  const rsiOverbought = indicators.rsi > 70;
  const rsiOversold = indicators.rsi < 30;
  const macdBullish = indicators.macdHistogram > 0;

  const items = [
    {
      label: t('indicators.ma20'),
      value: indicators.ma20.toFixed(2),
      signal: ma20Above ? 'bullish' : 'bearish',
      note: ma20Above ? t('indicators.ma20AboveNote') : t('indicators.ma20BelowNote'),
    },
    {
      label: t('indicators.ma60'),
      value: indicators.ma60.toFixed(2),
      signal: 'neutral',
      note: t('indicators.ma60Note'),
    },
    {
      label: t('indicators.rsi'),
      value: indicators.rsi.toFixed(2),
      signal: rsiOverbought ? 'bearish' : rsiOversold ? 'bullish' : 'neutral',
      note: rsiOverbought ? t('indicators.rsiOverbought') : rsiOversold ? t('indicators.rsiOversold') : t('indicators.rsiNeutral'),
    },
    {
      label: t('indicators.macd'),
      value: indicators.macd.toFixed(4),
      signal: macdBullish ? 'bullish' : 'bearish',
      note: t('indicators.macdHistogramNote', { value: indicators.macdHistogram.toFixed(4) }),
    },
    {
      label: t('indicators.macdSignal'),
      value: indicators.macdSignal.toFixed(4),
      signal: 'neutral',
      note: t('indicators.macdSignalNote'),
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
      {items.map(item => (
        <div
          key={item.label}
          className={`rounded-lg border p-3 ${
            item.signal === 'bullish'
              ? 'border-green-500/30 bg-green-500/5'
              : item.signal === 'bearish'
                ? 'border-red-500/30 bg-red-500/5'
                : 'border-border1 bg-surface4'
          }`}
        >
          <span className="text-xs text-neutral3">{item.label}</span>
          <p
            className={`font-display text-lg font-semibold ${
              item.signal === 'bullish'
                ? 'text-green-500'
                : item.signal === 'bearish'
                  ? 'text-red-500'
                  : 'text-neutral6'
            }`}
          >
            {item.value}
          </p>
          <span className="text-xs text-neutral3">{item.note}</span>
        </div>
      ))}
    </div>
  );
}

// ── 综合信号判断 ──────────────────────────────────────────────────────

function SignalSummary({
  indicators,
  latestPrice,
  symbol,
}: {
  indicators: Indicators;
  latestPrice: number;
  symbol: string;
}) {
  const { t } = useTranslation('market');
  const ma20Above = indicators.ma20 > indicators.ma60;
  const rsiOversold = indicators.rsi < 30;
  const rsiOverbought = indicators.rsi > 70;
  const macdBullish = indicators.macdHistogram > 0;

  let action = t('signal.hold');
  let reason = t('signal.holdReason');
  let color = 'text-yellow-500';

  if (rsiOversold && macdBullish) {
    action = t('signal.buy');
    reason = t('signal.buyReasonOversoldMacd', { rsi: indicators.rsi.toFixed(1) });
    color = 'text-green-500';
  } else if (rsiOverbought && !macdBullish) {
    action = t('signal.sell');
    reason = t('signal.sellReasonOverboughtMacd', { rsi: indicators.rsi.toFixed(1) });
    color = 'text-red-500';
  } else if (ma20Above && indicators.rsi >= 40 && indicators.rsi <= 60) {
    action = t('signal.buy');
    reason = t('signal.buyReasonMa');
    color = 'text-green-500';
  } else if (!ma20Above && indicators.rsi >= 40 && indicators.rsi <= 60) {
    action = t('signal.sell');
    reason = t('signal.sellReasonMa');
    color = 'text-red-500';
  }

  return (
    <div className="flex items-center gap-4 rounded-xl border border-border1 bg-surface3 p-4">
      <div className="flex flex-col">
        <span className="text-xs text-neutral3">{t('signal.title')}</span>
        <span className={`font-display text-3xl font-bold ${color}`}>{action}</span>
      </div>
      <div className="flex-1 border-l border-border1 pl-4">
        <span className="text-xs text-neutral3">{symbol} @ ${latestPrice.toFixed(2)}</span>
        <p className="text-sm text-neutral4">{reason}</p>
      </div>
    </div>
  );
}

// ── 主页面 ────────────────────────────────────────────────────────────

export default function MarketDataPage() {
  const { t } = useTranslation('market');
  const [searchParams, setSearchParams] = useSearchParams();
  const urlSymbol = searchParams.get('symbol');
  const [input, setInput] = useState(urlSymbol ?? '');
  const [activeSymbol, setActiveSymbol] = useState<string | null>(urlSymbol ?? null);
  const [period, setPeriod] = useState('3mo');

  const { data: marketData, isLoading: mdLoading, error: mdError } = useMarketData(activeSymbol, period);
  const { data: indData, isLoading: indLoading, error: indError } = useIndicators(activeSymbol, period);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      const sym = input.trim().toUpperCase();
      setActiveSymbol(sym);
      setSearchParams({ symbol: sym });
    }
  };

  const periods = ['1mo', '3mo', '6mo', '1y'];

  return (
    <PageLayout className="gap-4 p-4">
      <div>
        <h1 className="font-display text-xl font-bold text-neutral6">{t('title')}</h1>
        <p className="text-sm text-neutral3">{t('subtitle')}</p>
      </div>

      {/* 搜索栏 */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral3" />
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value.toUpperCase())}
            placeholder={t('searchPlaceholder')}
            className="w-full rounded-lg border border-border1 bg-surface3 py-2.5 pl-10 pr-3 text-sm font-medium text-neutral6 outline-none placeholder:text-neutral3 focus:border-accent1"
          />
        </div>
        <Button type="submit" variant="default">
          {t('searchButton')}
        </Button>
      </form>

      {/* 周期选择 */}
      {activeSymbol && (
        <div className="flex gap-2">
          {periods.map(p => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`rounded-lg px-3 py-1 text-sm font-medium transition-colors ${
                period === p
                  ? 'bg-accent1 text-white'
                  : 'border border-border1 bg-surface3 text-neutral4 hover:bg-surface4'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      )}

      {/* 错误提示 */}
      {(mdError || indError) && (
        <ErrorState
          title={t('errorTitle')}
          message={(mdError || indError)?.message ?? 'Unknown error'}
        />
      )}

      {/* 内容区 */}
      {!activeSymbol ? (
        <div className="flex h-64 flex-col items-center justify-center gap-3 text-neutral3">
          <Search className="size-12 opacity-30" />
          <span className="text-sm">{t('emptyHint')}</span>
        </div>
      ) : mdLoading || indLoading ? (
        <div className="flex h-64 items-center justify-center gap-2 text-sm text-neutral3">
          <Loader2 className="size-5 animate-spin" />
          {t('loadingSymbol', { symbol: activeSymbol })}
        </div>
      ) : marketData?.data && indData ? (
        <div className="flex flex-col gap-4">
          {/* 价格头部 */}
          <div className="flex items-center gap-4">
            <h2 className="font-display text-2xl font-bold text-neutral6">
              {marketData.data.symbol}
            </h2>
            <span className="font-display text-xl text-neutral5">
              ${marketData.data.latestPrice.toFixed(2)}
            </span>
            <span className="text-sm text-neutral3">
              {t('dataPoints', { count: marketData.data.dataPoints })}
            </span>
          </div>

          {/* K 线图 */}
          <div className="rounded-xl border border-border1 bg-surface3 p-4">
            <KLineChart klines={marketData.data.klines} />
          </div>

          {/* 技术指标 */}
          <IndicatorPanel
            indicators={indData.indicators}
            latestPrice={indData.latestPrice}
          />

          {/* 综合信号 */}
          <SignalSummary
            indicators={indData.indicators}
            latestPrice={indData.latestPrice}
            symbol={indData.symbol}
          />
        </div>
      ) : null}
    </PageLayout>
  );
}

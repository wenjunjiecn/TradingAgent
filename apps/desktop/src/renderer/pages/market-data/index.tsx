import { Button } from '@mastra/playground-ui/components/Button';
import { ErrorState } from '@mastra/playground-ui/components/ErrorState';
import { PageLayout } from '@mastra/playground-ui/components/PageLayout';
import { Search, TrendingUp, TrendingDown, Loader2 } from 'lucide-react';
import { useState, useMemo } from 'react';
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
  const ma20Above = indicators.ma20 > indicators.ma60;
  const rsiOverbought = indicators.rsi > 70;
  const rsiOversold = indicators.rsi < 30;
  const macdBullish = indicators.macdHistogram > 0;

  const items = [
    {
      label: 'MA20',
      value: indicators.ma20.toFixed(2),
      signal: ma20Above ? 'bullish' : 'bearish',
      note: ma20Above ? '高于 MA60（金叉）' : '低于 MA60（死叉）',
    },
    {
      label: 'MA60',
      value: indicators.ma60.toFixed(2),
      signal: 'neutral',
      note: '中期均线',
    },
    {
      label: 'RSI(14)',
      value: indicators.rsi.toFixed(2),
      signal: rsiOverbought ? 'bearish' : rsiOversold ? 'bullish' : 'neutral',
      note: rsiOverbought ? '超买区域' : rsiOversold ? '超卖区域' : '正常区间',
    },
    {
      label: 'MACD',
      value: indicators.macd.toFixed(4),
      signal: macdBullish ? 'bullish' : 'bearish',
      note: `柱状图 ${indicators.macdHistogram.toFixed(4)}`,
    },
    {
      label: 'Signal',
      value: indicators.macdSignal.toFixed(4),
      signal: 'neutral',
      note: 'MACD 信号线',
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
  const ma20Above = indicators.ma20 > indicators.ma60;
  const rsiOversold = indicators.rsi < 30;
  const rsiOverbought = indicators.rsi > 70;
  const macdBullish = indicators.macdHistogram > 0;

  let action = 'HOLD';
  let reason = '趋势信号不够一致，暂时维持观望。';
  let color = 'text-yellow-500';

  if (rsiOversold && macdBullish) {
    action = 'BUY';
    reason = `RSI=${indicators.rsi.toFixed(1)} 超卖 + MACD 柱转正，多头动能改善`;
    color = 'text-green-500';
  } else if (rsiOverbought && !macdBullish) {
    action = 'SELL';
    reason = `RSI=${indicators.rsi.toFixed(1)} 超买 + MACD 柱为负，动能走弱`;
    color = 'text-red-500';
  } else if (ma20Above && indicators.rsi >= 40 && indicators.rsi <= 60) {
    action = 'BUY';
    reason = `MA20 高于 MA60，中期趋势偏多，RSI 未过热`;
    color = 'text-green-500';
  } else if (!ma20Above && indicators.rsi >= 40 && indicators.rsi <= 60) {
    action = 'SELL';
    reason = `MA20 低于 MA60，中期趋势偏弱`;
    color = 'text-red-500';
  }

  return (
    <div className="flex items-center gap-4 rounded-xl border border-border1 bg-surface3 p-4">
      <div className="flex flex-col">
        <span className="text-xs text-neutral3">技术信号</span>
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
        <h1 className="font-display text-xl font-bold text-neutral6">行情数据</h1>
        <p className="text-sm text-neutral3">查看美股 K 线图表、技术指标和综合信号判断</p>
      </div>

      {/* 搜索栏 */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral3" />
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value.toUpperCase())}
            placeholder="输入股票代码，如 AAPL"
            className="w-full rounded-lg border border-border1 bg-surface3 py-2.5 pl-10 pr-3 text-sm font-medium text-neutral6 outline-none placeholder:text-neutral3 focus:border-accent1"
          />
        </div>
        <Button type="submit" variant="default">
          查询
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
          title="获取数据失败"
          message={(mdError || indError)?.message ?? 'Unknown error'}
        />
      )}

      {/* 内容区 */}
      {!activeSymbol ? (
        <div className="flex h-64 flex-col items-center justify-center gap-3 text-neutral3">
          <Search className="size-12 opacity-30" />
          <span className="text-sm">输入股票代码开始查看行情数据</span>
        </div>
      ) : mdLoading || indLoading ? (
        <div className="flex h-64 items-center justify-center gap-2 text-sm text-neutral3">
          <Loader2 className="size-5 animate-spin" />
          加载 {activeSymbol} 数据中...
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
              {marketData.data.dataPoints} 个数据点
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

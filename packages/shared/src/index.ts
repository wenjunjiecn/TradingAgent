export interface KLineData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TradeSignal {
  agentId: string;
  pair: string;
  action: 'BUY' | 'SELL' | 'HOLD';
  price: number;
  timestamp: number;
  reason?: string;
}

export interface Position {
  pair: string;
  amount: number;
  entryPrice: number;
  unrealizedPnl: number;
}

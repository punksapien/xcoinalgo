/**
 * CoinDCX API Client - Handles all interactions with CoinDCX exchange
 *
 * Provides methods for:
 * - Account management (balances, positions)
 * - Order management (place, cancel, status)
 * - Market data (tickers, orderbook, historical)
 */

import crypto from 'crypto';
import { decrypt } from '../utils/simple-crypto';
import { Logger } from '../utils/logger';

const logger = new Logger('CoinDCX-Client');

const COINDCX_BASE_URL = 'https://api.coindcx.com';
const COINDCX_PUBLIC_BASE_URL = 'https://public.coindcx.com';

// Rate limiting
const RATE_LIMIT_DELAY = 100; // ms between requests
let lastRequestTime = 0;

interface CoinDCXCredentials {
  apiKey: string;
  apiSecret: string;
}

interface Balance {
  currency: string;
  balance: number;
  locked_balance: number;
}

interface Order {
  id: string;
  market: string;
  order_type: 'market_order' | 'limit_order' | 'stop_limit';
  side: 'buy' | 'sell';
  status: 'init' | 'open' | 'partially_filled' | 'filled' | 'cancelled' | 'rejected';
  fee_amount: number;
  fee: number;
  total_quantity: number;
  remaining_quantity: number;
  avg_price: number;
  price_per_unit: number;
  created_at: string;
  updated_at: string;
}

interface Trade {
  id: string;
  order_id: string;
  market: string;
  side: 'buy' | 'sell';
  fee_amount: number;
  ecode: string;
  quantity: number;
  price: number;
  symbol: string;
  timestamp: number;
}

interface Ticker {
  market: string;
  change_24_hour: number;
  high: number;
  low: number;
  volume: number;
  last_price: number;
  bid: number;
  ask: number;
  timestamp: number;
}

interface OHLCVCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Wait for rate limit compliance
 */
async function rateLimit(): Promise<void> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;

  if (timeSinceLastRequest < RATE_LIMIT_DELAY) {
    await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY - timeSinceLastRequest));
  }

  lastRequestTime = Date.now();
}

/**
 * Create HMAC-SHA256 signature for authenticated requests
 */
function createSignature(payload: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
}

/**
 * Make authenticated API request to CoinDCX
 */
async function makeAuthenticatedRequest<T>(
  endpoint: string,
  credentials: CoinDCXCredentials,
  payload: Record<string, any> = {}
): Promise<T> {
  await rateLimit();

  const timestamp = Date.now();
  const bodyWithTimestamp = { ...payload, timestamp };

  // Compact JSON serialization (no spaces)
  const body = JSON.stringify(bodyWithTimestamp).replace(/\s/g, '');

  const signature = createSignature(body, credentials.apiSecret);

  logger.debug(`Making authenticated request to ${endpoint}`);

  const response = await fetch(`${COINDCX_BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-AUTH-APIKEY': credentials.apiKey,
      'X-AUTH-SIGNATURE': signature,
    },
    body,
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error(`CoinDCX API error (${response.status}): ${errorText}`);
    throw new Error(`CoinDCX API error: ${errorText || response.statusText}`);
  }

  const data = await response.json();
  return data as T;
}

/**
 * Make public (unauthenticated) API request
 */
async function makePublicRequest<T>(endpoint: string): Promise<T> {
  await rateLimit();

  logger.debug(`Making public request to ${endpoint}`);

  const response = await fetch(`${COINDCX_PUBLIC_BASE_URL}${endpoint}`);

  if (!response.ok) {
    const errorText = await response.text();
    logger.error(`CoinDCX public API error (${response.status}): ${errorText}`);
    throw new Error(`CoinDCX public API error: ${errorText || response.statusText}`);
  }

  const data = await response.json();
  return data as T;
}

/**
 * Decrypt and prepare credentials from database
 */
function prepareCredentials(encryptedApiKey: string, encryptedApiSecret: string): CoinDCXCredentials {
  return {
    apiKey: decrypt(encryptedApiKey),
    apiSecret: decrypt(encryptedApiSecret),
  };
}

// =============================================================================
// ACCOUNT MANAGEMENT
// =============================================================================

/**
 * Get account balances for all currencies
 */
export async function getBalances(
  encryptedApiKey: string,
  encryptedApiSecret: string
): Promise<Balance[]> {
  const credentials = prepareCredentials(encryptedApiKey, encryptedApiSecret);

  const balances = await makeAuthenticatedRequest<Balance[]>(
    '/exchange/v1/users/balances',
    credentials
  );

  logger.info(`Fetched ${balances.length} balances`);
  return balances;
}

/**
 * Get balance for a specific currency
 */
export async function getBalance(
  encryptedApiKey: string,
  encryptedApiSecret: string,
  currency: string
): Promise<Balance | null> {
  const balances = await getBalances(encryptedApiKey, encryptedApiSecret);
  return balances.find(b => b.currency.toUpperCase() === currency.toUpperCase()) || null;
}

// =============================================================================
// ORDER MANAGEMENT
// =============================================================================

/**
 * Place a market order
 */
export async function placeMarketOrder(
  encryptedApiKey: string,
  encryptedApiSecret: string,
  params: {
    market: string; // e.g., "BTCINR", "ETHINR"
    side: 'buy' | 'sell';
    total_quantity: number; // quantity in base currency
    client_order_id?: string; // optional custom order ID
  }
): Promise<Order> {
  const credentials = prepareCredentials(encryptedApiKey, encryptedApiSecret);

  logger.info(`Placing market ${params.side} order: ${params.total_quantity} ${params.market}`);

  const order = await makeAuthenticatedRequest<Order>(
    '/exchange/v1/orders/create',
    credentials,
    {
      side: params.side,
      order_type: 'market_order',
      market: params.market,
      total_quantity: params.total_quantity,
      client_order_id: params.client_order_id,
    }
  );

  logger.info(`Market order placed successfully: ${order.id}`);
  return order;
}

/**
 * Place a limit order
 */
export async function placeLimitOrder(
  encryptedApiKey: string,
  encryptedApiSecret: string,
  params: {
    market: string;
    side: 'buy' | 'sell';
    price_per_unit: number;
    total_quantity: number;
    client_order_id?: string;
  }
): Promise<Order> {
  const credentials = prepareCredentials(encryptedApiKey, encryptedApiSecret);

  logger.info(`Placing limit ${params.side} order: ${params.total_quantity} @ ${params.price_per_unit} ${params.market}`);

  const order = await makeAuthenticatedRequest<Order>(
    '/exchange/v1/orders/create',
    credentials,
    {
      side: params.side,
      order_type: 'limit_order',
      market: params.market,
      price_per_unit: params.price_per_unit,
      total_quantity: params.total_quantity,
      client_order_id: params.client_order_id,
    }
  );

  logger.info(`Limit order placed successfully: ${order.id}`);
  return order;
}

/**
 * Cancel an order
 */
export async function cancelOrder(
  encryptedApiKey: string,
  encryptedApiSecret: string,
  orderId: string
): Promise<{ message: string }> {
  const credentials = prepareCredentials(encryptedApiKey, encryptedApiSecret);

  logger.info(`Cancelling order: ${orderId}`);

  const result = await makeAuthenticatedRequest<{ message: string }>(
    '/exchange/v1/orders/cancel',
    credentials,
    { id: orderId }
  );

  logger.info(`Order cancelled: ${orderId}`);
  return result;
}

/**
 * Get order status
 */
export async function getOrderStatus(
  encryptedApiKey: string,
  encryptedApiSecret: string,
  orderId: string
): Promise<Order> {
  const credentials = prepareCredentials(encryptedApiKey, encryptedApiSecret);

  const order = await makeAuthenticatedRequest<Order>(
    '/exchange/v1/orders/status',
    credentials,
    { id: orderId }
  );

  return order;
}

/**
 * Get all active orders
 */
export async function getActiveOrders(
  encryptedApiKey: string,
  encryptedApiSecret: string,
  market?: string
): Promise<Order[]> {
  const credentials = prepareCredentials(encryptedApiKey, encryptedApiSecret);

  const payload: Record<string, any> = {};
  if (market) {
    payload.market = market;
  }

  const orders = await makeAuthenticatedRequest<Order[]>(
    '/exchange/v1/orders/active_orders',
    credentials,
    payload
  );

  logger.info(`Fetched ${orders.length} active orders`);
  return orders;
}

/**
 * Get order history (completed orders)
 */
export async function getOrderHistory(
  encryptedApiKey: string,
  encryptedApiSecret: string,
  params?: {
    market?: string;
    limit?: number;
    page?: number;
  }
): Promise<Order[]> {
  const credentials = prepareCredentials(encryptedApiKey, encryptedApiSecret);

  const orders = await makeAuthenticatedRequest<Order[]>(
    '/exchange/v1/orders/trade_history',
    credentials,
    params || {}
  );

  logger.info(`Fetched ${orders.length} historical orders`);
  return orders;
}

/**
 * Get trade history (filled orders with execution details)
 */
export async function getTradeHistory(
  encryptedApiKey: string,
  encryptedApiSecret: string,
  params?: {
    market?: string;
    limit?: number;
    page?: number;
    from_timestamp?: number;
    to_timestamp?: number;
  }
): Promise<Trade[]> {
  const credentials = prepareCredentials(encryptedApiKey, encryptedApiSecret);

  const trades = await makeAuthenticatedRequest<Trade[]>(
    '/exchange/v1/users/trade_history',
    credentials,
    params || {}
  );

  logger.info(`Fetched ${trades.length} trades`);
  return trades;
}

// =============================================================================
// MARKET DATA
// =============================================================================

/**
 * Get ticker for a specific market
 */
export async function getTicker(market: string): Promise<Ticker> {
  const tickers = await makePublicRequest<Ticker[]>('/market_data/ticker');
  const ticker = tickers.find(t => t.market === market);

  if (!ticker) {
    throw new Error(`Ticker not found for market: ${market}`);
  }

  return ticker;
}

/**
 * Get tickers for all markets
 */
export async function getAllTickers(): Promise<Ticker[]> {
  return await makePublicRequest<Ticker[]>('/market_data/ticker');
}

/**
 * Get orderbook for a market
 */
export async function getOrderBook(market: string): Promise<{
  bids: { price: string; quantity: string }[];
  asks: { price: string; quantity: string }[];
}> {
  return await makePublicRequest(`/market_data/orderbook?pair=${market}`);
}

/**
 * Get historical OHLCV candles for backtesting
 *
 * @param market Market symbol (e.g., "BTCINR")
 * @param interval Candle interval (e.g., "1m", "5m", "15m", "1h", "1d")
 * @param limit Number of candles to fetch (max 1000)
 */
export async function getHistoricalCandles(
  market: string,
  interval: '1m' | '5m' | '15m' | '30m' | '1h' | '2h' | '4h' | '6h' | '8h' | '1d' | '1w' | '1M',
  limit: number = 500
): Promise<OHLCVCandle[]> {
  // CoinDCX uses Binance-style candle intervals
  const response = await makePublicRequest<number[][]>(
    `/market_data/candles?pair=${market}&interval=${interval}&limit=${limit}`
  );

  // Convert array format to object format
  const candles: OHLCVCandle[] = response.map(candle => ({
    time: candle[0],
    open: candle[1],
    high: candle[2],
    low: candle[3],
    close: candle[4],
    volume: candle[5],
  }));

  logger.info(`Fetched ${candles.length} candles for ${market} (${interval})`);
  return candles;
}

/**
 * Get available markets
 */
export async function getMarkets(): Promise<Array<{
  symbol: string;
  base_currency_short_name: string;
  target_currency_short_name: string;
  status: string;
}>> {
  return await makePublicRequest('/market_data/markets');
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Convert symbol format (e.g., "BTC-USDT" -> "BTCUSDT")
 */
export function normalizeMarket(symbol: string): string {
  return symbol.replace('-', '').replace('/', '').toUpperCase();
}

/**
 * Test connection with credentials
 */
export async function testConnection(
  encryptedApiKey: string,
  encryptedApiSecret: string
): Promise<boolean> {
  try {
    await getBalances(encryptedApiKey, encryptedApiSecret);
    return true;
  } catch (error) {
    logger.error('Connection test failed:', error);
    return false;
  }
}

export default {
  // Account
  getBalances,
  getBalance,

  // Orders
  placeMarketOrder,
  placeLimitOrder,
  cancelOrder,
  getOrderStatus,
  getActiveOrders,
  getOrderHistory,
  getTradeHistory,

  // Market Data
  getTicker,
  getAllTickers,
  getOrderBook,
  getHistoricalCandles,
  getMarkets,

  // Utilities
  normalizeMarket,
  testConnection,
};

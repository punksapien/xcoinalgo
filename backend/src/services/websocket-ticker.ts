/**
 * WebSocket Ticker Price Service
 * Maintains real-time price data from CoinDCX WebSocket stream
 * with in-memory caching and automatic reconnection
 */

import { io, Socket } from 'socket.io-client';
import { Logger } from '../utils/logger';

const logger = new Logger('WebSocketTicker');

interface TickerPrice {
  symbol: string;
  last_price: number;
  timestamp: number;
}

interface CoinDCXTickerMessage {
  data: {
    s: string;      // symbol
    lp: string;     // last price
    h: string;      // high
    l: string;      // low
    v: string;      // volume
    c: string;      // change
    cp: string;     // change percentage
    oi?: string;    // open interest (futures)
    // ... other fields
  };
}

class WebSocketTickerService {
  private static instance: WebSocketTickerService;
  private socket: Socket | null = null;
  private priceCache: Map<string, TickerPrice> = new Map();
  private readonly WEBSOCKET_URL = 'wss://stream.coindcx.com';
  private readonly CHANNEL = 'currentPrices@futures@rt';
  private readonly CACHE_TTL_MS = 5000; // 5 seconds stale data tolerance
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 10;
  private readonly INITIAL_RECONNECT_DELAY = 1000; // 1 second
  private isConnecting = false;
  private isConnected = false;

  private constructor() {
    // Singleton - private constructor
  }

  public static getInstance(): WebSocketTickerService {
    if (!WebSocketTickerService.instance) {
      WebSocketTickerService.instance = new WebSocketTickerService();
    }
    return WebSocketTickerService.instance;
  }

  /**
   * Initialize and connect to WebSocket
   */
  public async connect(): Promise<void> {
    if (this.isConnected || this.isConnecting) {
      logger.info('WebSocket already connected or connecting');
      return;
    }

    this.isConnecting = true;

    try {
      logger.info(`Connecting to WebSocket: ${this.WEBSOCKET_URL}`);

      this.socket = io(this.WEBSOCKET_URL, {
        transports: ['websocket'],
        reconnection: false, // We'll handle reconnection manually
      });

      this.setupEventHandlers();

      // Wait for connection
      await this.waitForConnection();

      this.isConnecting = false;
      this.isConnected = true;
      this.reconnectAttempts = 0;

      logger.info('WebSocket connected successfully');
    } catch (error) {
      this.isConnecting = false;
      logger.error('Failed to connect to WebSocket:', error);
      this.scheduleReconnect();
    }
  }

  /**
   * Wait for WebSocket connection to establish
   */
  private waitForConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('WebSocket connection timeout'));
      }, 10000); // 10 second timeout

      this.socket?.once('connect', () => {
        clearTimeout(timeout);
        resolve();
      });

      this.socket?.once('connect_error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  /**
   * Setup WebSocket event handlers
   */
  private setupEventHandlers(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      logger.info('WebSocket connected, subscribing to channel...');
      this.subscribeToChannel();
    });

    this.socket.on('disconnect', (reason) => {
      logger.warn(`WebSocket disconnected: ${reason}`);
      this.isConnected = false;
      this.scheduleReconnect();
    });

    this.socket.on('error', (error) => {
      logger.error('WebSocket error:', error);
    });

    // Listen to the futures prices channel
    this.socket.on(this.CHANNEL, (message: CoinDCXTickerMessage) => {
      this.handleTickerUpdate(message);
    });

    this.socket.on('connect_error', (error) => {
      logger.error('WebSocket connection error:', error);
      this.isConnected = false;
      this.scheduleReconnect();
    });
  }

  /**
   * Subscribe to the ticker price channel
   */
  private subscribeToChannel(): void {
    if (!this.socket) return;

    logger.info(`Subscribing to channel: ${this.CHANNEL}`);

    // Subscribe to the public channel for real-time futures prices
    this.socket.emit('join', { channelName: this.CHANNEL });
  }

  /**
   * Handle incoming ticker price updates
   */
  private handleTickerUpdate(message: CoinDCXTickerMessage): void {
    try {
      const { s: symbol, lp: lastPrice } = message.data;

      if (!symbol || !lastPrice) {
        return; // Invalid message
      }

      const price = parseFloat(lastPrice);

      if (isNaN(price)) {
        logger.warn(`Invalid price for ${symbol}: ${lastPrice}`);
        return;
      }

      // Update cache
      this.priceCache.set(symbol, {
        symbol,
        last_price: price,
        timestamp: Date.now(),
      });

      // Log only occasionally to avoid spam (every 100th update)
      if (Math.random() < 0.01) {
        logger.debug(`Price update: ${symbol} = ${price}`);
      }
    } catch (error) {
      logger.error('Error handling ticker update:', error);
    }
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
      logger.error('Max reconnection attempts reached. Stopping reconnection.');
      return;
    }

    const delay = Math.min(
      this.INITIAL_RECONNECT_DELAY * Math.pow(2, this.reconnectAttempts),
      30000 // Max 30 seconds
    );

    this.reconnectAttempts++;

    logger.info(`Scheduling reconnection attempt ${this.reconnectAttempts} in ${delay}ms`);

    setTimeout(() => {
      this.connect();
    }, delay);
  }

  /**
   * Get cached ticker price for a symbol
   * Returns null if not found or stale
   */
  public getCachedPrice(symbol: string): number | null {
    const cached = this.priceCache.get(symbol);

    if (!cached) {
      return null;
    }

    // Check if data is stale
    const age = Date.now() - cached.timestamp;
    if (age > this.CACHE_TTL_MS) {
      logger.debug(`Cached price for ${symbol} is stale (${age}ms old)`);
      return null;
    }

    return cached.last_price;
  }

  /**
   * Get ticker price with fallback to REST API
   */
  public async getPrice(symbol: string): Promise<number> {
    // Try cache first
    const cachedPrice = this.getCachedPrice(symbol);
    if (cachedPrice !== null) {
      return cachedPrice;
    }

    // Fallback to REST API
    logger.debug(`Cache miss for ${symbol}, falling back to REST API`);

    try {
      const CoinDCXClient = require('./coindcx-client');
      const ticker = await CoinDCXClient.getTicker(symbol);
      return ticker.last_price;
    } catch (error) {
      logger.error(`Failed to get price for ${symbol} via REST API:`, error);
      throw new Error(`Unable to get price for ${symbol}`);
    }
  }

  /**
   * Get all cached prices
   */
  public getAllCachedPrices(): Map<string, TickerPrice> {
    // Filter out stale data
    const now = Date.now();
    const fresh = new Map<string, TickerPrice>();

    for (const [symbol, price] of this.priceCache.entries()) {
      const age = now - price.timestamp;
      if (age <= this.CACHE_TTL_MS) {
        fresh.set(symbol, price);
      }
    }

    return fresh;
  }

  /**
   * Check if WebSocket is connected
   */
  public isServiceConnected(): boolean {
    return this.isConnected;
  }

  /**
   * Get cache statistics
   */
  public getCacheStats(): { symbols: number; oldestAge: number; newestAge: number } {
    const now = Date.now();
    let oldestAge = 0;
    let newestAge = Infinity;

    for (const price of this.priceCache.values()) {
      const age = now - price.timestamp;
      oldestAge = Math.max(oldestAge, age);
      newestAge = Math.min(newestAge, age);
    }

    return {
      symbols: this.priceCache.size,
      oldestAge,
      newestAge: newestAge === Infinity ? 0 : newestAge,
    };
  }

  /**
   * Disconnect from WebSocket
   */
  public disconnect(): void {
    if (this.socket) {
      logger.info('Disconnecting WebSocket...');
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
    }
  }

  /**
   * Clear price cache
   */
  public clearCache(): void {
    this.priceCache.clear();
    logger.info('Price cache cleared');
  }
}

// Export singleton instance
export const websocketTicker = WebSocketTickerService.getInstance();

// Auto-connect on module load (with delay to allow app initialization)
setTimeout(() => {
  websocketTicker.connect().catch((error) => {
    logger.error('Failed to auto-connect WebSocket:', error);
  });
}, 2000);

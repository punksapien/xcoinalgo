/**
 * Symbol Validator Service
 *
 * Validates trading symbols against CoinDCX exchange
 * Provides suggestions for invalid symbols
 * Auto-detects spot vs futures markets
 */

import { Logger } from '../utils/logger';

const logger = new Logger('SymbolValidator');

const COINDCX_API_BASE = 'https://api.coindcx.com';

interface SpotMarket {
  symbol: string;
  pair: string;
  coindcx_name: string;
  base_currency_short_name: string;
  target_currency_short_name: string;
  status: string;
}

interface FuturesInstrument {
  pair: string;
  base_currency_short_name: string;
  target_currency_short_name: string;
  margin_currency_short_name: string;
  status: string;
}

interface ValidationResult {
  isValid: boolean;
  normalized: string;
  type: 'spot' | 'futures' | 'unknown';
  suggestions: string[];
  market?: SpotMarket | FuturesInstrument;
}

class SymbolValidator {
  private spotMarkets: Map<string, SpotMarket> = new Map();
  private futuresMarkets: Map<string, FuturesInstrument> = new Map();
  private lastUpdate: Date | null = null;
  private isLoading: boolean = false;
  private loadPromise: Promise<void> | null = null;

  /**
   * Load markets from CoinDCX API
   * Caches results for 24 hours
   */
  async loadMarkets(force: boolean = false): Promise<void> {
    // Return existing load promise if already loading
    if (this.isLoading && this.loadPromise) {
      return this.loadPromise;
    }

    // Check if cache is still valid (24 hours)
    if (!force && this.lastUpdate) {
      const cacheAge = Date.now() - this.lastUpdate.getTime();
      const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours
      if (cacheAge < CACHE_DURATION) {
        logger.debug(`Using cached markets (age: ${Math.floor(cacheAge / 1000 / 60)} minutes)`);
        return;
      }
    }

    this.isLoading = true;
    this.loadPromise = this._loadMarketsInternal(force);

    try {
      await this.loadPromise;
    } finally {
      this.isLoading = false;
      this.loadPromise = null;
    }
  }

  private async _loadMarketsInternal(force: boolean): Promise<void> {
    try {
      logger.info('Loading markets from CoinDCX...');

      // Load spot markets
      const spotResponse = await fetch(`${COINDCX_API_BASE}/exchange/v1/markets_details`);
      if (!spotResponse.ok) {
        throw new Error(`Failed to fetch spot markets: ${spotResponse.statusText}`);
      }
      const spotMarketsData = await spotResponse.json();
      const spotMarkets: SpotMarket[] = Array.isArray(spotMarketsData) ? spotMarketsData : [];

      this.spotMarkets.clear();
      for (const market of spotMarkets) {
        if (market.status === 'active') {
          // Index by multiple keys for flexible lookup
          this.spotMarkets.set(market.symbol, market);
          this.spotMarkets.set(market.pair, market);
          this.spotMarkets.set(market.coindcx_name, market);
        }
      }

      logger.info(`Loaded ${this.spotMarkets.size} spot markets`);

      // Load futures instruments (prefer active_instruments with margin filter)
      try {
        const buildActiveUrl = (margins: string[]) => {
          const params = new URLSearchParams();
          for (const m of margins) params.append('margin_currency_short_name[]', m);
          return `${COINDCX_API_BASE}/exchange/v1/derivatives/futures/data/active_instruments?${params.toString()}`;
        };

        let futuresInstruments: FuturesInstrument[] = [];

        // Try active instruments for USDT first
        const activeUsdt = await fetch(buildActiveUrl(['USDT']));
        if (activeUsdt.ok) {
          const data = await activeUsdt.json();
          futuresInstruments = Array.isArray(data) ? data : (data?.instruments || []);
        }

        // Fallback: include INR as well if list seems too small
        if (futuresInstruments.length < 10) {
          const activeBoth = await fetch(buildActiveUrl(['USDT', 'INR']));
          if (activeBoth.ok) {
            const data = await activeBoth.json();
            futuresInstruments = Array.isArray(data) ? data : (data?.instruments || futuresInstruments);
          }
        }

        // Final fallback: older instruments endpoint
        if (futuresInstruments.length === 0) {
          const fallback = await fetch(`${COINDCX_API_BASE}/exchange/v1/derivatives/futures/data/instruments`);
          if (fallback.ok) {
            const data = await fallback.json() as unknown;
            futuresInstruments = Array.isArray(data) ? data : (data as { instruments?: FuturesInstrument[] })?.instruments || [];
          }
        }

        this.futuresMarkets.clear();
        for (const instrument of futuresInstruments) {
          if (instrument.status === 'active' || !instrument.status) {
            this.futuresMarkets.set(instrument.pair, instrument);
          }
        }

        logger.info(`Loaded ${this.futuresMarkets.size} futures markets`);
      } catch (error) {
        logger.warn('Error loading futures markets (continuing with spot only):', error);
      }

      this.lastUpdate = new Date();
      logger.info('Markets loaded successfully');
    } catch (error) {
      logger.error('Failed to load markets from CoinDCX:', error);
      throw error;
    }
  }

  /**
   * Validate a symbol and get suggestions
   */
  async validateSymbol(symbol: string): Promise<ValidationResult> {
    // Ensure markets are loaded
    await this.loadMarkets();

    const normalizedInput = symbol.trim();

    // Check exact match in spot markets
    if (this.spotMarkets.has(normalizedInput)) {
      return {
        isValid: true,
        normalized: normalizedInput,
        type: 'spot',
        suggestions: [],
        market: this.spotMarkets.get(normalizedInput)!,
      };
    }

    // Check exact match in futures markets
    if (this.futuresMarkets.has(normalizedInput)) {
      return {
        isValid: true,
        normalized: normalizedInput,
        type: 'futures',
        suggestions: [],
        market: this.futuresMarkets.get(normalizedInput)!,
      };
    }

    // Symbol not found - force refresh once and retry
    await this.loadMarkets(true);
    if (this.spotMarkets.has(normalizedInput)) {
      return {
        isValid: true,
        normalized: normalizedInput,
        type: 'spot',
        suggestions: [],
        market: this.spotMarkets.get(normalizedInput)!,
      };
    }
    if (this.futuresMarkets.has(normalizedInput)) {
      return {
        isValid: true,
        normalized: normalizedInput,
        type: 'futures',
        suggestions: [],
        market: this.futuresMarkets.get(normalizedInput)!,
      };
    }

    // Still not found - generate suggestions
    const suggestions = this.findSuggestions(normalizedInput);

    return {
      isValid: false,
      normalized: normalizedInput,
      type: 'unknown',
      suggestions,
    };
  }

  /**
   * Find similar symbols using fuzzy matching
   */
  private findSuggestions(input: string): string[] {
    const normalizedInput = input.toLowerCase().replace(/[-_/]/g, '');
    const suggestions: Array<{ symbol: string; score: number }> = [];

    // Search in spot markets
    for (const [key, market] of this.spotMarkets.entries()) {
      const normalizedKey = key.toLowerCase().replace(/[-_/]/g, '');

      // Check if input is contained in the symbol
      if (normalizedKey.includes(normalizedInput) || normalizedInput.includes(normalizedKey)) {
        const score = this.calculateSimilarity(normalizedInput, normalizedKey);
        suggestions.push({ symbol: market.pair || market.symbol, score });
      }
    }

    // Search in futures markets
    for (const [key, instrument] of this.futuresMarkets.entries()) {
      const normalizedKey = key.toLowerCase().replace(/[-_/]/g, '');

      if (normalizedKey.includes(normalizedInput) || normalizedInput.includes(normalizedKey)) {
        const score = this.calculateSimilarity(normalizedInput, normalizedKey);
        suggestions.push({ symbol: instrument.pair, score });
      }
    }

    // Sort by similarity score and return top 5
    return suggestions
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(s => s.symbol);
  }

  /**
   * Calculate similarity score (simple Levenshtein-inspired)
   */
  private calculateSimilarity(a: string, b: string): number {
    // Exact match
    if (a === b) return 100;

    // Starts with
    if (b.startsWith(a) || a.startsWith(b)) return 90;

    // Contains
    if (b.includes(a) || a.includes(b)) return 80;

    // Levenshtein distance (simplified)
    const distance = this.levenshteinDistance(a, b);
    const maxLen = Math.max(a.length, b.length);
    return Math.max(0, 100 - (distance / maxLen) * 100);
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[b.length][a.length];
  }

  /**
   * Search for symbols matching a query
   */
  async search(query: string, limit: number = 10): Promise<Array<{
    symbol: string;
    type: 'spot' | 'futures';
    base: string;
    target: string;
  }>> {
    await this.loadMarkets();

    const normalizedQuery = query.toLowerCase().replace(/[-_/]/g, '');
    const results: Array<{
      symbol: string;
      type: 'spot' | 'futures';
      base: string;
      target: string;
      score: number;
    }> = [];

    // Search spot markets
    for (const market of this.spotMarkets.values()) {
      const symbolNorm = (market.pair || market.symbol).toLowerCase().replace(/[-_/]/g, '');
      if (symbolNorm.includes(normalizedQuery)) {
        results.push({
          symbol: market.pair || market.symbol,
          type: 'spot',
          base: market.base_currency_short_name,
          target: market.target_currency_short_name,
          score: this.calculateSimilarity(normalizedQuery, symbolNorm),
        });
      }
    }

    // Search futures markets
    for (const instrument of this.futuresMarkets.values()) {
      const symbolNorm = instrument.pair.toLowerCase().replace(/[-_/]/g, '');
      if (symbolNorm.includes(normalizedQuery)) {
        results.push({
          symbol: instrument.pair,
          type: 'futures',
          base: instrument.margin_currency_short_name || instrument.base_currency_short_name,
          target: instrument.target_currency_short_name,
          score: this.calculateSimilarity(normalizedQuery, symbolNorm),
        });
      }
    }

    // Sort by score and return top results
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ symbol, type, base, target }) => ({ symbol, type, base, target }));
  }

  /**
   * Check if validator has been initialized
   */
  isInitialized(): boolean {
    return this.lastUpdate !== null && (this.spotMarkets.size > 0 || this.futuresMarkets.size > 0);
  }

  /**
   * Get all available symbols
   */
  getAllSymbols(): { spot: string[]; futures: string[] } {
    return {
      spot: Array.from(new Set(Array.from(this.spotMarkets.values()).map(m => m.pair || m.symbol))),
      futures: Array.from(this.futuresMarkets.keys()),
    };
  }
}

// Singleton instance
export const symbolValidator = new SymbolValidator();

// Initialize on module load
symbolValidator.loadMarkets().catch(err => {
  logger.error('Failed to initialize symbol validator:', err);
});

export default symbolValidator;

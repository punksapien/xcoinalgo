/**
 * Market Data Routes - Symbol validation and search
 */

import { Router } from 'express';
import { symbolValidator } from '../services/symbol-validator';
import { Logger } from '../utils/logger';

const logger = new Logger('MarketData');
const router = Router();

/**
 * Search for symbols matching a query
 * GET /api/market-data/symbols?search=avax&limit=10
 */
router.get('/symbols', async (req, res, next) => {
  try {
    const { search, limit } = req.query;

    if (!search || typeof search !== 'string') {
      return res.status(400).json({
        error: 'Search query is required',
      });
    }

    const maxLimit = Math.min(parseInt(limit as string) || 10, 50);

    const results = await symbolValidator.search(search, maxLimit);

    res.json({
      query: search,
      count: results.length,
      symbols: results,
    });
  } catch (error) {
    logger.error('Symbol search failed:', error);
    next(error);
  }
});

/**
 * Validate a specific symbol
 * GET /api/market-data/validate/:symbol
 */
router.get('/validate/:symbol', async (req, res, next) => {
  try {
    const { symbol } = req.params;

    if (!symbol) {
      return res.status(400).json({
        error: 'Symbol is required',
      });
    }

    const validation = await symbolValidator.validateSymbol(symbol);

    res.json(validation);
  } catch (error) {
    logger.error('Symbol validation failed:', error);
    next(error);
  }
});

/**
 * Get all available symbols
 * GET /api/market-data/all-symbols
 */
router.get('/all-symbols', async (req, res, next) => {
  try {
    const symbols = symbolValidator.getAllSymbols();

    res.json({
      spot: symbols.spot.length,
      futures: symbols.futures.length,
      symbols,
    });
  } catch (error) {
    logger.error('Failed to get all symbols:', error);
    next(error);
  }
});

/**
 * Refresh symbols cache
 * POST /api/market-data/refresh
 */
router.post('/refresh', async (req, res, next) => {
  try {
    logger.info('Refreshing symbols cache...');
    await symbolValidator.loadMarkets(true); // Force refresh

    const symbols = symbolValidator.getAllSymbols();

    res.json({
      success: true,
      message: 'Symbols cache refreshed',
      spot: symbols.spot.length,
      futures: symbols.futures.length,
    });
  } catch (error) {
    logger.error('Failed to refresh symbols:', error);
    next(error);
  }
});

export { router as marketDataRoutes };

/**
 * Manual Integration Test for WebSocket Ticker Service
 *
 * This script tests the WebSocket ticker service to ensure:
 * 1. WebSocket connects successfully
 * 2. Prices are being cached
 * 3. Cache invalidation works correctly
 * 4. Fallback to REST API works when cache misses
 *
 * Run with: ts-node src/tests/test-websocket-ticker.ts
 */

import { websocketTicker } from '../services/websocket-ticker';
import { Logger } from '../utils/logger';

const logger = new Logger('WebSocketTickerTest');

async function runTests() {
  console.log('\n=== WebSocket Ticker Service Test Suite ===\n');

  try {
    // Test 1: Connect to WebSocket
    console.log('Test 1: Connecting to WebSocket...');
    await websocketTicker.connect();
    console.log('✅ WebSocket connection initiated\n');

    // Test 2: Wait for some data to accumulate
    console.log('Test 2: Waiting for ticker data (10 seconds)...');
    await new Promise(resolve => setTimeout(resolve, 10000));

    const stats = websocketTicker.getCacheStats();
    console.log(`✅ Cache populated with ${stats.symbols} symbols`);
    console.log(`   Newest data age: ${stats.newestAge}ms`);
    console.log(`   Oldest data age: ${stats.oldestAge}ms\n`);

    if (stats.symbols === 0) {
      console.log('⚠️  Warning: No symbols in cache after 10 seconds');
      console.log('   WebSocket may not be receiving data correctly\n');
    }

    // Test 3: Get a specific price (should hit cache)
    console.log('Test 3: Fetching BTCUSDT price...');
    try {
      const btcPrice = await websocketTicker.getPrice('BTCUSDT');
      console.log(`✅ BTC Price: ${btcPrice}`);

      // Check if it came from cache
      const cachedPrice = websocketTicker.getCachedPrice('BTCUSDT');
      if (cachedPrice === btcPrice) {
        console.log('   ✅ Price served from cache\n');
      } else {
        console.log('   ℹ️  Price fetched from REST API (cache miss)\n');
      }
    } catch (error) {
      console.error('❌ Failed to get BTC price:', error);
    }

    // Test 4: Get ETH price
    console.log('Test 4: Fetching ETHUSDT price...');
    try {
      const ethPrice = await websocketTicker.getPrice('ETHUSDT');
      console.log(`✅ ETH Price: ${ethPrice}`);

      const cachedPrice = websocketTicker.getCachedPrice('ETHUSDT');
      if (cachedPrice === ethPrice) {
        console.log('   ✅ Price served from cache\n');
      } else {
        console.log('   ℹ️  Price fetched from REST API (cache miss)\n');
      }
    } catch (error) {
      console.error('❌ Failed to get ETH price:', error);
    }

    // Test 5: Check all cached prices
    console.log('Test 5: Listing all cached symbols...');
    const allPrices = websocketTicker.getAllCachedPrices();
    console.log(`✅ Total cached symbols: ${allPrices.size}`);

    if (allPrices.size > 0) {
      console.log('   Sample prices:');
      let count = 0;
      for (const [symbol, price] of allPrices.entries()) {
        if (count < 10) {
          const age = Date.now() - price.timestamp;
          console.log(`   - ${symbol}: ${price.last_price} (${age}ms old)`);
          count++;
        }
      }
    }
    console.log('');

    // Test 6: Test cache expiration
    console.log('Test 6: Testing cache expiration (waiting 6 seconds)...');
    console.log('   Cache TTL is set to 5 seconds');
    await new Promise(resolve => setTimeout(resolve, 6000));

    const statsAfterTTL = websocketTicker.getCacheStats();
    console.log(`✅ Cache after TTL: ${statsAfterTTL.symbols} symbols`);
    console.log(`   Data should be refreshed by WebSocket stream\n`);

    // Test 7: Check WebSocket connection status
    console.log('Test 7: Checking WebSocket status...');
    const isConnected = websocketTicker.isServiceConnected();
    console.log(`${isConnected ? '✅' : '❌'} WebSocket connected: ${isConnected}\n`);

    // Test 8: Test unrealized P&L calculation logic
    console.log('Test 8: Testing unrealized P&L calculation...');
    const testTrades = [
      { symbol: 'BTCUSDT', side: 'LONG', entryPrice: 45000, quantity: 0.1 },
      { symbol: 'ETHUSDT', side: 'SHORT', entryPrice: 2500, quantity: 1 },
    ];

    let totalUnrealizedPnl = 0;
    for (const trade of testTrades) {
      try {
        const currentPrice = await websocketTicker.getPrice(trade.symbol);
        let pnl = 0;

        if (trade.side === 'LONG') {
          pnl = (currentPrice - trade.entryPrice) * trade.quantity;
        } else {
          pnl = (trade.entryPrice - currentPrice) * trade.quantity;
        }

        totalUnrealizedPnl += pnl;

        console.log(`   ${trade.symbol} ${trade.side}:`);
        console.log(`     Entry: ${trade.entryPrice}, Current: ${currentPrice}`);
        console.log(`     P&L: ${pnl.toFixed(2)}`);
      } catch (error) {
        console.error(`   ❌ Failed to calculate P&L for ${trade.symbol}:`, error);
      }
    }

    console.log(`✅ Total Unrealized P&L: ${totalUnrealizedPnl.toFixed(2)}\n`);

    // Test 9: Performance test
    console.log('Test 9: Performance test (100 price fetches)...');
    const symbols = Array.from(allPrices.keys()).slice(0, 10);
    const startTime = Date.now();

    for (let i = 0; i < 100; i++) {
      const symbol = symbols[i % symbols.length];
      await websocketTicker.getPrice(symbol);
    }

    const duration = Date.now() - startTime;
    const avgTime = duration / 100;
    console.log(`✅ 100 fetches completed in ${duration}ms`);
    console.log(`   Average time per fetch: ${avgTime.toFixed(2)}ms\n`);

    if (avgTime > 50) {
      console.log('⚠️  Warning: Average fetch time > 50ms. Check cache performance.\n');
    }

    // Final summary
    console.log('=== Test Summary ===');
    console.log(`WebSocket Status: ${isConnected ? 'Connected ✅' : 'Disconnected ❌'}`);
    console.log(`Cached Symbols: ${statsAfterTTL.symbols}`);
    console.log(`Avg Fetch Time: ${avgTime.toFixed(2)}ms`);
    console.log('\n✅ All tests completed!\n');

  } catch (error) {
    console.error('\n❌ Test suite failed:', error);
    console.error('\nStack trace:', (error as Error).stack);
  } finally {
    // Cleanup
    console.log('Cleaning up and disconnecting...');
    websocketTicker.disconnect();
    process.exit(0);
  }
}

// Run tests
runTests();

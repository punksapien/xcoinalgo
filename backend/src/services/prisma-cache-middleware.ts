/**
 * Prisma Client Extension for Automatic Redis Cache Synchronization
 *
 * Intercepts ALL strategy mutations (create/update/delete) and automatically
 * syncs Redis cache. Works across ALL backend instances - no manual cleanup needed.
 *
 * Uses Prisma v5+ Client Extensions API (not deprecated middleware)
 *
 * @module prisma-cache-middleware
 */

import { strategyRegistry } from './strategy-execution/strategy-registry';
import { redis } from '../lib/redis-client';

/**
 * Create Prisma client extension for cache sync
 * Call this to wrap your Prisma client on initialization
 */
export function createCacheSyncExtension(prisma: any) {
  const extendedClient = prisma.$extends({
    name: 'strategy-cache-sync',
    query: {
      strategy: {
        async create({ args, query }: any) {
          const result = await query(args);
          await handleStrategyCreation(result);
          return result;
        },
        async update({ args, query }: any) {
          const result = await query(args);
          await handleStrategyUpdate(args, result);
          return result;
        },
        async updateMany({ args, query }: any) {
          const result = await query(args);
          await handleStrategyUpdate(args, result);
          return result;
        },
        async delete({ args, query }: any) {
          const result = await query(args);
          await handleStrategyDeletion(args, result);
          return result;
        },
        async deleteMany({ args, query }: any) {
          const result = await query(args);
          await handleStrategyDeletion(args, result);
          return result;
        }
      }
    }
  });

  console.log('✅ Prisma cache sync extension registered');
  return extendedClient;
}

/**
 * Handle strategy deletion - remove from Redis
 */
async function handleStrategyDeletion(args: any, result: any) {
  const strategyId = args?.where?.id;

  if (!strategyId) {
    // deleteMany or complex where clause - trigger full reconciliation
    console.log('[Prisma Extension] Complex deletion detected, triggering reconciliation');
    await strategyRegistry.reconcileWithDatabase();
    return;
  }

  console.log(`[Prisma Extension] Strategy deleted: ${strategyId}, cleaning Redis...`);

  // Get strategy config from cache before deletion
  const config = await getStrategyConfigFromCache(strategyId);

  if (config?.symbol && config?.resolution) {
    await strategyRegistry.unregisterStrategy(strategyId, config.symbol, config.resolution);
  }

  // Clean up settings cache
  await redis.del(`strategy:${strategyId}:settings`);
  await redis.del(`strategy:${strategyId}:config`);

  console.log(`[Prisma Extension] ✅ Strategy ${strategyId} removed from Redis`);
}

/**
 * Handle strategy update - sync if executionConfig or isActive changed
 */
async function handleStrategyUpdate(args: any, result: any) {
  const strategyId = args?.where?.id;
  const updates = args?.data;

  if (!strategyId || !updates) {
    // Complex update - trigger reconciliation
    console.log('[Prisma Extension] Complex update detected, triggering reconciliation');
    await strategyRegistry.reconcileWithDatabase();
    return;
  }

  // Check if executionConfig or isActive changed
  const configChanged = updates.executionConfig !== undefined;
  const activeChanged = updates.isActive !== undefined;

  if (!configChanged && !activeChanged) {
    // No cache-relevant changes
    return;
  }

  console.log(`[Prisma Extension] Strategy updated: ${strategyId}, syncing Redis...`);

  // Get old config from cache
  const oldConfig = await getStrategyConfigFromCache(strategyId);

  // If deactivated, unregister
  if (updates.isActive === false) {
    if (oldConfig?.symbol && oldConfig?.resolution) {
      await strategyRegistry.unregisterStrategy(strategyId, oldConfig.symbol, oldConfig.resolution);
      console.log(`[Prisma Extension] ✅ Deactivated strategy ${strategyId} unregistered`);
    }
  }
  // If activated, register
  else if (updates.isActive === true) {
    const newConfig = updates.executionConfig || oldConfig;
    const symbol = newConfig?.symbol || newConfig?.pair;
    const resolution = newConfig?.resolution;

    if (symbol && resolution) {
      await strategyRegistry.registerStrategy(strategyId, symbol, resolution);
      console.log(`[Prisma Extension] ✅ Activated strategy ${strategyId} registered`);
    }
  }
  // If config changed, re-register
  else if (configChanged) {
    const newConfig = updates.executionConfig;
    const oldSymbol = oldConfig?.symbol || oldConfig?.pair;
    const oldResolution = oldConfig?.resolution;
    const newSymbol = newConfig?.symbol || newConfig?.pair;
    const newResolution = newConfig?.resolution;

    if (oldSymbol && oldResolution && newSymbol && newResolution) {
      await strategyRegistry.updateStrategyRegistration(
        strategyId,
        oldSymbol,
        oldResolution,
        newSymbol,
        newResolution
      );
      console.log(`[Prisma Extension] ✅ Strategy ${strategyId} config updated in Redis`);
    }
  }

  // Clear settings cache to force reload
  await redis.del(`strategy:${strategyId}:settings`);
}

/**
 * Handle strategy creation - register if active
 */
async function handleStrategyCreation(result: any) {
  const strategy = result;

  if (!strategy?.id) {
    return;
  }

  console.log(`[Prisma Extension] Strategy created: ${strategy.id}`);

  // Auto-register if active and has executionConfig
  if (strategy.isActive && strategy.executionConfig) {
    const config = strategy.executionConfig as any;
    const symbol = config.symbol || config.pair;
    const resolution = config.resolution;

    if (symbol && resolution) {
      await strategyRegistry.registerStrategy(strategy.id, symbol, resolution);
      console.log(`[Prisma Extension] ✅ New strategy ${strategy.id} registered`);
    }
  }
}

/**
 * Get strategy config from Redis cache
 */
async function getStrategyConfigFromCache(strategyId: string): Promise<any> {
  try {
    // Try config cache first
    const configData = await redis.hgetall(`strategy:${strategyId}:config`);
    if (configData && Object.keys(configData).length > 0) {
      return configData;
    }

    // Fallback: try settings cache
    const settingsData = await redis.hgetall(`strategy:${strategyId}:settings`);
    if (settingsData && Object.keys(settingsData).length > 0) {
      return settingsData;
    }

    return null;
  } catch (error) {
    console.error('[Prisma Middleware] Failed to get strategy config:', error);
    return null;
  }
}

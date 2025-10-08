/**
 * Redis Client Singleton
 *
 * Provides a shared Redis connection for the application
 */

import Redis from 'ioredis'

let redisClient: Redis | null = null

/**
 * Get or create the Redis client singleton
 */
export function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0', 10),
      retryStrategy(times) {
        const delay = Math.min(times * 50, 2000)
        return delay
      },
      reconnectOnError(err) {
        const targetError = 'READONLY'
        if (err.message.includes(targetError)) {
          // Reconnect on READONLY error
          return true
        }
        return false
      },
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: false,
    })

    redisClient.on('connect', () => {
      console.log('Redis client connected')
    })

    redisClient.on('ready', () => {
      console.log('Redis client ready')
    })

    redisClient.on('error', (err) => {
      console.error('Redis client error:', err)
    })

    redisClient.on('close', () => {
      console.log('Redis client connection closed')
    })

    redisClient.on('reconnecting', () => {
      console.log('Redis client reconnecting')
    })

    redisClient.on('end', () => {
      console.log('Redis client ended')
    })
  }

  return redisClient
}

/**
 * Close the Redis connection
 */
export async function closeRedisClient(): Promise<void> {
  if (redisClient) {
    await redisClient.quit()
    redisClient = null
    console.log('Redis client closed')
  }
}

/**
 * Health check for Redis connection
 */
export async function checkRedisHealth(): Promise<boolean> {
  try {
    const client = getRedisClient()
    const result = await client.ping()
    return result === 'PONG'
  } catch (error) {
    console.error('Redis health check failed:', error)
    return false
  }
}

// Export the singleton instance
export const redis = getRedisClient()

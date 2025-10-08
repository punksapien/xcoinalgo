/**
 * Internal Event Bus
 *
 * Provides pub/sub mechanism for internal events like candle closes
 */

import { EventEmitter } from 'events'
import type { CandleEvent } from './time-utils'

// Event types
export interface EventMap {
  'candle.close': CandleEvent
  'strategy.execution.start': { strategyId: string; interval: string }
  'strategy.execution.complete': {
    strategyId: string
    interval: string
    success: boolean
    duration: number
  }
  'strategy.execution.error': { strategyId: string; interval: string; error: Error }
  'subscription.created': { subscriptionId: string; strategyId: string; userId: string }
  'subscription.cancelled': { subscriptionId: string; strategyId: string; userId: string }
  'trade.created': { tradeId: string; subscriptionId: string; symbol: string }
  'trade.filled': { tradeId: string; price: number; quantity: number }
  'trade.closed': { tradeId: string; pnl: number }
}

class TypedEventEmitter {
  private emitter = new EventEmitter()

  constructor() {
    // Set max listeners to avoid warnings
    this.emitter.setMaxListeners(100)
  }

  /**
   * Emit an event
   */
  emit<K extends keyof EventMap>(event: K, data: EventMap[K]): void {
    this.emitter.emit(event, data)
  }

  /**
   * Subscribe to an event
   */
  on<K extends keyof EventMap>(
    event: K,
    listener: (data: EventMap[K]) => void | Promise<void>
  ): void {
    this.emitter.on(event, listener)
  }

  /**
   * Subscribe to an event once
   */
  once<K extends keyof EventMap>(
    event: K,
    listener: (data: EventMap[K]) => void | Promise<void>
  ): void {
    this.emitter.once(event, listener)
  }

  /**
   * Unsubscribe from an event
   */
  off<K extends keyof EventMap>(
    event: K,
    listener: (data: EventMap[K]) => void | Promise<void>
  ): void {
    this.emitter.off(event, listener)
  }

  /**
   * Remove all listeners for an event
   */
  removeAllListeners<K extends keyof EventMap>(event?: K): void {
    this.emitter.removeAllListeners(event)
  }

  /**
   * Get listener count for an event
   */
  listenerCount<K extends keyof EventMap>(event: K): number {
    return this.emitter.listenerCount(event)
  }
}

// Singleton instance
export const eventBus = new TypedEventEmitter()

/**
 * Wait for an event (returns a promise)
 */
export function waitForEvent<K extends keyof EventMap>(
  event: K,
  timeout?: number
): Promise<EventMap[K]> {
  return new Promise((resolve, reject) => {
    const timer = timeout
      ? setTimeout(() => {
          reject(new Error(`Event ${event} timeout after ${timeout}ms`))
        }, timeout)
      : null

    eventBus.once(event, (data) => {
      if (timer) clearTimeout(timer)
      resolve(data)
    })
  })
}

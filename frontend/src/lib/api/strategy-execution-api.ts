/**
 * Strategy Execution API Client
 *
 * Connects to the multi-tenant strategy execution backend.
 * Replaces the old BotDeployment model with StrategySubscription model.
 */

// Use relative paths - Next.js rewrites will proxy /api/* to backend
// Client-side: empty string (relative URLs) - triggers Next.js rewrites
// Server-side (SSR): localhost for local dev
const API_BASE_URL = typeof window === 'undefined' ? 'http://localhost:3001' : '';

// ============================================
// Types
// ============================================

export interface SubscriptionConfig {
  capital: number;
  riskPerTrade: number;
  leverage?: number;
  maxPositions?: number;
  maxDailyLoss?: number;
  slAtrMultiplier?: number;
  tpAtrMultiplier?: number;
  brokerCredentialId: string;
}

export interface Subscription {
  id: string;
  userId: string;
  strategyId: string;
  capital: number;
  riskPerTrade: number;
  leverage: number;
  maxPositions: number;
  maxDailyLoss: number;
  slAtrMultiplier?: number;
  tpAtrMultiplier?: number;
  brokerCredentialId: string;
  isActive: boolean;
  isPaused: boolean;
  subscribedAt: string;
  pausedAt?: string;
  unsubscribedAt?: string;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  totalPnl: number;
  strategy?: {
    id: string;
    name: string;
    executionConfig: Record<string, unknown>;
  };
  brokerCredential?: {
    id: string;
    apiKey: string;
    apiSecret: string;
  };
}

export interface SubscriptionStats {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalPnl: number;
}

export interface ExecutionStats {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  totalTrades: number;
  avgDuration: number;
  lastExecution: string | null;
}

export interface Strategy {
  id: string;
  name: string;
  code: string;
  description?: string;
  author: string;
  version: string;
  isActive: boolean;
  isPublic: boolean;
  isMarketplace: boolean;
  subscriberCount: number;
  executionConfig?: {
    symbol: string;
    resolution: string;
    lookbackPeriod?: number;
    [key: string]: unknown;
  };
  createdAt: string;
  updatedAt: string;
}

// ============================================
// Helper Functions
// ============================================

function getAuthHeaders(token: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let errorMessage = 'Request failed';
    try {
      const errorData = await response.json();
      errorMessage = errorData.error || errorData.message || errorMessage;
    } catch {
      // If JSON parsing fails, use default message
      errorMessage = `Request failed with status ${response.status}`;
    }

    // Throw error with status code for better error handling
    const error = new Error(errorMessage) as Error & { status: number; statusText: string };
    error.status = response.status;
    error.statusText = response.statusText;
    throw error;
  }
  return response.json();
}

// ============================================
// Strategy Execution API
// ============================================

export class StrategyExecutionAPI {
  /**
   * Deploy a strategy (initialize settings in Redis)
   */
  static async deployStrategy(
    strategyId: string,
    token: string
  ): Promise<{ message: string; strategy: Strategy }> {
    const response = await fetch(`${API_BASE_URL}/api/strategies/deploy`, {
      method: 'POST',
      headers: getAuthHeaders(token),
      body: JSON.stringify({ strategyId }),
    });

    return handleResponse(response);
  }

  /**
   * Subscribe user to a strategy
   */
  static async subscribeToStrategy(
    strategyId: string,
    config: SubscriptionConfig,
    token: string
  ): Promise<{ message: string; subscription: Subscription }> {
    const response = await fetch(`${API_BASE_URL}/api/strategies/${strategyId}/subscribe`, {
      method: 'POST',
      headers: getAuthHeaders(token),
      body: JSON.stringify(config),
    });

    return handleResponse(response);
  }

  /**
   * Update strategy settings (affects all subscribers)
   */
  static async updateStrategySettings(
    strategyId: string,
    updates: Record<string, unknown>,
    token: string
  ): Promise<{ message: string; settings: Record<string, unknown> }> {
    const response = await fetch(`${API_BASE_URL}/api/strategies/${strategyId}/settings`, {
      method: 'PUT',
      headers: getAuthHeaders(token),
      body: JSON.stringify(updates),
    });

    return handleResponse(response);
  }

  /**
   * Update user subscription settings
   */
  static async updateSubscriptionSettings(
    subscriptionId: string,
    updates: Partial<SubscriptionConfig>,
    token: string
  ): Promise<{ message: string; subscription: Subscription }> {
    const response = await fetch(`${API_BASE_URL}/api/strategies/subscriptions/${subscriptionId}`, {
      method: 'PUT',
      headers: getAuthHeaders(token),
      body: JSON.stringify(updates),
    });

    return handleResponse(response);
  }

  /**
   * Pause a subscription
   */
  static async pauseSubscription(
    subscriptionId: string,
    token: string
  ): Promise<{ message: string }> {
    const response = await fetch(`${API_BASE_URL}/api/strategies/subscriptions/${subscriptionId}/pause`, {
      method: 'POST',
      headers: getAuthHeaders(token),
    });

    return handleResponse(response);
  }

  /**
   * Resume a paused subscription
   */
  static async resumeSubscription(
    subscriptionId: string,
    token: string
  ): Promise<{ message: string }> {
    const response = await fetch(`${API_BASE_URL}/api/strategies/subscriptions/${subscriptionId}/resume`, {
      method: 'POST',
      headers: getAuthHeaders(token),
    });

    return handleResponse(response);
  }

  /**
   * Cancel a subscription
   */
  static async cancelSubscription(
    subscriptionId: string,
    token: string
  ): Promise<{ message: string }> {
    const response = await fetch(`${API_BASE_URL}/api/strategies/subscriptions/${subscriptionId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(token),
    });

    return handleResponse(response);
  }

  /**
   * Get subscription statistics
   */
  static async getSubscriptionStats(
    subscriptionId: string,
    token: string
  ): Promise<{ subscription: Subscription; stats: SubscriptionStats }> {
    const response = await fetch(`${API_BASE_URL}/api/strategies/subscriptions/${subscriptionId}/stats`, {
      method: 'GET',
      headers: getAuthHeaders(token),
    });

    return handleResponse(response);
  }

  /**
   * Get user's subscriptions
   */
  static async getUserSubscriptions(
    token: string
  ): Promise<{ subscriptions: Subscription[] }> {
    const response = await fetch(`${API_BASE_URL}/api/strategies/subscriptions`, {
      method: 'GET',
      headers: getAuthHeaders(token),
    });

    return handleResponse(response);
  }

  /**
   * Get strategy execution statistics
   */
  static async getStrategyStats(
    strategyId: string,
    token: string
  ): Promise<{ strategyId: string; stats: ExecutionStats }> {
    const response = await fetch(`${API_BASE_URL}/api/strategies/${strategyId}/stats`, {
      method: 'GET',
      headers: getAuthHeaders(token),
    });

    return handleResponse(response);
  }

  /**
   * Get user's available balance from broker
   */
  static async getUserBalance(
    token: string
  ): Promise<{ totalAvailable: number; balances: Record<string, unknown>[]; currency: string }> {
    const response = await fetch(`${API_BASE_URL}/api/broker/balance`, {
      method: 'GET',
      headers: getAuthHeaders(token),
    });

    return handleResponse(response);
  }
}

// Export default for convenience
export default StrategyExecutionAPI;

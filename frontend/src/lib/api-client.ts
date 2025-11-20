/**
 * Global API client with NextAuth session integration
 * Uses NextAuth as single source of truth for authentication
 */

import { getSession, signOut } from 'next-auth/react';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public data?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface FetchOptions extends RequestInit {
  skipAuth?: boolean;
}

class ApiClient {
  private isRefreshing = false;
  private refreshPromise: Promise<string | null> | null = null;

  /**
   * Get authentication token from NextAuth session
   */
  private async getAuthToken(): Promise<string | null> {
    try {
      const session = await getSession();
      const token = session?.user?.accessToken as string | undefined;

      if (!token) {
        console.warn('[apiClient] No token found in NextAuth session');
        return null;
      }

      return token;
    } catch (error) {
      console.error('[apiClient] Error getting session:', error);
      return null;
    }
  }

  /**
   * Attempt to refresh the session
   * This triggers NextAuth to fetch a new session from the backend
   */
  private async refreshSession(): Promise<string | null> {
    // Prevent multiple simultaneous refresh attempts
    if (this.isRefreshing && this.refreshPromise) {
      return this.refreshPromise;
    }

    this.isRefreshing = true;
    this.refreshPromise = (async () => {
      try {
        console.log('[apiClient] Attempting to refresh session...');

        // Force NextAuth to refetch the session
        const session = await getSession();

        if (session?.user?.accessToken) {
          console.log('[apiClient] Session refreshed successfully');
          return session.user.accessToken as string;
        }

        console.warn('[apiClient] Session refresh failed - no token in refreshed session');
        return null;
      } catch (error) {
        console.error('[apiClient] Session refresh error:', error);
        return null;
      } finally {
        this.isRefreshing = false;
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  /**
   * Make an authenticated API request with automatic token refresh
   * On 401, attempts to refresh session once before failing
   */
  async request<T = unknown>(
    url: string,
    options: FetchOptions = {},
    isRetry = false
  ): Promise<T> {
    const { skipAuth = false, headers = {}, ...restOptions } = options;

    // Get token from NextAuth session
    const token = skipAuth ? null : await this.getAuthToken();

    // Build headers
    const requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(headers as Record<string, string>),
    };

    // Add authorization header if we have a token
    if (token) {
      requestHeaders['Authorization'] = `Bearer ${token}`;
      console.log(`[apiClient] Request to ${url} with token: ${token.substring(0, 20)}...`);
    } else if (!skipAuth) {
      console.warn(`[apiClient] Request to ${url} WITHOUT token`);
    }

    try {
      const response = await fetch(url, {
        ...restOptions,
        headers: requestHeaders,
      });

      // Handle 401 - Attempt session refresh on first try
      if (response.status === 401 && !isRetry) {
        console.log('[apiClient] 401 Unauthorized - attempting session refresh...');

        const newToken = await this.refreshSession();

        if (newToken) {
          // Retry the request with refreshed token
          console.log('[apiClient] Retrying request with refreshed token');
          return this.request<T>(url, options, true);
        }

        // Refresh failed - throw error without auto-logout
        console.error('[apiClient] Session refresh failed - user needs to re-authenticate');
        throw new ApiError(
          'Your session has expired. Please log in again.',
          401,
          await response.json().catch(() => ({}))
        );
      }

      // If still 401 after retry, session is truly expired - auto logout
      if (response.status === 401 && isRetry) {
        console.error('[apiClient] 401 after retry - session cannot be refreshed. Auto-logging out...');

        // Automatically sign out the user
        await signOut({ redirect: true, callbackUrl: '/login?sessionExpired=true' });

        throw new ApiError(
          'Your session has expired. Please log in again.',
          401,
          await response.json().catch(() => ({}))
        );
      }

      // Handle other error responses
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new ApiError(
          errorData.error || errorData.message || `Request failed with status ${response.status}`,
          response.status,
          errorData
        );
      }

      // Parse and return successful response
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return await response.json();
      }

      // Return response as-is for non-JSON responses
      return await response.text() as T;
    } catch (error) {
      // Re-throw ApiError as-is
      if (error instanceof ApiError) {
        throw error;
      }

      // Wrap other errors
      throw new ApiError(
        error instanceof Error ? error.message : 'Network error',
        0,
        error
      );
    }
  }

  /**
   * GET request
   */
  async get<T = unknown>(url: string, options?: FetchOptions): Promise<T> {
    return this.request<T>(url, { ...options, method: 'GET' });
  }

  /**
   * POST request
   */
  async post<T = unknown>(
    url: string,
    data?: unknown,
    options?: FetchOptions
  ): Promise<T> {
    return this.request<T>(url, {
      ...options,
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  /**
   * PUT request
   */
  async put<T = unknown>(
    url: string,
    data?: unknown,
    options?: FetchOptions
  ): Promise<T> {
    return this.request<T>(url, {
      ...options,
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  /**
   * PATCH request
   */
  async patch<T = unknown>(
    url: string,
    data?: unknown,
    options?: FetchOptions
  ): Promise<T> {
    return this.request<T>(url, {
      ...options,
      method: 'PATCH',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  /**
   * DELETE request
   */
  async delete<T = unknown>(url: string, options?: FetchOptions): Promise<T> {
    return this.request<T>(url, { ...options, method: 'DELETE' });
  }
}

// Export singleton instance
export const apiClient = new ApiClient();

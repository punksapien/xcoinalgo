/**
 * Global API client with automatic 401 handling
 * Automatically logs out user when backend returns 401 Unauthorized
 */

import { useAuth } from './auth';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public data?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface FetchOptions extends RequestInit {
  skipAuth?: boolean;
}

class ApiClient {
  /**
   * Make an authenticated API request
   * Automatically logs out user on 401 responses
   */
  async request<T = any>(
    url: string,
    options: FetchOptions = {}
  ): Promise<T> {
    const { skipAuth = false, headers = {}, ...restOptions } = options;

    // Get token from auth store
    const token = useAuth.getState().token;

    // Build headers
    const requestHeaders: HeadersInit = {
      'Content-Type': 'application/json',
      ...headers,
    };

    // Add authorization header if we have a token and not skipping auth
    if (token && !skipAuth) {
      requestHeaders['Authorization'] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(url, {
        ...restOptions,
        headers: requestHeaders,
      });

      // Handle 401 - User is unauthorized, log them out
      if (response.status === 401) {
        const logout = useAuth.getState().logout;
        await logout();

        // Redirect to login page
        if (typeof window !== 'undefined') {
          window.location.href = '/login';
        }

        throw new ApiError(
          'Session expired. Please log in again.',
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
      return await response.text() as any;
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
  async get<T = any>(url: string, options?: FetchOptions): Promise<T> {
    return this.request<T>(url, { ...options, method: 'GET' });
  }

  /**
   * POST request
   */
  async post<T = any>(
    url: string,
    data?: any,
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
  async put<T = any>(
    url: string,
    data?: any,
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
  async patch<T = any>(
    url: string,
    data?: any,
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
  async delete<T = any>(url: string, options?: FetchOptions): Promise<T> {
    return this.request<T>(url, { ...options, method: 'DELETE' });
  }
}

// Export singleton instance
export const apiClient = new ApiClient();

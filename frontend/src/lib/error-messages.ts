/**
 * Error message mapping and user-friendly error handling utilities
 */

export enum ErrorType {
  NETWORK = 'NETWORK',
  VALIDATION = 'VALIDATION',
  AUTH = 'AUTH',
  BUSINESS_LOGIC = 'BUSINESS_LOGIC',
  UNKNOWN = 'UNKNOWN',
}

export interface UserFriendlyError {
  type: ErrorType;
  title: string;
  message: string;
  actionText?: string;
  actionLink?: string;
}

/**
 * Map of backend error messages to user-friendly errors
 */
const errorMessageMap: Record<string, UserFriendlyError> = {
  // Authentication errors
  'Unauthorized': {
    type: ErrorType.AUTH,
    title: 'Not Authenticated',
    message: 'Your session has expired. Please log in again to continue.',
    actionText: 'Go to Login',
    actionLink: '/login',
  },
  'Token expired or invalid': {
    type: ErrorType.AUTH,
    title: 'Session Expired',
    message: 'Your session has expired. Please log in again.',
    actionText: 'Log In',
    actionLink: '/login',
  },

  // Broker credential errors
  'Broker credentials not found or inactive': {
    type: ErrorType.BUSINESS_LOGIC,
    title: 'Broker Not Connected',
    message: 'Your CoinDCX connection is not set up. Please connect your broker account first.',
    actionText: 'Set Up Broker',
    actionLink: '/dashboard/broker',
  },
  'No CoinDCX credentials found': {
    type: ErrorType.BUSINESS_LOGIC,
    title: 'Broker Not Connected',
    message: 'No CoinDCX credentials found. Please set up your broker connection to continue.',
    actionText: 'Set Up Broker',
    actionLink: '/dashboard/broker',
  },
  'Invalid API credentials': {
    type: ErrorType.VALIDATION,
    title: 'Invalid Credentials',
    message: 'The API credentials you provided are invalid. Please check your API key and secret.',
    actionText: 'Update Credentials',
    actionLink: '/dashboard/broker',
  },

  // Strategy and subscription errors
  'Strategy not found or not active': {
    type: ErrorType.BUSINESS_LOGIC,
    title: 'Strategy Not Available',
    message: 'This strategy is not available or has been disabled. Please choose a different strategy.',
    actionText: 'View Strategies',
    actionLink: '/dashboard/strategies',
  },
  'User .* is already subscribed to strategy': {
    type: ErrorType.BUSINESS_LOGIC,
    title: 'Already Subscribed',
    message: 'You are already subscribed to this strategy. You can manage your subscription from the Subscriptions page.',
    actionText: 'View Subscriptions',
    actionLink: '/dashboard/subscriptions',
  },
  'Missing required fields': {
    type: ErrorType.VALIDATION,
    title: 'Missing Information',
    message: 'Please fill in all required fields before submitting.',
  },
  'Insufficient balance': {
    type: ErrorType.BUSINESS_LOGIC,
    title: 'Insufficient Balance',
    message: 'You don\'t have enough balance in your CoinDCX account for this subscription. Please deposit more funds.',
    actionText: 'Deposit Funds',
    actionLink: 'https://coindcx.com',
  },

  // Network errors
  'Network request failed': {
    type: ErrorType.NETWORK,
    title: 'Connection Error',
    message: 'Unable to connect to the server. Please check your internet connection and try again.',
  },
  'Failed to fetch': {
    type: ErrorType.NETWORK,
    title: 'Connection Error',
    message: 'Unable to reach the server. Please check your internet connection.',
  },

  // Validation errors
  'API Key and API Secret are required': {
    type: ErrorType.VALIDATION,
    title: 'Missing Credentials',
    message: 'Please enter both your API Key and Secret Key.',
  },
  'Strategy ID is required': {
    type: ErrorType.VALIDATION,
    title: 'Invalid Request',
    message: 'Strategy ID is missing. Please try again or contact support if the issue persists.',
  },

  // Deployment errors
  'Cannot delete credentials while you have active bot deployments': {
    type: ErrorType.BUSINESS_LOGIC,
    title: 'Active Deployments',
    message: 'You cannot disconnect your broker while you have active bot deployments. Please stop all bots first.',
    actionText: 'View Deployments',
    actionLink: '/dashboard/subscriptions',
  },
};

/**
 * Get user-friendly error from backend error message
 */
export function getUserFriendlyError(error: string | Error): UserFriendlyError {
  const errorMessage = error instanceof Error ? error.message : error;

  // Try exact match first
  if (errorMessageMap[errorMessage]) {
    return errorMessageMap[errorMessage];
  }

  // Try regex pattern match
  for (const [pattern, friendlyError] of Object.entries(errorMessageMap)) {
    if (new RegExp(pattern, 'i').test(errorMessage)) {
      return friendlyError;
    }
  }

  // Check for common error types
  if (errorMessage.toLowerCase().includes('network') ||
      errorMessage.toLowerCase().includes('connection') ||
      errorMessage.toLowerCase().includes('fetch')) {
    return {
      type: ErrorType.NETWORK,
      title: 'Connection Error',
      message: 'Unable to connect to the server. Please check your internet connection and try again.',
    };
  }

  if (errorMessage.toLowerCase().includes('unauthorized') ||
      errorMessage.toLowerCase().includes('auth') ||
      errorMessage.toLowerCase().includes('token')) {
    return {
      type: ErrorType.AUTH,
      title: 'Authentication Error',
      message: 'Your session has expired. Please log in again.',
      actionText: 'Log In',
      actionLink: '/login',
    };
  }

  if (errorMessage.toLowerCase().includes('balance') ||
      errorMessage.toLowerCase().includes('insufficient funds')) {
    return {
      type: ErrorType.BUSINESS_LOGIC,
      title: 'Insufficient Balance',
      message: 'You don\'t have enough balance in your account for this operation.',
    };
  }

  // Default error
  return {
    type: ErrorType.UNKNOWN,
    title: 'Something Went Wrong',
    message: errorMessage || 'An unexpected error occurred. Please try again or contact support if the issue persists.',
  };
}

/**
 * Format error for display
 */
export function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  if (error && typeof error === 'object' && 'message' in error) {
    return String(error.message);
  }
  return 'An unexpected error occurred';
}

/**
 * Check if error is a network error
 */
export function isNetworkError(error: unknown): boolean {
  const message = formatErrorMessage(error).toLowerCase();
  return message.includes('network') ||
         message.includes('connection') ||
         message.includes('fetch') ||
         message.includes('timeout');
}

/**
 * Check if error is an auth error
 */
export function isAuthError(error: unknown): boolean {
  const message = formatErrorMessage(error).toLowerCase();
  return message.includes('unauthorized') ||
         message.includes('auth') ||
         message.includes('token') ||
         message.includes('session');
}

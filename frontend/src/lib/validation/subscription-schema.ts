import { z } from 'zod';

/**
 * Validation schema for strategy subscription configuration
 */
export const subscriptionConfigSchema = z.object({
  capital: z
    .number({
      required_error: 'Capital is required',
      invalid_type_error: 'Capital must be a number',
    })
    .min(100, 'Minimum capital requirement is $100')
    .max(1000000, 'Maximum capital allowed is $1,000,000')
    .positive('Capital must be positive'),

  riskPerTrade: z
    .number({
      required_error: 'Risk per trade is required',
      invalid_type_error: 'Risk per trade must be a number',
    })
    .min(0.001, 'Minimum risk per trade is 0.1%')
    .max(0.1, 'Maximum risk per trade is 10%')
    .positive('Risk per trade must be positive'),

  leverage: z
    .number({
      invalid_type_error: 'Leverage must be a number',
    })
    .int('Leverage must be a whole number')
    .min(1, 'Minimum leverage is 1x')
    .max(100, 'Maximum leverage is 100x')
    .optional()
    .default(1),

  maxPositions: z
    .number({
      invalid_type_error: 'Max positions must be a number',
    })
    .int('Max positions must be a whole number')
    .min(1, 'At least 1 position is required')
    .max(10, 'Maximum 10 concurrent positions allowed')
    .optional()
    .default(1),

  maxDailyLoss: z
    .number({
      invalid_type_error: 'Max daily loss must be a number',
    })
    .min(0.01, 'Minimum max daily loss is 1%')
    .max(0.2, 'Maximum max daily loss is 20%')
    .optional()
    .default(0.05),

  slAtrMultiplier: z
    .number({
      invalid_type_error: 'Stop loss ATR multiplier must be a number',
    })
    .min(0.5, 'Minimum stop loss ATR multiplier is 0.5')
    .max(10, 'Maximum stop loss ATR multiplier is 10')
    .optional(),

  tpAtrMultiplier: z
    .number({
      invalid_type_error: 'Take profit ATR multiplier must be a number',
    })
    .min(0.5, 'Minimum take profit ATR multiplier is 0.5')
    .max(10, 'Maximum take profit ATR multiplier is 10')
    .optional(),

  brokerCredentialId: z
    .string({
      required_error: 'Broker credential is required',
    })
    .min(1, 'Please select a broker credential'),
});

export type SubscriptionConfig = z.infer<typeof subscriptionConfigSchema>;

/**
 * Validate subscription config and return user-friendly errors
 */
export function validateSubscriptionConfig(data: unknown): {
  success: boolean;
  data?: SubscriptionConfig;
  errors?: Record<string, string>;
} {
  const result = subscriptionConfigSchema.safeParse(data);

  if (result.success) {
    return {
      success: true,
      data: result.data,
    };
  }

  // Transform Zod errors into user-friendly format
  const errors: Record<string, string> = {};
  result.error.errors.forEach((err) => {
    const path = err.path.join('.');
    errors[path] = err.message;
  });

  return {
    success: false,
    errors,
  };
}

/**
 * Check if user has sufficient balance for the requested capital
 */
export function validateSufficientBalance(
  requestedCapital: number,
  availableBalance: number
): {
  isValid: boolean;
  error?: string;
} {
  if (requestedCapital > availableBalance) {
    return {
      isValid: false,
      error: `Insufficient balance. Available: $${availableBalance.toFixed(2)}, Required: $${requestedCapital.toFixed(2)}. Please deposit more funds in your CoinDCX account.`,
    };
  }

  // Check if user is trying to use more than 80% of their balance
  if (requestedCapital > availableBalance * 0.8) {
    return {
      isValid: true, // Still valid, but show warning
      error: `Warning: You're allocating ${((requestedCapital / availableBalance) * 100).toFixed(0)}% of your available balance. Consider keeping some buffer for unexpected market movements.`,
    };
  }

  return {
    isValid: true,
  };
}

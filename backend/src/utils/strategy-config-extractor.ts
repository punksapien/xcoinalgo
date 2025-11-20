/**
 * Utility to extract STRATEGY_CONFIG from Python strategy files
 */

export interface StrategyConfigExtractionResult {
  success: boolean;
  config: any;
  extractedParams: string[];
  error?: string;
}

export function extractStrategyConfig(strategyCode: string): StrategyConfigExtractionResult {
  try {
    // Match STRATEGY_CONFIG = { ... } block
    const configRegex = /STRATEGY_CONFIG\s*=\s*\{([^}]+)\}/s;
    const match = strategyCode.match(configRegex);

    if (!match) {
      return {
        success: false,
        config: {},
        extractedParams: [],
        error: 'STRATEGY_CONFIG not found in Python file'
      };
    }

    const configBlock = match[1];
    const extractedConfig: any = {};
    const extractedParams: string[] = [];

    // Parse each line: "key": value or 'key': value
    const lineRegex = /["']([^"']+)["']\s*:\s*([^,\n]+)/g;
    let lineMatch;

    while ((lineMatch = lineRegex.exec(configBlock)) !== null) {
      const key = lineMatch[1];
      let value = lineMatch[2].trim();

      // Parse value type
      if (value === 'True') {
        extractedConfig[key] = true;
      } else if (value === 'False') {
        extractedConfig[key] = false;
      } else if (value === 'None') {
        extractedConfig[key] = null;
      } else if (!isNaN(Number(value))) {
        extractedConfig[key] = Number(value);
      } else if (value.startsWith('"') || value.startsWith("'")) {
        extractedConfig[key] = value.slice(1, -1); // Remove quotes
      } else {
        // Keep as string if can't parse
        extractedConfig[key] = value;
      }

      extractedParams.push(key);
    }

    return {
      success: true,
      config: extractedConfig,
      extractedParams,
    };
  } catch (error) {
    return {
      success: false,
      config: {},
      extractedParams: [],
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

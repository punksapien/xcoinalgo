export interface Strategy {
  id: string;
  name: string;
  code: string;
  description: string;
  author: string;
  instrument: string;
  tags: string;
  winRate?: number;
  riskReward?: number;
  maxDrawdown?: number;
  roi?: number;
  marginRequired?: number;
  marginCurrency?: string;
  deploymentCount: number;
  subscriberCount?: number;
  isSubscribed?: boolean;
  createdAt: string;
  features?: {
    indicators: string[];
    timeframes: string[];
    riskManagement: string;
    leverage: number;
    riskPerTrade: number;
  };
  timeframes?: string[];
  supportedPairs?: string[];
  // Visibility and access control
  isPublic?: boolean;
  accessStatus?: 'APPROVED' | 'PENDING' | 'REJECTED' | null;
  isOwned?: boolean;
  // Execution configuration
  executionConfig?: {
    minMargin?: number;
    defaultLeverage?: number;
    defaultRiskPerTrade?: number;
  };
}

interface CachedData {
  strategies: Strategy[];
  tags: { tag: string; count: number }[];
  authors: string[];
  lastUpdated: number;
}

interface FilterOptions {
  search?: string;
  tags?: string;
  author?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

class StrategyService {
  private cache: CachedData | null = null;
  private readonly CACHE_DURATION = 10 * 1000; // 10 seconds - hot reload for marketplace
  private searchIndex: Map<string, Set<number>> = new Map();
  private strategies: Strategy[] = [];
  private fetchPromise: Promise<void> | null = null;

  constructor() {
    // Don't initialize synchronously - fetch on demand
  }

  private async initializeData(token?: string) {
    // Prevent multiple simultaneous fetches
    if (this.fetchPromise) {
      return this.fetchPromise;
    }

    this.fetchPromise = this.fetchStrategiesFromAPI(1, 1000, token);
    await this.fetchPromise;
    this.fetchPromise = null;
  }

  private async fetchStrategiesFromAPI(page: number = 1, limit: number = 1000, token?: string) {
    try {
      const headers: HeadersInit = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const response = await fetch(`/api/marketplace?page=${page}&limit=${limit}`, { headers });
      if (!response.ok) {
        console.error('Failed to fetch strategies from API');
        this.strategies = [];
        return;
      }

      const data = await response.json();
      // Map marketplace API response to Strategy interface
      this.strategies = (data.strategies || []).map((s: Record<string, unknown>) => ({
        id: s.id as string,
        name: s.name as string,
        code: s.code as string,
        description: (s.description as string) || (s.detailedDescription as string) || '',
        author: s.author as string,
        instrument: (s.instrument as string) || 'Unknown',
        tags: Array.isArray(s.tags) ? s.tags.join(',') : ((s.tags as string) || ''),
        winRate: s.winRate as number | undefined,
        riskReward: s.riskReward as number | undefined,
        maxDrawdown: s.maxDrawdown as number | undefined,
        roi: s.roi as number | undefined,
        marginRequired: s.marginRequired as number | undefined,
        deploymentCount: (s.subscriberCount as number) || 0,
        subscriberCount: (s.subscriberCount as number) || 0,
        isSubscribed: s.isSubscribed as boolean | undefined,
        createdAt: s.createdAt as string,
        timeframes: (s.timeframes as string[]) || [],
        supportedPairs: (s.supportedPairs as string[]) || [],
        isPublic: s.isPublic as boolean | undefined,
        accessStatus: s.accessStatus as 'APPROVED' | 'PENDING' | 'REJECTED' | null | undefined,
        isOwned: s.isOwned as boolean | undefined,
        executionConfig: s.executionConfig as { minMargin?: number; defaultLeverage?: number; defaultRiskPerTrade?: number } | undefined,
      }));

      this.buildSearchIndex();
      this.updateCache();
    } catch (error) {
      console.error('Error fetching strategies:', error);
      this.strategies = [];
    }
  }

  private buildSearchIndex() {
    this.searchIndex.clear();

    this.strategies.forEach((strategy, index) => {
      // Index all searchable fields
      const searchableText = [
        strategy.name,
        strategy.code,
        strategy.description,
        strategy.author,
        strategy.instrument,
        strategy.tags,
        ...(strategy.features?.indicators || []),
        ...(strategy.features?.timeframes || []),
        strategy.features?.riskManagement || ''
      ].join(' ').toLowerCase();

      // Create word-based index for fast prefix matching
      const words = searchableText.split(/\s+/).filter(word => word.length > 0);

      words.forEach(word => {
        // Index full words
        if (!this.searchIndex.has(word)) {
          this.searchIndex.set(word, new Set());
        }
        this.searchIndex.get(word)!.add(index);

        // Index prefixes for autocomplete-like search
        for (let i = 1; i <= word.length; i++) {
          const prefix = word.substring(0, i);
          if (!this.searchIndex.has(prefix)) {
            this.searchIndex.set(prefix, new Set());
          }
          this.searchIndex.get(prefix)!.add(index);
        }
      });
    });
  }

  private updateCache() {
    const tags = this.calculateTagCounts();
    const authors = this.getUniqueAuthors();

    this.cache = {
      strategies: this.strategies,
      tags,
      authors,
      lastUpdated: Date.now()
    };
  }

  private isCacheValid(): boolean {
    return this.cache !== null &&
           Date.now() - this.cache.lastUpdated < this.CACHE_DURATION;
  }

  private calculateTagCounts(): { tag: string; count: number }[] {
    const tagCounts: { [key: string]: number } = {};

    this.strategies.forEach(strategy => {
      if (strategy.tags && strategy.tags.trim()) {
        const tagsArray = strategy.tags.split(',').map(tag => tag.trim()).filter(tag => tag);
        tagsArray.forEach(tag => {
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        });
      }
    });

    return Object.entries(tagCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 20)
      .map(([tag, count]) => ({ tag, count }));
  }

  private getUniqueAuthors(): string[] {
    const authors = new Set<string>();
    this.strategies.forEach(strategy => {
      if (strategy.author) {
        authors.add(strategy.author);
      }
    });
    return Array.from(authors).sort();
  }

  private fastSearch(searchTerm: string): Set<number> {
    if (!searchTerm || searchTerm.length === 0) {
      return new Set(this.strategies.map((_, index) => index));
    }

    const terms = searchTerm.toLowerCase().split(/\s+/).filter(term => term.length > 0);
    if (terms.length === 0) {
      return new Set(this.strategies.map((_, index) => index));
    }

    // Find intersection of all search terms
    let result: Set<number> | null = null;

    for (const term of terms) {
      const termMatches = this.searchIndex.get(term) || new Set();

      if (result === null) {
        result = new Set(termMatches);
      } else {
        // Intersection with previous results
        result = new Set([...result].filter((index: number) => termMatches.has(index)));
      }

      // Early exit if no matches
      if (result.size === 0) break;
    }

    return result || new Set();
  }

  private filterByTags(indices: Set<number>, tags: string): Set<number> {
    if (!tags || tags.trim() === '') return indices;

    const filterTags = tags.split(',').map(tag => tag.trim()).filter(tag => tag);
    if (filterTags.length === 0) return indices;

    return new Set([...indices].filter(index => {
      const strategy = this.strategies[index];
      if (!strategy.tags) return false;

      const strategyTags = strategy.tags.split(',').map(tag => tag.trim());
      return filterTags.some(filterTag => strategyTags.includes(filterTag));
    }));
  }

  private filterByAuthor(indices: Set<number>, author: string): Set<number> {
    if (!author || author.trim() === '') return indices;

    return new Set([...indices].filter(index => {
      const strategy = this.strategies[index];
      return strategy.author === author;
    }));
  }

  private sortStrategies(strategies: Strategy[], sortBy: string = 'deploymentCount', sortOrder: 'asc' | 'desc' = 'desc'): Strategy[] {
    return strategies.sort((a, b) => {
      let valueA: string | number;
      let valueB: string | number;

      switch (sortBy) {
        case 'name':
          valueA = a.name.toLowerCase();
          valueB = b.name.toLowerCase();
          break;
        case 'winRate':
          valueA = a.winRate || 0;
          valueB = b.winRate || 0;
          break;
        case 'roi':
          valueA = a.roi || 0;
          valueB = b.roi || 0;
          break;
        case 'deploymentCount':
          valueA = a.deploymentCount;
          valueB = b.deploymentCount;
          break;
        case 'createdAt':
          valueA = new Date(a.createdAt).getTime();
          valueB = new Date(b.createdAt).getTime();
          break;
        default:
          valueA = a.deploymentCount;
          valueB = b.deploymentCount;
      }

      if (valueA < valueB) return sortOrder === 'asc' ? -1 : 1;
      if (valueA > valueB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }

  // Public API methods
  async getStrategies(options: FilterOptions = {}, token?: string): Promise<{
    strategies: Strategy[];
    total: number;
  }> {
    // Ensure data is loaded
    if (this.strategies.length === 0 || !this.isCacheValid()) {
      await this.initializeData(token);
    }

    let matchingIndices = this.fastSearch(options.search || '');

    if (options.tags) {
      matchingIndices = this.filterByTags(matchingIndices, options.tags);
    }

    if (options.author) {
      matchingIndices = this.filterByAuthor(matchingIndices, options.author);
    }

    const matchingStrategies = [...matchingIndices].map(index => this.strategies[index]);
    const sortedStrategies = this.sortStrategies(
      matchingStrategies,
      options.sortBy,
      options.sortOrder
    );

    return {
      strategies: sortedStrategies,
      total: sortedStrategies.length
    };
  }

  async getTags(): Promise<{ tags: { tag: string; count: number }[] }> {
    // Ensure data is loaded
    if (this.strategies.length === 0 || !this.isCacheValid()) {
      await this.initializeData();
    }

    return { tags: this.cache!.tags };
  }

  async getAuthors(): Promise<{ authors: string[] }> {
    // Ensure data is loaded
    if (this.strategies.length === 0 || !this.isCacheValid()) {
      await this.initializeData();
    }

    return { authors: this.cache!.authors };
  }

  async getStrategy(id: string): Promise<Strategy | null> {
    // Ensure data is loaded
    if (this.strategies.length === 0) {
      await this.initializeData();
    }

    const strategy = this.strategies.find(s => s.id === id);
    return strategy || null;
  }

  // Force cache invalidation (for manual refresh)
  invalidateCache(): void {
    this.cache = null;
    this.strategies = [];
    this.searchIndex.clear();
  }

  // Performance monitoring
  getSearchIndexSize(): number {
    return this.searchIndex.size;
  }

  getCacheStatus(): { valid: boolean; lastUpdated: number; strategiesCount: number } {
    return {
      valid: this.isCacheValid(),
      lastUpdated: this.cache?.lastUpdated || 0,
      strategiesCount: this.strategies.length
    };
  }
}

// Export singleton instance
export const strategyService = new StrategyService();
export default strategyService;

import { ethers } from 'ethers';

/**
 * RPC Manager - Intelligent RPC node selection and failover
 */
class RPCManager {
  constructor(rpcUrls) {
    this.rpcUrls = rpcUrls;
    this.providers = new Map();
    this.healthScores = new Map();
    this.lastUsed = new Map();
    this.failureCount = new Map();
    this.currentProvider = null;
    this.wsProvider = null;
    
    rpcUrls.forEach(url => {
      this.healthScores.set(url, 100);
      this.failureCount.set(url, 0);
      this.lastUsed.set(url, 0);
    });
  }

  /**
   * Get the best available provider based on health scores
   */
  async getProvider() {
    if (this.currentProvider) {
      try {
        await this.currentProvider.getBlockNumber();
        return this.currentProvider;
      } catch (error) {
        console.warn('Current provider failed, switching...');
        this.recordFailure(this.getCurrentProviderUrl());
      }
    }

    const sortedUrls = this.getSortedProviderUrls();
    
    for (const url of sortedUrls) {
      try {
        const provider = await this.createProvider(url);
        await provider.getBlockNumber();
        
        this.currentProvider = provider;
        this.recordSuccess(url);
        return provider;
      } catch (error) {
        console.warn(`RPC ${url} failed:`, error.message);
        this.recordFailure(url);
        continue;
      }
    }

    throw new Error('All RPC nodes failed. Please check your connection.');
  }

  /**
   * Create or get cached provider
   */
  async createProvider(url) {
    if (this.providers.has(url)) {
      return this.providers.get(url);
    }

    const provider = new ethers.JsonRpcProvider(url);
    this.providers.set(url, provider);
    return provider;
  }

  /**
   * Get WebSocket provider for real-time block updates
   */
  async getWebSocketProvider() {
    if (this.wsProvider) {
      return this.wsProvider;
    }

    // Get WebSocket URLs from environment or use defaults
    const getWsUrls = () => {
      const envWsUrls = process.env.REACT_APP_WS_RPC_URLS;
      if (envWsUrls && envWsUrls.trim()) {
        return envWsUrls.split(',').map(url => url.trim()).filter(url => url);
      }
      return [
        'wss://ethereum-rpc.publicnode.com',
        'wss://eth.llamarpc.com',
      ];
    };

    const wsUrls = getWsUrls();

    for (const url of wsUrls) {
      try {
        const provider = new ethers.WebSocketProvider(url);
        await provider.getBlockNumber();
        this.wsProvider = provider;
        return provider;
      } catch (error) {
        console.warn(`WebSocket ${url} failed:`, error.message);
        continue;
      }
    }

    return null;
  }

  /**
   * Sort provider URLs by health score and last used time
   */
  getSortedProviderUrls() {
    return [...this.rpcUrls].sort((a, b) => {
      const scoreA = this.healthScores.get(a);
      const scoreB = this.healthScores.get(b);
      
      if (scoreA !== scoreB) {
        return scoreB - scoreA;
      }
      
      return this.lastUsed.get(a) - this.lastUsed.get(b);
    });
  }

  /**
   * Record successful request
   */
  recordSuccess(url) {
    const currentScore = this.healthScores.get(url);
    this.healthScores.set(url, Math.min(100, currentScore + 10));
    this.failureCount.set(url, 0);
    this.lastUsed.set(url, Date.now());
  }

  /**
   * Record failed request
   */
  recordFailure(url) {
    const currentScore = this.healthScores.get(url);
    const failures = this.failureCount.get(url) + 1;
    
    this.healthScores.set(url, Math.max(0, currentScore - 20));
    this.failureCount.set(url, failures);
    
    if (failures >= 3) {
      this.healthScores.set(url, 0);
      setTimeout(() => {
        this.healthScores.set(url, 50);
        this.failureCount.set(url, 0);
      }, 5 * 60 * 1000);
    }
  }

  /**
   * Get current provider URL
   */
  getCurrentProviderUrl() {
    if (!this.currentProvider) return null;
    
    for (const [url, provider] of this.providers.entries()) {
      if (provider === this.currentProvider) {
        return url;
      }
    }
    return null;
  }

  /**
   * Get health status of all providers
   */
  getHealthStatus() {
    return Array.from(this.healthScores.entries()).map(([url, score]) => ({
      url,
      score,
      failures: this.failureCount.get(url),
      lastUsed: this.lastUsed.get(url),
    }));
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    if (this.wsProvider) {
      await this.wsProvider.destroy();
      this.wsProvider = null;
    }
    
    for (const provider of this.providers.values()) {
      if (provider.destroy) {
        await provider.destroy();
      }
    }
    
    this.providers.clear();
    this.currentProvider = null;
  }
}

export default RPCManager;

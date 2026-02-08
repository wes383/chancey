import { useState, useEffect, useCallback, useRef } from 'react';
import RPCManager from '../utils/rpcManager';

const DEFAULT_RPC_URLS = [
  'https://1rpc.io/eth',
  'https://ethereum-rpc.publicnode.com',
  'https://rpc.flashbots.net',
  'https://eth.llamarpc.com',
  'https://eth.drpc.org'
];

const getRpcUrls = () => {
  const envUrls = process.env.REACT_APP_RPC_URLS;
  if (envUrls && envUrls.trim()) {
    return envUrls.split(',').map(url => url.trim()).filter(url => url);
  }
  return DEFAULT_RPC_URLS;
};

const RPC_URLS = getRpcUrls();

/**
 * Custom hook for blockchain interactions
 */
export const useBlockchain = () => {
  const [currentBlock, setCurrentBlock] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const rpcManagerRef = useRef(null);
  const wsListenerRef = useRef(null);

  useEffect(() => {
    if (!rpcManagerRef.current) {
      rpcManagerRef.current = new RPCManager(RPC_URLS);
    }

    return () => {
      if (rpcManagerRef.current) {
        rpcManagerRef.current.cleanup();
      }
    };
  }, []);

  const setupWebSocketListener = useCallback(async () => {
    try {
      const wsProvider = await rpcManagerRef.current.getWebSocketProvider();
      
      if (wsProvider) {
        console.log('WebSocket connected - using real-time updates');
        
        const listener = (blockNumber) => {
          setCurrentBlock(blockNumber);
          setIsConnected(true);
        };
        
        wsProvider.on('block', listener);
        wsListenerRef.current = { provider: wsProvider, listener };
        
        const blockNumber = await wsProvider.getBlockNumber();
        setCurrentBlock(blockNumber);
        setIsConnected(true);
        
        return true;
      }
      
      return false;
    } catch (error) {
      console.warn('WebSocket setup failed, falling back to polling:', error.message);
      return false;
    }
  }, []);

  const setupPolling = useCallback(() => {
    const fetchBlockNumber = async () => {
      try {
        const provider = await rpcManagerRef.current.getProvider();
        const blockNumber = await provider.getBlockNumber();
        setCurrentBlock(blockNumber);
        setIsConnected(true);
      } catch (error) {
        console.error('Error fetching block number:', error);
        setIsConnected(false);
      }
    };

    fetchBlockNumber();
    const interval = setInterval(fetchBlockNumber, 12000); // Poll every 12s (Ethereum block time)
    
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let cleanup;
    
    const initialize = async () => {
      const wsConnected = await setupWebSocketListener();
      
      if (!wsConnected) {
        // Fallback to polling
        cleanup = setupPolling();
      }
    };
    
    initialize();
    
    return () => {
      if (wsListenerRef.current) {
        const { provider, listener } = wsListenerRef.current;
        provider.off('block', listener);
        wsListenerRef.current = null;
      }
      
      if (cleanup) {
        cleanup();
      }
    };
  }, [setupWebSocketListener, setupPolling]);

  /**
   * Get provider instance
   */
  const getProvider = useCallback(async () => {
    return await rpcManagerRef.current.getProvider();
  }, []);

  /**
   * Get specific block data
   */
  const getBlock = useCallback(async (blockNumber) => {
    const provider = await getProvider();
    return await provider.getBlock(blockNumber);
  }, [getProvider]);

  /**
   * Wait for specific block with callback
   */
  const waitForBlock = useCallback(async (targetBlock, onProgress) => {
    return new Promise((resolve, reject) => {
      const checkBlock = async () => {
        try {
          const provider = await getProvider();
          const latestBlock = await provider.getBlockNumber();
          
          if (onProgress) {
            onProgress(latestBlock);
          }
          
          if (latestBlock >= targetBlock) {
            const block = await provider.getBlock(targetBlock);
            if (!block) {
              reject(new Error('Could not fetch target block data'));
              return;
            }
            resolve(block);
          } else {
            setTimeout(checkBlock, 3000);
          }
        } catch (error) {
          reject(error);
        }
      };
      
      checkBlock();
    });
  }, [getProvider]);

  /**
   * Get RPC health status
   */
  const getHealthStatus = useCallback(() => {
    return rpcManagerRef.current?.getHealthStatus() || [];
  }, []);

  return {
    currentBlock,
    isConnected,
    getProvider,
    getBlock,
    waitForBlock,
    getHealthStatus,
  };
};

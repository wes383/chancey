import RPCManager from '../rpcManager';

describe('RPCManager', () => {
  let rpcManager;
  const mockUrls = [
    'https://rpc1.example.com',
    'https://rpc2.example.com',
    'https://rpc3.example.com',
  ];

  beforeEach(() => {
    rpcManager = new RPCManager(mockUrls);
  });

  afterEach(async () => {
    await rpcManager.cleanup();
  });

  test('should initialize with correct health scores', () => {
    const healthStatus = rpcManager.getHealthStatus();
    
    expect(healthStatus).toHaveLength(3);
    healthStatus.forEach(status => {
      expect(status.score).toBe(100);
      expect(status.failures).toBe(0);
    });
  });

  test('should record success correctly', () => {
    const url = mockUrls[0];
    
    rpcManager.recordSuccess(url);
    
    const healthStatus = rpcManager.getHealthStatus();
    const status = healthStatus.find(s => s.url === url);
    
    expect(status.score).toBe(100);
    expect(status.failures).toBe(0);
  });

  test('should record failure correctly', () => {
    const url = mockUrls[0];
    
    rpcManager.recordFailure(url);
    
    const healthStatus = rpcManager.getHealthStatus();
    const status = healthStatus.find(s => s.url === url);
    
    expect(status.score).toBe(80); // 100 - 20
    expect(status.failures).toBe(1);
  });

  test('should disable node after 3 failures', () => {
    const url = mockUrls[0];
    
    rpcManager.recordFailure(url);
    rpcManager.recordFailure(url);
    rpcManager.recordFailure(url);
    
    const healthStatus = rpcManager.getHealthStatus();
    const status = healthStatus.find(s => s.url === url);
    
    expect(status.score).toBe(0);
    expect(status.failures).toBe(3);
  });

  test('should sort providers by health score', () => {
    // Lower first provider's score
    rpcManager.recordFailure(mockUrls[0]);
    rpcManager.recordFailure(mockUrls[0]);
    
    const sortedUrls = rpcManager.getSortedProviderUrls();
    
    // First provider should not be first anymore
    expect(sortedUrls[0]).not.toBe(mockUrls[0]);
  });

  test('should reset failure count on success', () => {
    const url = mockUrls[0];
    
    rpcManager.recordFailure(url);
    rpcManager.recordFailure(url);
    
    let healthStatus = rpcManager.getHealthStatus();
    let status = healthStatus.find(s => s.url === url);
    expect(status.failures).toBe(2);
    
    rpcManager.recordSuccess(url);
    
    healthStatus = rpcManager.getHealthStatus();
    status = healthStatus.find(s => s.url === url);
    expect(status.failures).toBe(0);
  });
});

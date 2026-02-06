import { useState, useMemo, useCallback } from 'react';
import { ethers } from 'ethers';
import { useBlockchain } from './hooks/useBlockchain';
import './App.css';

function App() {
  const generateRandomSeed = useCallback(() => {
    return ethers.hexlify(ethers.randomBytes(16));
  }, []);

  const [seed, setSeed] = useState(() => generateRandomSeed());
  const [minValue, setMinValue] = useState('1');
  const [maxValue, setMaxValue] = useState('');
  const [numDraws, setNumDraws] = useState('1');
  const [status, setStatus] = useState('idle');
  const [targetBlock, setTargetBlock] = useState(null);
  const [commit, setCommit] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [blockOffset, setBlockOffset] = useState('3');
  const [blockMode, setBlockMode] = useState('offset');
  const [manualTargetBlock, setManualTargetBlock] = useState('');
  const [showDetails, setShowDetails] = useState(false);

  const FIXED_RULE = "Chancey_v1.0";

  const { currentBlock, isConnected, getProvider, waitForBlock } = useBlockchain();

  const computedTargetBlock = useMemo(() => {
    if (!currentBlock) return null;
    if (blockMode === 'offset') {
      return currentBlock + (parseInt(blockOffset) || 3);
    }
    return parseInt(manualTargetBlock) || null;
  }, [currentBlock, blockMode, blockOffset, manualTargetBlock]);

  const validateInputs = useCallback(() => {
    if (!minValue || minValue.trim() === '') {
      setError("Please enter a minimum value");
      return false;
    }

    if (!maxValue || maxValue.trim() === '') {
      setError("Please enter a maximum value");
      return false;
    }

    const min = parseInt(minValue);
    const max = parseInt(maxValue);

    if (isNaN(min) || isNaN(max)) {
      setError("Min and Max values must be valid numbers");
      return false;
    }

    if (min < 0 || max < 0) {
      setError("Min and Max values cannot be negative");
      return false;
    }

    if (min >= max) {
      setError("Min value must be less than Max value");
      return false;
    }

    const minBigInt = BigInt(min);
    const maxBigInt = BigInt(max);
    const rangeBigInt = maxBigInt - minBigInt + 1n;
    
    const MAX_SAFE_RANGE = 2n ** 128n;
    if (rangeBigInt > MAX_SAFE_RANGE) {
      setError(`Range is too large. Maximum supported range is approximately 3.4e38`);
      return false;
    }

    const draws = parseInt(numDraws);
    if (!numDraws || numDraws.trim() === '' || isNaN(draws)) {
      setError("Please enter a valid number of draws");
      return false;
    }

    if (draws < 1) {
      setError("Number of draws must be at least 1");
      return false;
    }

    if (draws > 1000) {
      setError("Number of draws cannot exceed 1000");
      return false;
    }

    if (!seed || seed.trim() === '') {
      setError("Seed cannot be empty");
      return false;
    }

    if (seed.length > 1000) {
      setError("Seed is too long (max 1000 characters)");
      return false;
    }

    if (blockMode === 'offset') {
      const offset = parseInt(blockOffset);
      if (isNaN(offset) || offset < 2) {
        setError("Block offset must be at least 2");
        return false;
      }
      if (offset > 1000) {
        setError("Block offset cannot exceed 1000 blocks");
        return false;
      }
    } else {
      const target = parseInt(manualTargetBlock);
      if (!manualTargetBlock || isNaN(target)) {
        setError("Please enter a valid target block number");
        return false;
      }
      if (target < 0) {
        setError("Target block number cannot be negative");
        return false;
      }
    }

    return true;
  }, [minValue, maxValue, numDraws, seed, blockMode, blockOffset, manualTargetBlock]);

  const calculateRandomNumbers = useCallback((blockHash, serverSalt, draws, min, max) => {
    const randomValues = [];
    const combinedHashes = [];
    const minBigInt = BigInt(min);
    const maxBigInt = BigInt(max);
    const range = maxBigInt - minBigInt + 1n;

    const MAX_UINT256 = 2n ** 256n;
    
    const limit = MAX_UINT256 - (MAX_UINT256 % range);

    for (let i = 0; i < draws; i++) {
      let randomValue;
      let finalHash;
      let attempt = 0;
      const MAX_ATTEMPTS = 100;
      
      // Rejection sampling: keep trying until we get a value below the limit
      while (attempt < MAX_ATTEMPTS) {
        const combinedHash = ethers.solidityPackedKeccak256(
          ["bytes32", "string", "string", "bytes32", "uint256", "uint256"],
          [blockHash, seed, FIXED_RULE, serverSalt, i, attempt]
        );
        
        const bigNum = BigInt(combinedHash);
        
        if (bigNum < limit) {
          randomValue = (bigNum % range) + minBigInt;
          finalHash = combinedHash;
          break;
        }
        
        attempt++;
      }
      
      // Fallback: if we somehow exceed max attempts (extremely unlikely)
      // Use the last hash but log a warning
      if (attempt >= MAX_ATTEMPTS) {
        console.warn(`Rejection sampling exceeded ${MAX_ATTEMPTS} attempts for draw ${i}. Using fallback.`);
        const fallbackHash = ethers.solidityPackedKeccak256(
          ["bytes32", "string", "string", "bytes32", "uint256", "uint256"],
          [blockHash, seed, FIXED_RULE, serverSalt, i, attempt - 1]
        );
        randomValue = (BigInt(fallbackHash) % range) + minBigInt;
        finalHash = fallbackHash;
      }
      
      randomValues.push(randomValue.toString());
      combinedHashes.push(finalHash);
    }

    return { randomValues, combinedHashes };
  }, [seed, FIXED_RULE]);

  const handleStartRandom = useCallback(async () => {
    setError(null);

    if (!validateInputs()) {
      return;
    }

    let offset;
    let specificTarget;

    if (blockMode === 'offset') {
      offset = parseInt(blockOffset);
    } else {
      specificTarget = parseInt(manualTargetBlock);
    }

    try {
      setStatus('waiting');
      setError(null);
      setResult(null);
      setShowDetails(false);

      // 1. Commit Phase
      const provider = await getProvider();
      const current = await provider.getBlockNumber();
      
      let target;
      if (blockMode === 'offset') {
        target = current + offset;
      } else {
        if (specificTarget < current + 2) {
          setError(`Target block must be at least 2 blocks ahead of current block.`);
          setStatus('idle');
          return;
        }
        target = specificTarget;
      }

      setTargetBlock(target);

      const serverSalt = ethers.hexlify(ethers.randomBytes(32));
      const serverCommit = ethers.keccak256(serverSalt);
      setCommit(serverCommit);

      // 2. Wait for Block using optimized hook
      try {
        const block = await waitForBlock(target, (latestBlock) => {
        });

        // 3. Reveal & Calculate Phase
        const draws = parseInt(numDraws) || 1;
        const { randomValues, combinedHashes } = calculateRandomNumbers(
          block.hash,
          serverSalt,
          draws,
          minValue,
          maxValue
        );

        setResult({
          randomValues,
          serverSalt,
          blockHash: block.hash,
          targetBlock: target,
          combinedHashes,
          minValue,
          maxValue,
          draws,
        });
        setStatus('revealed');
      } catch (err) {
        console.error("Waiting error:", err);
        setError("Error waiting for block: " + err.message);
        setStatus('idle');
      }

    } catch (err) {
      console.error("Start error:", err);
      setError("Failed to start: " + err.message);
      setStatus('idle');
    }
  }, [validateInputs, blockMode, blockOffset, manualTargetBlock, getProvider, waitForBlock, calculateRandomNumbers, numDraws, minValue, maxValue]);

  const handleReset = useCallback(() => {
    setStatus('idle');
    setResult(null);
    setError(null);
  }, []);

  return (
    <div className="App">
      <header className="App-header">
        <h1>Chancey</h1>
        
        {currentBlock !== null && !result && (
          <div className="block-info">
            <p>Current Block: {currentBlock}</p>
            {status === 'idle' && computedTargetBlock && <p>Target Block: {computedTargetBlock}</p>}
            {!isConnected && <p style={{ color: '#ff6b6b' }}>⚠️ Connecting...</p>}
          </div>
        )}

        {status === 'idle' && (
        <div className="input-container">
          <div className="input-group">
            <label>Range (Min - Max):</label>
            <div style={{ display: 'flex', gap: '10px' }}>
              <input
                type="number"
                value={minValue}
                onChange={(e) => {
                  setMinValue(e.target.value);
                  setError(null);
                }}
                placeholder="Min"
                style={{ width: '50%' }}
                min="0"
              />
              <input
                type="number"
                value={maxValue}
                onChange={(e) => {
                  setMaxValue(e.target.value);
                  setError(null);
                }}
                placeholder="Max"
                style={{ width: '50%' }}
                min="1"
              />
            </div>
          </div>

          <div className="input-group">
            <label>Number of Draws:</label>
            <input
              type="number"
              value={numDraws}
              onChange={(e) => {
                setNumDraws(e.target.value);
                setError(null);
              }}
              placeholder="1"
              min="1"
              max="1000"
            />
          </div>

          <div className="advanced-options">
            <div 
              className="advanced-toggle" 
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              Advanced Options
            </div>
            
            {showAdvanced && (
              <div className="advanced-content" style={{ marginTop: '20px' }}>
                <div className="input-group">
                  <label>Your Seed:</label>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <input
                      type="text"
                      value={seed}
                      onChange={(e) => {
                        setSeed(e.target.value);
                        setError(null);
                      }}
                      style={{ flex: 1, width: 'auto' }}
                      maxLength="1000"
                    />
                    <button 
                      onClick={() => setSeed(generateRandomSeed())}
                      style={{
                        padding: '0 20px',
                        borderRadius: '50px',
                        border: '1px solid rgba(0,0,0,0.1)',
                        background: '#fff',
                        cursor: 'pointer',
                        color: '#333',
                        fontSize: '0.9rem',
                        transition: 'all 0.2s',
                        fontFamily: "'Inter', sans-serif"
                      }}
                      title="Generate Random Seed"
                      onMouseOver={(e) => e.target.style.borderColor = '#333'}
                      onMouseOut={(e) => e.target.style.borderColor = 'rgba(0,0,0,0.1)'}
                    >
                      Random
                    </button>
                  </div>
                </div>
                
                <div className="input-group">
                  <label style={{ marginBottom: '10px' }}>Block Selection:</label>
                  <div style={{ display: 'flex', gap: '20px', marginBottom: '15px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontWeight: 'normal', fontSize: '0.9rem' }}>
                      <input 
                        type="radio" 
                        checked={blockMode === 'offset'} 
                        onChange={() => setBlockMode('offset')}
                        style={{ marginRight: '8px', width: 'auto' }}
                      />
                      Relative Offset
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontWeight: 'normal', fontSize: '0.9rem' }}>
                      <input 
                        type="radio" 
                        checked={blockMode === 'specific'} 
                        onChange={() => setBlockMode('specific')}
                        style={{ marginRight: '8px', width: 'auto' }}
                      />
                      Specific Block
                    </label>
                  </div>

                  {blockMode === 'offset' ? (
                    <>
                      <label>Future Block Offset:</label>
                      <input
                        type="number"
                        value={blockOffset}
                        onChange={(e) => {
                          setBlockOffset(e.target.value);
                          setError(null);
                        }}
                        min="2"
                        max="1000"
                      />
                      <small style={{ color: '#666', fontSize: '0.8rem', display: 'block', marginTop: '12px', userSelect: 'none' }}>
                        Number of blocks to wait (higher = longer wait)
                      </small>
                    </>
                  ) : (
                    <>
                      <label>Target Block Number:</label>
                      <input
                        type="number"
                        value={manualTargetBlock}
                        onChange={(e) => {
                          setManualTargetBlock(e.target.value);
                          setError(null);
                        }}
                        min="0"
                      />
                      <small style={{ color: '#666', fontSize: '0.8rem', display: 'block', marginTop: '12px', userSelect: 'none' }}>
                        Manually specify which future block hash to use
                      </small>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
        )}
        
        {result && (
          <div className="final-result-display" style={{ margin: '30px 0', maxWidth: '800px', wordWrap: 'break-word' }}>
            <h1 style={{ 
              fontSize: result.randomValues.length > 1 ? '3rem' : '4rem', 
              margin: 0, 
              color: '#333', 
              lineHeight: 1.2,
              textWrap: 'balance' 
            }}>
              {result.randomValues.join(', ')}
            </h1>
          </div>
        )}

        <div className="button-container">
          <button 
            onClick={status === 'revealed' ? handleReset : handleStartRandom}
            className="start-button"
            disabled={status === 'waiting' || !isConnected}
          >
            {status === 'waiting' ? 'Waiting for Block...' : (status === 'revealed' ? 'Start New Round' : 'Start Random')}
          </button>

          {error && (
            <div className="error-box">
              <strong>⚠️ Validation Error:</strong> {error}
            </div>
          )}
        </div>

        {/* Status & Verification Section */}
        {status === 'waiting' && (
          <div className="status-container">
            <h3>Transaction Status</h3>
            <div className="code-block" style={{ marginTop: '10px', marginBottom: '10px' }}>
              <p><strong>Target Block:</strong> {targetBlock}</p>
              <p><strong>Server Commit (Hash):</strong> {commit}</p>
            </div>
            <p className="pulsing">Waiting for block {targetBlock} to be mined...</p>
          </div>
        )}

        {status === 'revealed' && result && (
          <>
            <div 
              onClick={() => setShowDetails(!showDetails)}
              className="details-toggle"
            >
              Details
            </div>

            {showDetails && (
              <div className="status-container" style={{ marginTop: '15px' }}>
                <h3>Transaction Status</h3>
                <div className="code-block" style={{ marginTop: '10px', marginBottom: '10px' }}>
                  <p><strong>Target Block:</strong> {targetBlock}</p>
                  <p><strong>Server Commit (Hash):</strong> {commit}</p>
                </div>

                <div className="verification-box">
                  <h3 style={{ marginTop: '30px' }}>Verification Data</h3>
                  <p>You can independently verify this result using the following inputs:</p>
                  
                  <div className="code-block">
                    <p><strong>Fixed Rule:</strong> {FIXED_RULE}</p>
                    <p><strong>User Seed:</strong> {seed}</p>
                    <p><strong>Range:</strong> {result.minValue} - {result.maxValue}</p>
                    <p><strong>Server Salt (Revealed):</strong> {result.serverSalt}</p>
                    <p><strong>Target Block Hash:</strong> {result.blockHash}</p>
                    <hr/>
                    <p><strong>Algorithm: </strong>
                    Uses rejection sampling to eliminate modulo bias. For each draw, generates 
                    solidityPackedKeccak256 with types [bytes32, string, string, bytes32, uint256, uint256] 
                    and values [Block Hash, User Seed, Fixed Rule, Server Salt, Index, Attempt]. 
                    Accepts only if the result is below the unbiased limit (2^256 - (2^256 % range)).</p>
                    <p style={{ fontSize: '0.9em', color: '#666', marginTop: '10px' }}>
                    <strong>Parameters:</strong> Index = draw number (0, 1, 2, ...), Attempt = rejection sampling counter starting from 0 for each draw.
                    </p>
                    <p><strong>Results:</strong></p>
                    {result.randomValues.map((val, idx) => (
                      <div key={idx} style={{ marginBottom: '5px' }}>
                        <strong>#{idx + 1}:</strong> {val} <span style={{ color: '#888', fontSize: '0.8em' }}>(Hash: {result.combinedHashes[idx]})</span>
                      </div>
                    ))}
                  </div>
    
                  <p>To verify the Server Salt was determined beforehand:</p>
                  <div className="verify-instructions">
                    <code>keccak256({result.serverSalt}) === {commit}</code>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </header>
    </div>
  );
}

export default App;

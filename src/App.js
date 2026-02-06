import { useState, useMemo, useCallback } from 'react';
import { ethers } from 'ethers';
import { useBlockchain } from './hooks/useBlockchain';
import { Copy, Check } from 'lucide-react';
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
  const [allowDuplicates, setAllowDuplicates] = useState(true);
  const [hoverNoDup, setHoverNoDup] = useState(false);
  const [hoverAllowDup, setHoverAllowDup] = useState(false);
  const [separator, setSeparator] = useState(', ');
  const [copied, setCopied] = useState(false);
  const [sortResults, setSortResults] = useState(false);

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

    const minBigInt = BigInt(min);
    const maxBigInt = BigInt(max);
    const rangeBigInt = maxBigInt - minBigInt + 1n;
    
    const MAX_SAFE_RANGE = 2n ** 128n;
    if (rangeBigInt > MAX_SAFE_RANGE) {
      setError(`Range is too large. Maximum supported range is approximately 3.4e38`);
      return false;
    }

    // Check if unique draws are possible
    if (!allowDuplicates && BigInt(draws) > rangeBigInt) {
      setError(`Cannot draw ${draws} unique numbers from a range of ${rangeBigInt.toString()} values`);
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
  }, [minValue, maxValue, numDraws, seed, blockMode, blockOffset, manualTargetBlock, allowDuplicates]);

  const calculateRandomNumbers = useCallback((blockHash, serverSalt, draws, min, max, noDuplicates) => {
    const randomValues = [];
    const combinedHashes = [];
    const usedValues = new Set();
    const minBigInt = BigInt(min);
    const maxBigInt = BigInt(max);
    const range = maxBigInt - minBigInt + 1n;

    const MAX_UINT256 = 2n ** 256n;
    
    const limit = MAX_UINT256 - (MAX_UINT256 % range);

    for (let i = 0; i < draws; i++) {
      let randomValue;
      let finalHash;
      let attempt = 0;
      const MAX_ATTEMPTS = 1000;
      
      // Rejection sampling: keep trying until we get a valid value
      while (attempt < MAX_ATTEMPTS) {
        const combinedHash = ethers.solidityPackedKeccak256(
          ["bytes32", "string", "string", "bytes32", "uint256", "uint256"],
          [blockHash, seed, FIXED_RULE, serverSalt, i, attempt]
        );
        
        const bigNum = BigInt(combinedHash);
        
        if (bigNum < limit) {
          const candidateValue = (bigNum % range) + minBigInt;
          const valueStr = candidateValue.toString();
          
          // Check for duplicates if needed
          if (!noDuplicates || !usedValues.has(valueStr)) {
            randomValue = candidateValue;
            finalHash = combinedHash;
            if (noDuplicates) {
              usedValues.add(valueStr);
            }
            break;
          }
        }
        
        attempt++;
      }
      
      // Fallback: if we somehow exceed max attempts
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
          maxValue,
          !allowDuplicates
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
  }, [validateInputs, blockMode, blockOffset, manualTargetBlock, getProvider, waitForBlock, calculateRandomNumbers, numDraws, minValue, maxValue, allowDuplicates]);

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

          <div className="input-group">
            <label style={{ marginBottom: '10px' }}>Duplicate Results:</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span 
                onClick={() => {
                  setAllowDuplicates(false);
                  setError(null);
                }}
                onMouseEnter={() => setHoverNoDup(true)}
                onMouseLeave={() => setHoverNoDup(false)}
                style={{ 
                  fontSize: '0.9rem', 
                  color: !allowDuplicates ? '#333' : (hoverNoDup ? '#333' : '#bbb'), 
                  lineHeight: '1', 
                  margin: 0, 
                  padding: 0, 
                  transform: 'translateY(1px)',
                  cursor: 'pointer',
                  userSelect: 'none',
                  transition: 'color 0.2s'
                }}
              >
                No Duplicates
              </span>
              <label style={{ 
                position: 'relative', 
                display: 'block',
                width: '50px', 
                height: '24px',
                cursor: 'pointer',
                flexShrink: 0,
                margin: 0,
                padding: 0
              }}>
                <input 
                  type="checkbox" 
                  checked={allowDuplicates} 
                  onChange={(e) => {
                    setAllowDuplicates(e.target.checked);
                    setError(null);
                  }}
                  style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }}
                />
                <span style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: allowDuplicates ? '#4CAF50' : '#ccc',
                  borderRadius: '24px',
                  transition: '0.3s',
                  cursor: 'pointer'
                }}>
                  <span style={{
                    position: 'absolute',
                    content: '""',
                    height: '18px',
                    width: '18px',
                    left: allowDuplicates ? '29px' : '3px',
                    bottom: '3px',
                    backgroundColor: 'white',
                    borderRadius: '50%',
                    transition: '0.3s'
                  }}></span>
                </span>
              </label>
              <span 
                onClick={() => {
                  setAllowDuplicates(true);
                  setError(null);
                }}
                onMouseEnter={() => setHoverAllowDup(true)}
                onMouseLeave={() => setHoverAllowDup(false)}
                style={{ 
                  fontSize: '0.9rem', 
                  color: allowDuplicates ? '#333' : (hoverAllowDup ? '#333' : '#bbb'), 
                  lineHeight: '1', 
                  margin: 0, 
                  padding: 0, 
                  transform: 'translateY(1px)',
                  cursor: 'pointer',
                  userSelect: 'none',
                  transition: 'color 0.2s'
                }}
              >
                Allow Duplicates
              </span>
            </div>
            <small style={{ color: '#666', fontSize: '0.8rem', display: 'block', marginTop: '12px', userSelect: 'none' }}>
              {allowDuplicates 
                ? 'Same number can appear multiple times' 
                : 'Each number can only appear once'}
            </small>
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
                        border: '1px solid transparent',
                        background: '#fff',
                        cursor: 'pointer',
                        color: '#333',
                        fontSize: '0.9rem',
                        transition: 'all 0.2s',
                        fontFamily: "'Inter', sans-serif",
                        outline: 'none'
                      }}
                      onMouseOver={(e) => {
                        e.target.style.borderColor = 'rgba(76, 175, 80, 0.5)';
                      }}
                      onMouseOut={(e) => {
                        e.target.style.borderColor = 'transparent';
                      }}
                    >
                      Random
                    </button>
                  </div>
                </div>
                
                <div className="input-group">
                  <label style={{ marginBottom: '10px' }}>Block Selection:</label>
                  <div style={{ 
                    position: 'relative',
                    display: 'inline-flex', 
                    backgroundColor: '#ffffff',
                    borderRadius: '24px',
                    padding: '4px',
                    gap: '4px',
                    marginBottom: '15px'
                  }}>
                    <div style={{
                      position: 'absolute',
                      top: '4px',
                      left: blockMode === 'offset' ? '4px' : 'calc(50% + 2px)',
                      width: 'calc(50% - 6px)',
                      height: 'calc(100% - 8px)',
                      backgroundColor: '#4CAF50',
                      borderRadius: '20px',
                      transition: 'left 0.3s ease',
                      pointerEvents: 'none',
                      zIndex: 0
                    }}></div>
                    <button
                      onClick={() => setBlockMode('offset')}
                      style={{
                        position: 'relative',
                        zIndex: 1,
                        padding: '8px 20px',
                        borderRadius: '20px',
                        border: 'none',
                        backgroundColor: 'transparent',
                        color: blockMode === 'offset' ? '#fff' : '#666',
                        fontSize: '0.9rem',
                        cursor: 'pointer',
                        transition: 'color 0.3s',
                        fontFamily: "'Inter', sans-serif",
                        fontWeight: '400',
                        outline: 'none'
                      }}
                    >
                      Relative Offset
                    </button>
                    <button
                      onClick={() => setBlockMode('specific')}
                      style={{
                        position: 'relative',
                        zIndex: 1,
                        padding: '8px 20px',
                        borderRadius: '20px',
                        border: 'none',
                        backgroundColor: 'transparent',
                        color: blockMode === 'specific' ? '#fff' : '#666',
                        fontSize: '0.9rem',
                        cursor: 'pointer',
                        transition: 'color 0.3s',
                        fontFamily: "'Inter', sans-serif",
                        fontWeight: '400',
                        outline: 'none'
                      }}
                    >
                      Specific Block
                    </button>
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
                
                <div className="input-group">
                  <label>Result Separator:</label>
                  <input
                    type="text"
                    value={separator}
                    onChange={(e) => setSeparator(e.target.value)}
                    maxLength="10"
                    style={{ fontFamily: "'Inter', sans-serif" }}
                  />
                  <small style={{ color: '#666', fontSize: '0.8rem', display: 'block', marginTop: '12px', userSelect: 'none' }}>
                    Character(s) to separate multiple results
                  </small>
                </div>
              </div>
            )}
          </div>
        </div>
        )}
        
        {result && (
          <>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '25px', 
              marginTop: '30px',
              marginBottom: '10px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '0.9rem', color: !sortResults ? '#333' : '#bbb', lineHeight: '1', transition: 'color 0.2s' }}>
                  Original
                </span>
                <label style={{ 
                  position: 'relative', 
                  display: 'block',
                  width: '50px', 
                  height: '24px',
                  cursor: 'pointer',
                  flexShrink: 0,
                  margin: 0,
                  padding: 0
                }}>
                  <input 
                    type="checkbox" 
                    checked={sortResults} 
                    onChange={(e) => setSortResults(e.target.checked)}
                    style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }}
                  />
                  <span style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: sortResults ? '#4CAF50' : '#ccc',
                    borderRadius: '24px',
                    transition: '0.3s',
                    cursor: 'pointer'
                  }}>
                    <span style={{
                      position: 'absolute',
                      content: '""',
                      height: '18px',
                      width: '18px',
                      left: sortResults ? '29px' : '3px',
                      bottom: '3px',
                      backgroundColor: 'white',
                      borderRadius: '50%',
                      transition: '0.3s'
                    }}></span>
                  </span>
                </label>
                <span style={{ fontSize: '0.9rem', color: sortResults ? '#333' : '#bbb', lineHeight: '1', transition: 'color 0.2s' }}>
                  Sorted
                </span>
              </div>
              <button
                onClick={() => {
                  const displayValues = sortResults 
                    ? [...result.randomValues].sort((a, b) => Number(a) - Number(b))
                    : result.randomValues;
                  const textToCopy = displayValues.join(separator.replace(/\\n/g, '\n'));
                  navigator.clipboard.writeText(textToCopy);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                style={{
                  background: 'rgba(255, 255, 255, 0.6)',
                  border: '1px solid rgba(255, 255, 255, 0.4)',
                  borderRadius: '50px',
                  cursor: 'pointer',
                  padding: '8px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  color: copied ? '#4CAF50' : '#666',
                  transition: 'all 0.2s',
                  fontSize: '0.9rem',
                  fontFamily: "'Inter', sans-serif",
                  backdropFilter: 'blur(10px)',
                  boxShadow: '0 2px 10px rgba(0,0,0,0.05)'
                }}
                onMouseOver={(e) => {
                  if (!copied) {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.8)';
                    e.currentTarget.style.boxShadow = '0 5px 15px rgba(0, 0, 0, 0.1)';
                  }
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.6)';
                  e.currentTarget.style.boxShadow = '0 2px 10px rgba(0,0,0,0.05)';
                }}
              >
                {copied ? <Check size={18} /> : <Copy size={18} />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <div className="final-result-display" style={{ maxWidth: '800px', wordWrap: 'break-word' }}>
              <h1 style={{ 
                fontSize: result.randomValues.length > 1 ? '3rem' : '4rem', 
                margin: 0, 
                color: '#333', 
                lineHeight: 1.5,
                textWrap: 'balance',
                whiteSpace: 'pre-wrap'
              }}>
                {(() => {
                  const displayValues = sortResults 
                    ? [...result.randomValues].sort((a, b) => Number(a) - Number(b))
                    : result.randomValues;
                  return displayValues.join(separator.replace(/\\n/g, '\n'));
                })()}
              </h1>
            </div>
          </>
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
                    Accepts only if the result is below the unbiased limit (2^256 - (2^256 % range)).
                    {!allowDuplicates && ' Additionally ensures no duplicate values by rejecting already-used numbers.'}</p>
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

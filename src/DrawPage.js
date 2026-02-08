import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getDraw, subscribeToDraw } from './lib/drawApi';
import { useBlockchain } from './hooks/useBlockchain';
import { Copy, Check, ChevronDown } from 'lucide-react';
import './App.css';

function DrawPage() {
  const { drawId } = useParams();
  const navigate = useNavigate();
  const { currentBlock } = useBlockchain();
  
  const [drawData, setDrawData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [sortResults, setSortResults] = useState(false);
  const [resultBoxWidth, setResultBoxWidth] = useState(0);
  
  const resultBoxRef = useRef(null);

  useEffect(() => {
    const loadDraw = async () => {
      try {
        const data = await getDraw(drawId);
        setDrawData(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    loadDraw();

    const unsubscribe = subscribeToDraw(drawId, (updatedData) => {
      setDrawData(updatedData);
    });

    return () => {
      unsubscribe();
    };
  }, [drawId]);

  // Separate effect for polling
  useEffect(() => {
    let pollInterval;
    if (drawData && drawData.status === 'waiting') {
      pollInterval = setInterval(async () => {
        try {
          const data = await getDraw(drawId);
          setDrawData(data);
        } catch (err) {
          console.error('Polling error:', err);
        }
      }, 10000);
    }

    return () => {
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, [drawId, drawData]);

  const handleCopy = () => {
    if (drawData && drawData.status === 'revealed') {
      const displayValues = sortResults 
        ? [...drawData.results].sort((a, b) => Number(a) - Number(b))
        : drawData.results;
      const text = displayValues.join(drawData.separator.replace(/\\n/g, '\n'));
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Measure result box width
  useEffect(() => {
    if (resultBoxRef.current && drawData && drawData.status === 'revealed') {
      const updateWidth = () => {
        const width = resultBoxRef.current.offsetWidth;
        setResultBoxWidth(width);
      };
      
      setTimeout(updateWidth, 0);
      
      const resizeObserver = new ResizeObserver(updateWidth);
      resizeObserver.observe(resultBoxRef.current);
      
      return () => {
        resizeObserver.disconnect();
      };
    }
  }, [drawData, sortResults]);

  if (loading) {
    return (
      <div className="App">
        <header className="App-header">
          <h1>Chancey</h1>
          <p className="pulsing" style={{ fontSize: '0.9rem', fontWeight: 400 }}>Loading...</p>
        </header>
      </div>
    );
  }

  if (error) {
    return (
      <div className="App">
        <header className="App-header">
          <h1>Chancey</h1>
          <div className="error-box" style={{ maxWidth: '450px', marginTop: '20px' }}>
            <strong>⚠️ Error</strong>
            {error}
          </div>
          <button 
            onClick={() => navigate('/')}
            className="start-button"
            style={{ maxWidth: '450px', marginTop: '20px' }}
          >
            Back to Home
          </button>
        </header>
      </div>
    );
  }

  if (!drawData) return null;

  const blocksRemaining = drawData.target_block - (currentBlock || 0);

  // Handle cancelled status
  if (drawData.status === 'cancelled') {
    return (
      <div className="App">
        <header className="App-header">
          <h1>Chancey</h1>
          <div className="status-container" style={{ marginTop: '30px', textAlign: 'center' }}>
            <h3 style={{ textAlign: 'center' }}>Draw Cancelled</h3>
            <p style={{ color: '#666', marginTop: '15px', textAlign: 'center' }}>
              This draw was cancelled by the creator before completion.
            </p>
          </div>
          <div className="button-container">
            <button 
              onClick={() => navigate('/')}
              className="start-button"
              style={{ marginTop: '20px' }}
            >
              Back to Home
            </button>
          </div>
        </header>
      </div>
    );
  }

  return (
    <div className="App">
      <header className="App-header">
        <h1>Chancey</h1>
        
        {currentBlock !== null && drawData.status === 'waiting' && (
          <div className="block-info">
            <p>Current Block: {currentBlock}</p>
          </div>
        )}

        {drawData.status === 'waiting' && (
          <div className="status-container">
            <h3>Transaction Status</h3>
            <div className="code-block" style={{ marginTop: '10px', marginBottom: '10px' }}>
              <p style={{ marginBottom: '5px' }}><strong>User Seed:</strong> {drawData.user_seed}</p>
              <p style={{ marginBottom: '5px' }}><strong>Range:</strong> {drawData.min_value} - {drawData.max_value}</p>
              <p style={{ marginBottom: '5px' }}><strong>Number of Draws:</strong> {drawData.num_draws}</p>
              <p style={{ marginBottom: '5px' }}><strong>Allow Duplicates:</strong> {drawData.allow_duplicates ? 'Yes' : 'No'}</p>
              <p style={{ marginBottom: '5px' }}><strong>Result Separator:</strong> {drawData.separator === ', ' ? 'Comma + Space' : drawData.separator === '\n' ? 'New Line' : `"${drawData.separator}"`}</p>
              <hr/>
              <p style={{ marginBottom: '5px' }}><strong>Target Block:</strong> {drawData.target_block}</p>
              <p style={{ marginBottom: '0' }}><strong>Server Commit (Hash):</strong> {drawData.server_commit}</p>
            </div>
            <p className="pulsing">
              {blocksRemaining > 0 
                ? `Waiting for block ${drawData.target_block} to be mined...` 
                : 'Calculating results...'}
            </p>
          </div>
        )}

        {drawData.status === 'revealed' && (
          <>
            <div style={{ 
              position: 'relative',
              marginTop: '30px',
              marginBottom: '10px',
              width: resultBoxWidth > 0 ? `${resultBoxWidth}px` : 'auto',
              minWidth: '350px'
            }}>
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between',
                width: '100%',
                paddingLeft: '5px',
                paddingRight: '5px',
                boxSizing: 'border-box'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                  <span style={{ fontSize: '0.9rem', color: !sortResults ? '#333' : '#bbb', lineHeight: '1', transition: 'color 0.2s', whiteSpace: 'nowrap' }}>
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
                  <span style={{ fontSize: '0.9rem', color: sortResults ? '#333' : '#bbb', lineHeight: '1', transition: 'color 0.2s', whiteSpace: 'nowrap' }}>
                    Sorted
                  </span>
                </div>
                <button
                  onClick={handleCopy}
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
                    boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
                    flexShrink: 0,
                    whiteSpace: 'nowrap'
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
            </div>
            <div ref={resultBoxRef} className="final-result-display" style={{ maxWidth: '800px', wordWrap: 'break-word', display: 'inline-block' }}>
              <h1 style={{ 
                fontSize: drawData.results.length > 1 ? '3rem' : '4rem', 
                margin: 0, 
                color: '#333', 
                lineHeight: 1.5,
                textWrap: 'balance',
                whiteSpace: 'pre-wrap',
                fontFamily: 'Inter, sans-serif'
              }}>
                {(() => {
                  const displayValues = sortResults 
                    ? [...drawData.results].sort((a, b) => Number(a) - Number(b))
                    : drawData.results;
                  return displayValues.join(drawData.separator.replace(/\\n/g, '\n'));
                })()}
              </h1>
            </div>

          </>
        )}

        <div className="button-container">
          <button 
            onClick={() => navigate('/')}
            className="start-button"
            style={{ marginTop: '20px' }}
          >
            Back to Home
          </button>
        </div>

        {drawData && drawData.status === 'revealed' && (
          <>
            <div 
              onClick={() => setShowDetails(!showDetails)}
              className="details-toggle"
              style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'center' }}
            >
              <ChevronDown 
                size={18} 
                style={{ 
                  transform: showDetails ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.3s',
                  position: 'relative',
                  top: '1px'
                }} 
              />
              Details
            </div>

            {showDetails && (
              <div className="status-container" style={{ marginTop: '15px' }}>
                <h3>Transaction Status</h3>
                <div className="code-block" style={{ marginTop: '10px', marginBottom: '10px' }}>
                  <p><strong>Target Block:</strong> {drawData.target_block}</p>
                  <p><strong>Server Commit (Hash):</strong> {drawData.server_commit}</p>
                </div>

                <div className="verification-box">
                  <h3 style={{ marginTop: '30px' }}>Verification Data</h3>
                  <p>You can independently verify this result using the following inputs:</p>
                  
                  <div className="code-block">
                    <p><strong>Fixed Rule:</strong> Chancey_v1.0</p>
                    <p><strong>User Seed:</strong> {drawData.user_seed}</p>
                    <p><strong>Range:</strong> {drawData.min_value} - {drawData.max_value}</p>
                    <p><strong>Server Salt (Revealed):</strong> {drawData.server_salt}</p>
                    <p><strong>Target Block Hash:</strong> {drawData.block_hash}</p>
                    <hr/>
                    <p><strong>Algorithm: </strong>
                    Uses rejection sampling to eliminate modulo bias. For each draw, generates 
                    solidityPackedKeccak256 with types [bytes32, string, string, bytes32, uint256, uint256] 
                    and values [Block Hash, User Seed, Fixed Rule, Server Salt, Index, Attempt]. 
                    Accepts only if the result is below the unbiased limit (2^256 - (2^256 % range)).
                    {!drawData.allow_duplicates && ' Additionally ensures no duplicate values by rejecting already-used numbers.'}</p>
                    <p style={{ fontSize: '0.9em', color: '#666', marginTop: '10px' }}>
                    <strong>Parameters:</strong> Index = draw number (0, 1, 2, ...), Attempt = rejection sampling counter starting from 0 for each draw.
                    </p>
                    <p><strong>Results:</strong></p>
                    {drawData.results.map((val, idx) => (
                      <div key={idx} style={{ marginBottom: '5px' }}>
                        <strong>#{idx + 1}:</strong> {val} <span style={{ color: '#888', fontSize: '0.8em' }}>(Hash: {drawData.combined_hashes[idx]})</span>
                      </div>
                    ))}
                  </div>
    
                  <p>To verify the Server Salt was determined beforehand:</p>
                  <div className="verify-instructions">
                    <code>keccak256({drawData.server_salt}) === {drawData.server_commit}</code>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </header>
      
      {/* GitHub Link */}
      <a
        href="https://github.com/wes383/chancey"
        target="_blank"
        rel="noopener noreferrer"
        style={{
          position: 'fixed',
          bottom: '16px',
          right: '24px',
          width: '32px',
          height: '32px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'opacity 0.3s ease',
          zIndex: 1000,
          opacity: 0.6
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.opacity = '1';
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.opacity = '0.6';
        }}
        aria-label="View source on GitHub"
      >
        <svg
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#333"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path>
        </svg>
      </a>
    </div>
  );
}

export default DrawPage;

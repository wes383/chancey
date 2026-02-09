import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { ethers } from 'ethers';
import { useBlockchain } from './hooks/useBlockchain';
import { Copy, Check, Share2, ChevronDown } from 'lucide-react';
import { createDraw, revealDraw, cancelDraw, getDraw } from './lib/drawApi';
import { sanitizeNumber, sanitizeSeparator, sanitizeSeed, sanitizeBlockNumber } from './utils/sanitize';
import './App.css';

const STORAGE_KEY = 'chancey_state';

function App() {
  const generateRandomSeed = useCallback(() => {
    return ethers.hexlify(ethers.randomBytes(16));
  }, []);

  // Load state from localStorage
  const loadState = useCallback(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (error) {
      console.error('Failed to load state:', error);
    }
    return null;
  }, []);

  const savedState = loadState();

  const [seed, setSeed] = useState(() => savedState?.seed || generateRandomSeed());
  const [minValue, setMinValue] = useState(savedState?.minValue || '1');
  const [maxValue, setMaxValue] = useState(savedState?.maxValue || '');
  const [numDraws, setNumDraws] = useState(savedState?.numDraws || '1');
  const [status, setStatus] = useState(savedState?.status || 'idle');
  const [targetBlock, setTargetBlock] = useState(savedState?.targetBlock || null);
  const [commit, setCommit] = useState(savedState?.commit || null);
  const [result, setResult] = useState(savedState?.result || null);
  const [error, setError] = useState(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [blockOffset, setBlockOffset] = useState(savedState?.blockOffset || '3');
  const [blockMode, setBlockMode] = useState(savedState?.blockMode || 'offset');
  const [manualTargetBlock, setManualTargetBlock] = useState(savedState?.manualTargetBlock || '');
  const [showDetails, setShowDetails] = useState(false);
  const [allowDuplicates, setAllowDuplicates] = useState(savedState?.allowDuplicates ?? true);
  const [hoverNoDup, setHoverNoDup] = useState(false);
  const [hoverAllowDup, setHoverAllowDup] = useState(false);
  const [separator, setSeparator] = useState(savedState?.separator || ', ');
  const [copied, setCopied] = useState(false);
  const [sortResults, setSortResults] = useState(false);
  const [serverSalt, setServerSalt] = useState(savedState?.serverSalt || null);
  const [cancelWaiting, setCancelWaiting] = useState(false);
  const [cancelClickCount, setCancelClickCount] = useState(0);
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelFailed, setCancelFailed] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);
  const [resultBoxWidth, setResultBoxWidth] = useState(0);
  const [titleItalic, setTitleItalic] = useState(false);
  const [titleWeight, setTitleWeight] = useState(500);
  const [titleColor, setTitleColor] = useState('#333');
  const [titleFont, setTitleFont] = useState('Google Sans');
  const [titleVisible, setTitleVisible] = useState(true);
  const [drawId, setDrawId] = useState(savedState?.drawId || null);
  const [shareUrl, setShareUrl] = useState(savedState?.shareUrl || null);
  const [shareUrlCopied, setShareUrlCopied] = useState(false);
  const [shareButtonCopied, setShareButtonCopied] = useState(false);
  
  const resultBoxRef = useRef(null);
  const cancelRef = useRef(false);
  const errorTimeoutRef = useRef(null);
  const cancelConfirmTimeoutRef = useRef(null);

  const FIXED_RULE = "Chancey_v1.0";

  const handleTitleClick = useCallback(() => {
    // Hide title immediately
    setTitleVisible(false);
    
    const fontConfig = {
      'Google Sans': { weights: [400, 500, 600, 700], italic: true },
      'Quicksand': { weights: [300, 400, 500, 600, 700], italic: false },
      'Montserrat': { weights: [100, 200, 300, 400, 500, 600, 700, 800, 900], italic: true },
      'Playpen Sans': { weights: [100, 200, 300, 400, 500, 600, 700, 800], italic: false },
      'Doto': { weights: [100, 200, 300, 400, 500, 600, 700, 800, 900], italic: false },
      'Playwrite CU': { weights: [100, 200, 300, 400], italic: false },
      'Lora': { weights: [400, 500, 600, 700], italic: true },
      'Oswald': { weights: [200, 300, 400, 500, 600, 700], italic: false }
    };
    
    const fonts = Object.keys(fontConfig);
    const randomFont = fonts[Math.floor(Math.random() * fonts.length)];
    
    const config = fontConfig[randomFont];
    const randomWeight = config.weights[Math.floor(Math.random() * config.weights.length)];
    
    const canBeItalic = config.italic;
    const isItalic = canBeItalic && Math.random() < 0.5;
    
    const colors = [
      '#060', '#360', '#660', '#960', '#C60', '#F60',
      '#063', '#363', '#663', '#963', '#C63', '#F63',
      '#066', '#366', '#666', '#966', '#C66', '#F66',
      '#069', '#369', '#669', '#969', '#C69', '#F69',
      '#06C', '#36C', '#66C', '#96C', '#C6C', '#F6C',
      '#06F', '#36F', '#66F', '#96F', '#C6F', '#F6F',
      '#090', '#390', '#690', '#990', '#C90', '#F90',
      '#093', '#393', '#693', '#993', '#C93', '#F93',
      '#096', '#396', '#696', '#996', '#C96', '#F96',
      '#099', '#399', '#699', '#999', '#C99', '#F99',
      '#09C', '#39C', '#69C', '#99C', '#C9C', '#F9C',
      '#09F', '#39F', '#69F', '#99F', '#C9F', '#F9F',
      '#0C0', '#3C0', '#6C0', '#9C0', '#CC0', '#FC0',
      '#0C3', '#3C3', '#6C3', '#9C3', '#CC3', '#FC3',
      '#0C6', '#3C6', '#6C6', '#9C6', '#CC6', '#FC6',
      '#0C9', '#3C9', '#6C9', '#9C9', '#CC9', '#FC9',
      '#0CC', '#3CC', '#6CC', '#9CC', '#CCC', '#FCC',
      '#0CF', '#3CF', '#6CF', '#9CF', '#CCF', '#FCF'
    ];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    
    let finalColor = randomColor;
    if (randomWeight >= 600 && Math.random() < 0.5) {
      const gradients = [
        'linear-gradient(135deg, #ff9a9e 0%, #fad0c4 100%)',
        'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
        'linear-gradient(135deg, #fad0c4 0%, #ffd1ff 100%)',
        'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)',
        'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)',
        'linear-gradient(135deg, #f6d365 0%, #fda085 100%)',
        'linear-gradient(135deg, #fbc2eb 0%, #a6c1ee 100%)',
        'linear-gradient(135deg, #fdcbf1 0%, #e6dee9 100%)',
        'linear-gradient(135deg, #a1c4fd 0%, #c2e9fb 100%)',
        'linear-gradient(135deg, #d4fc79 0%, #96e6a1 100%)',
        'linear-gradient(135deg, #84fab0 0%, #8fd3f4 100%)',
        'linear-gradient(135deg, #a6c0fe 0%, #f68084 100%)',
        'linear-gradient(135deg, #fccb90 0%, #d57eeb 100%)',
        'linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 100%)',
        'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
        'linear-gradient(135deg, #7cf7ff 0%, #4b73ff 100%)',
        'linear-gradient(135deg, #ffed46 0%, #ff7ec7 100%)',
        'linear-gradient(135deg, #8fff85 0%, #39a0ff 100%)',
        'linear-gradient(135deg, #8a88fb 0%, #d079ee 100%)',
        'linear-gradient(135deg, #ffbb89 0%, #7b6ae0 100%)',
        'linear-gradient(135deg, #4def8e 0%, #e0ca02 100%)',
        'linear-gradient(135deg, #fc4504 0%, #a2fbbb 100%)',
        'linear-gradient(135deg, #24cfc5 0%, #001c63 100%)',
        'linear-gradient(135deg, #5ee2ff 0%, #00576a 100%)',
        'linear-gradient(135deg, #b7dcff 0%, #ffa4f6 100%)',
        'linear-gradient(135deg, #97e8b5 0%, #5cb67f 100%)',
        'linear-gradient(135deg, #ffdc99 0%, #ff62c0 100%)',
        'linear-gradient(135deg, #dde4ff 0%, #8da2ee 100%)',
        'linear-gradient(135deg, #ffe70b 0%, #27b643 100%)',
        'linear-gradient(135deg, #ffc328 0%, #e20000 100%)',
        'linear-gradient(135deg, #ff5eef 0%, #456eff 100%)',
        'linear-gradient(135deg, #4063bc 0%, #6b0013 100%)',
        'linear-gradient(135deg, #afcccb 0%, #616566 100%)',
        'linear-gradient(135deg, #ffe6a4 0%, #ad8211 100%)',
        'linear-gradient(135deg, #c5edf5 0%, #4a879a 100%)',
        'linear-gradient(135deg, #ffd439 0%, #ff7a00 100%)',
        'linear-gradient(135deg, #3793ff 0%, #0017e4 100%)',
        'linear-gradient(135deg, #a531dc 0%, #4300b1 100%)',
        'linear-gradient(135deg, #ffeb3a 0%, #4def8e 100%)',
        'linear-gradient(135deg, #dd7bff 0%, #ff6c6c 100%)',
        'linear-gradient(135deg, #5d85a6 0%, #0e2c5e 100%)',
        'linear-gradient(135deg, #24cfc5 0%, #001c63 100%)',
        'linear-gradient(135deg, #ff5e98 0%, #0f213e 100%)',
        'linear-gradient(135deg, #fff500 0%, #ffb800 100%)',
        'linear-gradient(135deg, #e0ff87 0%, #8fb85b 100%)',
        'linear-gradient(135deg, #b7dcff 0%, #ffa4f6 100%)',
        'linear-gradient(135deg, #ff8570 0%, #418cb7 100%)',
        'linear-gradient(135deg, #b9a14c 0%, #000000 100%)'
      ];
      finalColor = gradients[Math.floor(Math.random() * gradients.length)];
    }
    
    const fontStyle = isItalic ? 'italic' : 'normal';
    const fontString = `${fontStyle} ${randomWeight} 3rem "${randomFont}"`;
    
    document.fonts.load(fontString).then(() => {
      setTitleFont(randomFont);
      setTitleWeight(randomWeight);
      setTitleItalic(isItalic);
      setTitleColor(finalColor);
      setTitleVisible(true);
    }).catch(() => {
      setTitleFont(randomFont);
      setTitleWeight(randomWeight);
      setTitleItalic(isItalic);
      setTitleColor(finalColor);
      setTimeout(() => setTitleVisible(true), 200);
    });
  }, []);

  // Save state to localStorage
  useEffect(() => {
    const stateToSave = {
      seed,
      minValue,
      maxValue,
      numDraws,
      status,
      targetBlock,
      commit,
      result,
      blockOffset,
      blockMode,
      manualTargetBlock,
      allowDuplicates,
      separator,
      serverSalt,
      drawId,
      shareUrl,
    };
    
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
    } catch (error) {
      console.error('Failed to save state:', error);
    }
  }, [seed, minValue, maxValue, numDraws, status, targetBlock, commit, result, 
      blockOffset, blockMode, manualTargetBlock, allowDuplicates, separator, serverSalt, drawId, shareUrl]);

  // Measure result box width
  useEffect(() => {
    if (resultBoxRef.current) {
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
  }, [result, sortResults, separator]);

  const { currentBlock, isConnected, getProvider, waitForBlock } = useBlockchain();

  // Resume waiting if page was refreshed during waiting
  useEffect(() => {
    if (status === 'waiting' && targetBlock && commit && drawId && !cancelWaiting) {
      const resumeWaiting = async () => {
        try {
          const drawData = await getDraw(drawId);
          
          // If already revealed, just display the results
          if (drawData.status === 'revealed') {
            setServerSalt(drawData.server_salt);
            setError(null);
            setCancelFailed(false);
            if (errorTimeoutRef.current) {
              clearTimeout(errorTimeoutRef.current);
              errorTimeoutRef.current = null;
            }
            setResult({
              randomValues: drawData.results,
              serverSalt: drawData.server_salt,
              blockHash: drawData.block_hash,
              targetBlock: drawData.target_block,
              combinedHashes: drawData.combined_hashes,
              minValue: drawData.min_value,
              maxValue: drawData.max_value,
              draws: drawData.num_draws,
            });
            setStatus('revealed');
            return;
          }
          
          // If cancelled, reset to idle
          if (drawData.status === 'cancelled') {
            setStatus('idle');
            setError('This draw was cancelled');
            return;
          }
          
          // Otherwise, continue with normal waiting logic
          const provider = await getProvider();
          const current = await provider.getBlockNumber();
          
          // Check if target block already passed
          if (current >= targetBlock) {
            const block = await provider.getBlock(targetBlock);
            if (block && !cancelRef.current) {
              setIsCalculating(true);
              
              // Call reveal-draw to get results from server
              try {
                const revealResult = await revealDraw(drawId, {
                  blockHash: block.hash
                });
                
                if (!revealResult.success) {
                  throw new Error('Failed to reveal draw');
                }
                
                setServerSalt(revealResult.serverSalt);
                
                if (!cancelRef.current) {
                  setError(null);
                  setCancelFailed(false);
                  if (errorTimeoutRef.current) {
                    clearTimeout(errorTimeoutRef.current);
                    errorTimeoutRef.current = null;
                  }
                  
                  setResult({
                    randomValues: revealResult.randomValues,
                    serverSalt: revealResult.serverSalt,
                    blockHash: block.hash,
                    targetBlock: targetBlock,
                    combinedHashes: revealResult.combinedHashes,
                    minValue,
                    maxValue,
                    draws: parseInt(numDraws) || 1,
                  });
                  setIsCalculating(false);
                  setStatus('revealed');
                }
              } catch (err) {
                console.error("Resume reveal error:", err);
                setError("Failed to reveal: " + err.message);
                setStatus('idle');
                setIsCalculating(false);
              }
            }
          } else {
            // Continue waiting
            const block = await waitForBlock(targetBlock, (latestBlock) => {
              if (cancelRef.current) {
                throw new Error('Cancelled by user');
              }
              if (latestBlock >= targetBlock) {
                setIsCalculating(true);
              }
            });

            if (!cancelRef.current) {
              setIsCalculating(true);
              
              // Call reveal-draw to get results from server
              try {
                const revealResult = await revealDraw(drawId, {
                  blockHash: block.hash
                });
                
                if (!revealResult.success) {
                  throw new Error('Failed to reveal draw');
                }
                
                setServerSalt(revealResult.serverSalt);
                
                if (!cancelRef.current) {
                  // Clear error when result appears
                  setError(null);
                  setCancelFailed(false);
                  if (errorTimeoutRef.current) {
                    clearTimeout(errorTimeoutRef.current);
                    errorTimeoutRef.current = null;
                  }
                  
                  setResult({
                    randomValues: revealResult.randomValues,
                    serverSalt: revealResult.serverSalt,
                    blockHash: block.hash,
                    targetBlock: targetBlock,
                    combinedHashes: revealResult.combinedHashes,
                    minValue,
                    maxValue,
                    draws: parseInt(numDraws) || 1,
                  });
                  setIsCalculating(false);
                  setStatus('revealed');
                }
              } catch (err) {
                console.error("Resume reveal error:", err);
                setError("Failed to reveal: " + err.message);
                setStatus('idle');
                setIsCalculating(false);
              }
            }
          }
        } catch (err) {
          if (err.message !== 'Cancelled by user') {
            console.error("Resume waiting error:", err);
            setError("Failed to resume: " + err.message);
          }
          setStatus('idle');
        }
      };

      resumeWaiting();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

      // Create share link (server will generate serverSalt and serverCommit)
      let createdDrawId = null;
      try {
        const response = await createDraw({
          userSeed: seed,
          minValue: parseInt(minValue),
          maxValue: parseInt(maxValue),
          numDraws: parseInt(numDraws),
          allowDuplicates,
          separator,
          targetBlock: target
        });
        createdDrawId = response.drawId;
        setDrawId(response.drawId);
        setShareUrl(response.url);
        setCommit(response.serverCommit);
        // Do NOT set serverSalt here - it will be fetched after block arrives
      } catch (err) {
        console.error('�?Failed to create share link:', err);
        setError("Failed to create draw: " + err.message);
        setStatus('idle');
        return;
      }

      // 2. Wait for Block using optimized hook
      try {
        setCancelWaiting(false);
        cancelRef.current = false;
        const block = await waitForBlock(target, (latestBlock) => {
          if (cancelRef.current) {
            throw new Error('Cancelled by user');
          }
          if (latestBlock >= target) {
            setIsCalculating(true);
          }
        });

        if (cancelRef.current) {
          setStatus('idle');
          setIsCalculating(false);
          return;
        }

        // 3. Call reveal-draw to calculate results on server
        setIsCalculating(true);
        
        if (cancelRef.current) {
          setStatus('idle');
          setIsCalculating(false);
          return;
        }

        // Call Edge Function to reveal and calculate
        const revealResult = await revealDraw(createdDrawId, {
          blockHash: block.hash
        });
        
        if (!revealResult.success) {
          throw new Error('Failed to reveal draw');
        }
        
        setServerSalt(revealResult.serverSalt);
        
        if (cancelRef.current) {
          setStatus('idle');
          setIsCalculating(false);
          return;
        }

        // Clear error when result appears

        setError(null);

        setCancelFailed(false);
        if (errorTimeoutRef.current) {
          clearTimeout(errorTimeoutRef.current);
          errorTimeoutRef.current = null;
        }

        setResult({
          randomValues: revealResult.randomValues,
          serverSalt: revealResult.serverSalt,
          blockHash: block.hash,
          targetBlock: target,
          combinedHashes: revealResult.combinedHashes,
          minValue,
          maxValue,
          draws: parseInt(numDraws) || 1,
        });
        setIsCalculating(false);
        setStatus('revealed');
      } catch (err) {
        if (err.message !== 'Cancelled by user') {
          console.error("Waiting error:", err);
          setError("Error waiting for block: " + err.message);
        }
        setStatus('idle');
        setIsCalculating(false);
      }

    } catch (err) {
      console.error("Start error:", err);
      setError("Failed to start: " + err.message);
      setStatus('idle');
    }
  }, [validateInputs, blockMode, blockOffset, manualTargetBlock, getProvider, waitForBlock, numDraws, minValue, maxValue, allowDuplicates, seed, separator]);

  const handleCancel = useCallback(async () => {
    if (cancelFailed) {
      if (cancelClickCount === 0) {
        setCancelClickCount(1);
        
        if (cancelConfirmTimeoutRef.current) {
          clearTimeout(cancelConfirmTimeoutRef.current);
        }
        cancelConfirmTimeoutRef.current = setTimeout(() => {
          setCancelClickCount(0);
          cancelConfirmTimeoutRef.current = null;
        }, 4000);
      } else {
        setCancelWaiting(true);
        cancelRef.current = true;
        setStatus('idle');
        setResult(null);
        setError(null);
        setServerSalt(null);
        setTargetBlock(null);
        setCommit(null);
        setDrawId(null);
        setShareUrl(null);
        setShareUrlCopied(false);
        setIsCancelling(false);
        setCancelFailed(false);
        setCancelClickCount(0);
        
        if (cancelConfirmTimeoutRef.current) {
          clearTimeout(cancelConfirmTimeoutRef.current);
          cancelConfirmTimeoutRef.current = null;
        }
        
        try {
          localStorage.removeItem(STORAGE_KEY);
        } catch (error) {
          console.error('Failed to clear state:', error);
        }
      }
      return;
    }
    
    if (cancelClickCount === 0) {
      setCancelClickCount(1);
      
      if (cancelConfirmTimeoutRef.current) {
        clearTimeout(cancelConfirmTimeoutRef.current);
      }
      cancelConfirmTimeoutRef.current = setTimeout(() => {
        setCancelClickCount(0);
        cancelConfirmTimeoutRef.current = null;
      }, 4000);
    } else {
      if (cancelConfirmTimeoutRef.current) {
        clearTimeout(cancelConfirmTimeoutRef.current);
        cancelConfirmTimeoutRef.current = null;
      }
      
      setIsCancelling(true);
      setCancelClickCount(0);
      
      // Cancel draw in database if it exists
      if (drawId) {
        try {
          await cancelDraw(drawId);
        } catch (err) {
          console.error('�?Failed to cancel draw in database:', err);
          setError(`Failed to cancel: ${err.message}. The draw may still be active on the server.`);
          
          if (errorTimeoutRef.current) {
            clearTimeout(errorTimeoutRef.current);
          }
          errorTimeoutRef.current = setTimeout(() => {
            setError(null);
            errorTimeoutRef.current = null;
          }, 8000);
          
          setIsCancelling(false);
          setCancelClickCount(0);
          setCancelFailed(true);
          return;
        }
      }
      
      setCancelWaiting(true);
      cancelRef.current = true;
      
      setStatus('idle');
      setResult(null);
      setError(null);
      setServerSalt(null);
      setTargetBlock(null);
      setCommit(null);
      setDrawId(null);
      setShareUrl(null);
      setShareUrlCopied(false);
      setIsCancelling(false);
      
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch (error) {
        console.error('Failed to clear state:', error);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cancelClickCount, drawId]);

  const handleReset = useCallback(() => {
    setStatus('idle');
    setResult(null);
    setError(null);
    setServerSalt(null);
    setTargetBlock(null);
    setCommit(null);
    setCancelWaiting(false);
    cancelRef.current = false; // Reset cancel flag
    setDrawId(null);
    setShareUrl(null);
    setShareUrlCopied(false);
    
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.error('Failed to clear state:', error);
    }
  }, []);

  return (
    <div className="App">
      <header className="App-header">
        <h1 
          onClick={handleTitleClick}
          style={{ 
            fontFamily: titleFont,
            fontStyle: titleItalic ? 'italic' : 'normal',
            fontWeight: titleWeight,
            ...(titleColor && titleColor.startsWith('linear-gradient') ? {
              backgroundImage: titleColor.replace('linear-gradient', 'linear-gradient'),
              backgroundClip: 'text',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              color: 'transparent'
            } : {
              color: titleColor || '#333'
            }),
            cursor: 'pointer',
            userSelect: 'none',
            opacity: titleVisible ? 1 : 0,
            transition: 'opacity 0.15s',
            minHeight: '1.5em',
            lineHeight: '1.2',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 0.2em'
          }}
        >
          Chancey
        </h1>
        
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
                  const sanitized = sanitizeNumber(e.target.value, { min: 0, allowNegative: false });
                  setMinValue(sanitized);
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
                  const sanitized = sanitizeNumber(e.target.value, { min: 1, allowNegative: false });
                  setMaxValue(sanitized);
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
                const sanitized = sanitizeNumber(e.target.value, { min: 1, max: 1000, allowNegative: false });
                setNumDraws(sanitized);
                setError(null);
              }}
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
              style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'center' }}
            >
              <ChevronDown 
                size={18} 
                style={{ 
                  transform: showAdvanced ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.3s',
                  position: 'relative',
                  top: '1px'
                }} 
              />
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
                        const sanitized = sanitizeSeed(e.target.value);
                        setSeed(sanitized);
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
                          const sanitized = sanitizeNumber(e.target.value, { min: 2, max: 1000, allowNegative: false });
                          setBlockOffset(sanitized);
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
                          const sanitized = sanitizeBlockNumber(e.target.value);
                          setManualTargetBlock(sanitized);
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
                    onChange={(e) => {
                      const sanitized = sanitizeSeparator(e.target.value);
                      setSeparator(sanitized);
                    }}
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
              position: 'relative',
              marginTop: '30px',
              marginBottom: '10px',
              width: resultBoxWidth > 0 ? `${resultBoxWidth}px` : 'auto',
              minWidth: '450px'
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
                <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
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
                  {shareUrl && (
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(shareUrl);
                        setShareButtonCopied(true);
                        setTimeout(() => setShareButtonCopied(false), 2000);
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
                        color: shareButtonCopied ? '#4CAF50' : '#666',
                        transition: 'all 0.2s',
                        fontSize: '0.9rem',
                        fontFamily: "'Inter', sans-serif",
                        backdropFilter: 'blur(10px)',
                        boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
                        flexShrink: 0,
                        whiteSpace: 'nowrap'
                      }}
                      onMouseOver={(e) => {
                        if (!shareButtonCopied) {
                          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.8)';
                          e.currentTarget.style.boxShadow = '0 5px 15px rgba(0, 0, 0, 0.1)';
                        }
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.6)';
                        e.currentTarget.style.boxShadow = '0 2px 10px rgba(0,0,0,0.05)';
                      }}
                    >
                      {shareButtonCopied ? <Check size={18} /> : <Share2 size={18} />}
                      {shareButtonCopied ? 'Copied!' : 'Share'}
                    </button>
                  )}
                </div>
              </div>
            </div>
            <div ref={resultBoxRef} className="final-result-display" style={{ maxWidth: '800px', wordWrap: 'break-word', display: 'inline-block' }}>
              <h1 style={{ 
                fontSize: result.randomValues.length > 1 ? '3rem' : '4rem', 
                margin: 0, 
                color: '#333', 
                lineHeight: 1.5,
                textWrap: 'balance',
                whiteSpace: 'pre-wrap',
                fontFamily: 'Inter, sans-serif'
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
          {status === 'waiting' ? (
            <button 
              onClick={handleCancel}
              className={`start-button cancel-button ${cancelClickCount > 0 ? 'cancel-confirm' : ''}`}
              disabled={isCancelling}
            >
              {isCancelling ? 'Cancelling...' : (cancelFailed ? (cancelClickCount > 0 ? 'Click Again to Confirm' : 'Back to Home Anyway') : (cancelClickCount > 0 ? 'Click Again to Confirm' : 'Cancel'))}
            </button>
          ) : (
            <button 
              onClick={status === 'revealed' ? handleReset : handleStartRandom}
              className="start-button"
              disabled={!isConnected}
            >
              {status === 'revealed' ? 'Start New Round' : 'Start Random'}
            </button>
          )}

          {error && (
            <div className="error-box">
              <strong>⚠️ Validation Error:</strong> {error}
            </div>
          )}
        </div>

        {status === 'waiting' && (
          <p style={{ 
            fontSize: '0.85rem', 
            color: '#666', 
            margin: '8px 0 0 0',
            textAlign: 'center'
          }}>
            You can close the page and return later. But you cannot cancel the draw after closing the browser.
          </p>
        )}

        {/* Status & Verification Section */}
        {status === 'waiting' && (
          <>
            <div className="status-container">
              <h3>Transaction Status</h3>
              <div className="code-block" style={{ marginTop: '10px', marginBottom: '10px' }}>
                <p><strong>Target Block:</strong> {targetBlock}</p>
                <p><strong>Server Commit (Hash):</strong> {commit}</p>
              </div>
              <p className="pulsing">
                {isCalculating 
                  ? `Calculating results...` 
                  : `Waiting for block ${targetBlock} to be mined...`}
              </p>
            </div>

            {shareUrl && (
              <div style={{ 
                display: 'flex',
                gap: '8px',
                marginTop: '20px',
                justifyContent: 'center',
                alignItems: 'center'
              }}>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(shareUrl);
                    setShareUrlCopied(true);
                    setTimeout(() => setShareUrlCopied(false), 2000);
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
                    color: shareUrlCopied ? '#4CAF50' : '#666',
                    transition: 'all 0.2s',
                    fontSize: '0.9rem',
                    fontFamily: "'Inter', sans-serif",
                    backdropFilter: 'blur(10px)',
                    boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
                    flexShrink: 0,
                    whiteSpace: 'nowrap'
                  }}
                  onMouseOver={(e) => {
                    if (!shareUrlCopied) {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.8)';
                      e.currentTarget.style.boxShadow = '0 5px 15px rgba(0, 0, 0, 0.1)';
                    }
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.6)';
                    e.currentTarget.style.boxShadow = '0 2px 10px rgba(0,0,0,0.05)';
                  }}
                >
                  {shareUrlCopied ? <Check size={18} /> : <Share2 size={18} />}
                  {shareUrlCopied ? 'Copied!' : 'Share'}
                </button>
              </div>
            )}
          </>
        )}

        {status === 'revealed' && result && (
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
                    Keccak256 hash using Solidity ABI packed encoding with types [bytes32, string, bytes32, string, uint256, uint256] 
                    and values [Block Hash, User Seed, Server Salt, Fixed Rule, Index, Attempt]. 
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
      
      {/* GitHub Link */}
      <a
        href="https://github.com/wes383/chancey"
        target="_blank"
        rel="noopener noreferrer"
        style={{
          position: 'absolute',
          top: '21px',
          right: '24px',
          width: '32px',
          height: '32px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'opacity 0.3s ease',
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

export default App;

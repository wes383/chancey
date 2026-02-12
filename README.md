# 🎲 Chancey

A verifiable random number generator powered by Ethereum blockchain with shareable results

## Overview

Chancey is a web application that generates verifiable random numbers using Ethereum block hashes. By combining user seeds, server salt, and blockchain data, it ensures fairness and verifiability of random number generation. Results can be shared via unique URLs for transparent verification.

## How It Works

1. **Commit Phase** - User inputs seed and range, system generates hash commitment of server salt
2. **Wait for Block** - Wait for specified future block to be mined
3. **Reveal Phase** - Server verifies block hash from blockchain, then calculates random number using verified block hash, user seed, and server salt
4. **Share & Verify** - Share results via URL for verification

## Random Number Generation Algorithm

Uses [rejection sampling](https://en.wikipedia.org/wiki/Rejection_sampling) to eliminate modulo bias:

1. Calculate limit: $\text{limit} = 2^{256} - (2^{256} \bmod \text{range})$
2. Generate hash using [Solidity ABI packed encoding](https://docs.soliditylang.org/en/latest/abi-spec.html#non-standard-packed-mode):
   - `solidityPackedKeccak256(types, values)`
   - types: `[bytes32, string, bytes32, string, uint256, uint256]`
   - values: `[blockHash, userSeed, serverSalt, fixedRule, index, attempt]`
3. If $\text{hash} < \text{limit}$:
   - a. Calculate candidate: $\text{candidate} = (\text{hash} \bmod \text{range}) + \text{min}$
   - b. If "No Duplicates" mode: check if candidate was already used
   - c. If unique (or duplicates allowed): accept and return candidate
4. Otherwise: increment attempt and retry (step 2)

**Parameter Types**:
- `blockHash`: bytes32 - Target block hash
- `userSeed`: string - User-provided seed
- `serverSalt`: bytes32 - Server salt (revealed after block)
- `fixedRule`: string - Fixed rule ("Chancey_v1.0")
- `index`: uint256 - Draw index (0, 1, 2, ...)
- `attempt`: uint256 - Rejection sampling attempt counter (0, 1, 2, ...)

## Known Limitations

- Miners could theoretically choose not to mine a specific block
- Depends on RPC node availability and accuracy
- Session token is stored in sessionStorage and will be cleared when the browser is closed, after which the draw cannot be cancelled

## License

MIT License

## Disclaimer

This project is for educational and research purposes only. For high-value scenarios, consider more professional solutions.

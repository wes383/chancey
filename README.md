# 🎲 Chancey

A verifiable random number generator powered by Ethereum blockchain

## Overview

Chancey is a web application that generates verifiable random numbers using Ethereum block hashes. By combining user seeds, server salt, and blockchain data, it ensures fairness and verifiability of random number generation.

## How It Works

1. **Commit Phase** - User inputs seed and range, system generates hash commitment of server salt
2. **Wait for Block** - Wait for specified future block to be mined
3. **Reveal Phase** - Calculate random number using block hash, user seed, and server salt
4. **Verification** - Users can independently verify the result

### Random Number Generation Algorithm

Uses [rejection sampling](https://en.wikipedia.org/wiki/Rejection_sampling) to eliminate modulo bias:

```
1. Calculate limit = 2^256 - (2^256 % range)
2. Generate hash = solidityPackedKeccak256(
     types: [bytes32, string, string, bytes32, uint256, uint256],
     values: [blockHash, userSeed, fixedRule, serverSalt, index, attempt]
   )
3. If hash < limit:
     a. Calculate candidate = (hash % range) + min
     b. If "No Duplicates" mode: check if candidate was already used
     c. If unique (or duplicates allowed): accept and return candidate
4. Otherwise: increment attempt and retry (step 2)
```

**Parameter Types**:
- `blockHash`: bytes32 - Target block hash
- `userSeed`: string - User-provided seed
- `fixedRule`: string - Fixed rule ("Chancey_v1.0")
- `serverSalt`: bytes32 - Server salt (revealed after block)
- `index`: uint256 - Draw index (0, 1, 2, ...)
- `attempt`: uint256 - Rejection sampling attempt counter (0, 1, 2, ...)

## Quick Start

### Prerequisites

- Node.js 14+
- npm or yarn

### Installation

```bash
cd chancey
npm install
```

### Development

```bash
npm start
```

### Production Build

```bash
npm run build
```

### Limitations

- Miners could theoretically choose not to mine a specific block
- For high-value scenarios, consider more professional solutions

**Note**: This project is for educational and research purposes only. Not recommended for high-value scenarios.

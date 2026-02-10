import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, getCorsHeaders } from "../_shared/cors.ts";
import { keccak_256 } from "https://esm.sh/@noble/hashes@1.3.3/sha3";
import { JsonRpcProvider } from "https://esm.sh/ethers@6.7.0";

const DEFAULT_RPC_URLS = [
  'https://eth.llamarpc.com',
  'https://1rpc.io/eth',
  'https://ethereum-rpc.publicnode.com',
  'https://rpc.flashbots.net',
  'https://eth.drpc.org'
];

function getRpcUrls(): string[] {
  const envUrls = Deno.env.get('ETH_RPC_URLS');
  if (envUrls && envUrls.trim()) {
    return envUrls.split(',').map(url => url.trim()).filter(url => url);
  }
  return DEFAULT_RPC_URLS;
}

const RPC_URLS = getRpcUrls();

async function getFastestBlock(blockNumber: number): Promise<any> {
  const promises = RPC_URLS.map(async (url) => {
    try {
      const provider = new JsonRpcProvider(url);
      const block = await provider.getBlock(blockNumber);
      return block;
    } catch (error) {
      throw new Error(`RPC ${url} failed: ${error.message}`);
    }
  });
  
  try {
    return await Promise.race(promises);
  } catch (error) {
    throw new Error('All RPC nodes failed to fetch block');
  }
}

// Solidity ABI packed encoding
function solidityPackedKeccak256(types: string[], values: any[]): string {
  let packed = new Uint8Array(0);
  
  for (let i = 0; i < types.length; i++) {
    const type = types[i];
    const value = values[i];
    let bytes: Uint8Array;
    
    if (type === 'bytes32') {
      let hex = value.startsWith('0x') ? value.slice(2) : value;
      if (hex.length > 64) throw new Error('bytes32 value too long');
      hex = hex.padStart(64, '0');
      bytes = new Uint8Array(hex.match(/.{2}/g)!.map((byte: string) => parseInt(byte, 16)));
    } else if (type === 'string') {
      bytes = new TextEncoder().encode(value);
    } else if (type === 'uint256') {
      let num = BigInt(value);
      if (num < 0n) throw new Error('uint256 cannot be negative');
      num = num % (2n ** 256n);
      bytes = new Uint8Array(32);
      for (let j = 31; j >= 0; j--) {
        bytes[j] = Number(num & 0xFFn);
        num >>= 8n;
      }
    } else {
      throw new Error(`Unsupported type: ${type}`);
    }
    
    const newPacked = new Uint8Array(packed.length + bytes.length);
    newPacked.set(packed);
    newPacked.set(bytes, packed.length);
    packed = newPacked;
  }
  
  const hash = keccak_256(packed);
  return '0x' + Array.from(hash).map(b => b.toString(16).padStart(2, '0')).join('');
}

serve(async (req) => {
  const origin = req.headers.get('origin');
  const responseCorsHeaders = getCorsHeaders(origin);
  
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: responseCorsHeaders });
  }

  try {
    const { drawId, blockHash } = await req.json();

    if (!drawId || !blockHash) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...responseCorsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || Deno.env.get('_SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('_SUPABASE_SERVICE_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      console.error('Missing environment variables');
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers: { ...responseCorsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch draw to get all necessary data
    const { data: draw, error: fetchError } = await supabase
      .from('draws')
      .select('*')
      .eq('id', drawId)
      .single();

    if (fetchError || !draw) {
      return new Response(
        JSON.stringify({ error: 'Draw not found' }),
        { status: 404, headers: { ...responseCorsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (draw.status !== 'waiting') {
      return new Response(
        JSON.stringify({ error: 'Draw is not in waiting status' }),
        { status: 400, headers: { ...responseCorsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify server_commit matches server_salt
    const computedCommit = await hashKeccak256(draw.server_salt);
    if (computedCommit !== draw.server_commit) {
      console.error('Server salt verification failed');
      return new Response(
        JSON.stringify({ error: 'Server integrity check failed' }),
        { status: 500, headers: { ...responseCorsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify block hash from blockchain
    try {
      const block = await getFastestBlock(draw.target_block);
      
      if (!block) {
        return new Response(
          JSON.stringify({ error: 'Target block not found. Block may not have been mined yet.' }),
          { status: 400, headers: { ...responseCorsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (block.hash !== blockHash) {
        console.error(`Block hash mismatch: expected ${block.hash}, got ${blockHash}`);
        return new Response(
          JSON.stringify({ 
            error: 'Block hash verification failed. The provided hash does not match the blockchain.',
            expectedHash: block.hash,
            providedHash: blockHash
          }),
          { status: 400, headers: { ...responseCorsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      console.log(`Block hash verified: ${blockHash}`);
    } catch (error) {
      console.error('Block verification error:', error);
      return new Response(
        JSON.stringify({ error: `Failed to verify block: ${error.message}` }),
        { status: 500, headers: { ...responseCorsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate results on server side
    const results = await calculateRandomNumbers(
      blockHash,
      draw.server_salt,
      draw.user_seed,
      draw.num_draws,
      draw.min_value,
      draw.max_value,
      !draw.allow_duplicates
    );

    // Update draw with results
    const { data: updated, error: updateError } = await supabase
      .from('draws')
      .update({
        block_hash: blockHash,
        results: results.randomValues,
        combined_hashes: results.combinedHashes,
        status: 'revealed',
        revealed_at: new Date().toISOString()
      })
      .eq('id', drawId)
      .eq('status', 'waiting')
      .select();

    if (updateError) {
      console.error('Update error:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to reveal draw' }),
        { status: 500, headers: { ...responseCorsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!updated || updated.length === 0) {
      console.error('Draw already revealed or status changed');
      return new Response(
        JSON.stringify({ error: 'Draw already revealed or concurrent update detected' }),
        { status: 409, headers: { ...responseCorsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Return results and server_salt for verification
    return new Response(
      JSON.stringify({
        success: true,
        serverSalt: draw.server_salt,
        randomValues: results.randomValues,
        combinedHashes: results.combinedHashes
      }),
      {
        status: 200,
        headers: {
          ...responseCorsHeaders,
          'Content-Type': 'application/json'
        }
      }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...responseCorsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function hashKeccak256(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBytes = encoder.encode(data);
  const hashBytes = keccak_256(dataBytes);
  return '0x' + Array.from(hashBytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function calculateRandomNumbers(
  blockHash: string,
  serverSalt: string,
  userSeed: string,
  numDraws: number,
  minValue: number,
  maxValue: number,
  noDuplicates: boolean
) {
  const FIXED_RULE = "Chancey_v1.0";
  const randomValues: string[] = [];
  const combinedHashes: string[] = [];
  const usedValues = new Set<string>();
  
  const minBigInt = BigInt(minValue);
  const maxBigInt = BigInt(maxValue);
  const range = maxBigInt - minBigInt + 1n;
  const MAX_UINT256 = 2n ** 256n;
  const limit = MAX_UINT256 - (MAX_UINT256 % range);

  for (let i = 0; i < numDraws; i++) {
    let randomValue: bigint;
    let finalHash: string;
    let attempt = 0;
    const MAX_ATTEMPTS = 1000;
    
    while (attempt < MAX_ATTEMPTS) {
      const combinedHash = solidityPackedKeccak256(
        ["bytes32", "string", "bytes32", "string", "uint256", "uint256"],
        [blockHash, userSeed, serverSalt, FIXED_RULE, i, attempt]
      );
      
      const bigNum = BigInt(combinedHash);
      
      if (bigNum < limit) {
        const candidateValue = (bigNum % range) + minBigInt;
        const valueStr = candidateValue.toString();
        
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
    
    if (attempt >= MAX_ATTEMPTS) {
      console.warn(`Rejection sampling exceeded ${MAX_ATTEMPTS} attempts for draw ${i}`);
      const fallbackHash = solidityPackedKeccak256(
        ["bytes32", "string", "bytes32", "string", "uint256", "uint256"],
        [blockHash, userSeed, serverSalt, FIXED_RULE, i, attempt - 1]
      );
      randomValue = (BigInt(fallbackHash) % range) + minBigInt;
      finalHash = fallbackHash;
    }
    
    randomValues.push(randomValue!.toString());
    combinedHashes.push(finalHash!);
  }

  return { randomValues, combinedHashes };
}

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, getCorsHeaders } from "../_shared/cors.ts";
import { keccak_256 } from "https://esm.sh/@noble/hashes@1.3.3/sha3";

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
    const computedCommit = await keccak256(draw.server_salt);
    if (computedCommit !== draw.server_commit) {
      console.error('Server salt verification failed');
      return new Response(
        JSON.stringify({ error: 'Server integrity check failed' }),
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
    const { error: updateError } = await supabase
      .from('draws')
      .update({
        block_hash: blockHash,
        results: results.randomValues,
        combined_hashes: results.combinedHashes,
        status: 'revealed',
        revealed_at: new Date().toISOString()
      })
      .eq('id', drawId)
      .eq('status', 'waiting');

    if (updateError) {
      console.error('Update error:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to reveal draw' }),
        { status: 500, headers: { ...responseCorsHeaders, 'Content-Type': 'application/json' } }
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

async function keccak256(data: string): Promise<string> {
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
      const combinedData = `${blockHash}${userSeed}${FIXED_RULE}${serverSalt}${i}${attempt}`;
      const combinedHash = await keccak256(combinedData);
      
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
      const fallbackData = `${blockHash}${userSeed}${FIXED_RULE}${serverSalt}${i}${attempt - 1}`;
      const fallbackHash = await keccak256(fallbackData);
      randomValue = (BigInt(fallbackHash) % range) + minBigInt;
      finalHash = fallbackHash;
    }
    
    randomValues.push(randomValue!.toString());
    combinedHashes.push(finalHash!);
  }

  return { randomValues, combinedHashes };
}

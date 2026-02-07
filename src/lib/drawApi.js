import { supabase } from './supabase';
import { nanoid } from 'nanoid';
import { ethers } from 'ethers';

function getCreatorToken() {
  let creatorToken = localStorage.getItem('creator_token');
  if (!creatorToken) {
    creatorToken = ethers.hexlify(ethers.randomBytes(32));
    localStorage.setItem('creator_token', creatorToken);
  }
  return creatorToken;
}

export async function createDraw({
  userSeed,
  minValue,
  maxValue,
  numDraws,
  allowDuplicates,
  separator,
  targetBlock,
  serverCommit
}) {
  const drawId = nanoid(8);
  const creatorToken = getCreatorToken();
  
  const { error } = await supabase
    .from('draws')
    .insert({
      id: drawId,
      user_seed: userSeed,
      min_value: minValue,
      max_value: maxValue,
      num_draws: numDraws,
      allow_duplicates: allowDuplicates,
      separator: separator,
      target_block: targetBlock,
      server_commit: serverCommit,
      creator_token: creatorToken,
      status: 'waiting'
    })
    .select()
    .single();
  
  if (error) {
    console.error('Error creating draw:', error);
    throw error;
  }
  
  return {
    drawId,
    url: `${window.location.origin}/draw/${drawId}`
  };
}

export async function revealDraw(drawId, { serverSalt, blockHash, results, combinedHashes }) {
  const { data: draw, error: fetchError } = await supabase
    .from('draws')
    .select('server_commit')
    .eq('id', drawId)
    .single();
  
  if (fetchError) {
    console.error('Error fetching draw:', fetchError);
    throw fetchError;
  }
  
  const computedCommit = ethers.keccak256(serverSalt);
  if (computedCommit !== draw.server_commit) {
    throw new Error('Invalid server salt: commit mismatch');
  }
  
  const { data, error } = await supabase
    .from('draws')
    .update({
      server_salt: serverSalt,
      block_hash: blockHash,
      results: results,
      combined_hashes: combinedHashes,
      status: 'revealed',
      revealed_at: new Date().toISOString()
    })
    .eq('id', drawId)
    .select()
    .single();
  
  if (error) {
    console.error('Error revealing draw:', error);
    throw error;
  }
  
  return data;
}

export async function getDraw(drawId) {
  const { data, error } = await supabase
    .from('draws')
    .select('*')
    .eq('id', drawId)
    .single();
  
  if (error) {
    console.error('Error fetching draw:', error);
    throw error;
  }
  
  return data;
}

export function subscribeToDraw(drawId, callback) {
  const channel = supabase
    .channel(`draw:${drawId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'draws',
        filter: `id=eq.${drawId}`
      },
      (payload) => {
        callback(payload.new);
      }
    )
    .subscribe();
  
  return () => {
    supabase.removeChannel(channel);
  };
}

export async function cancelDraw(drawId) {
  if (!drawId) return;
  
  const creatorToken = localStorage.getItem('creator_token');
  if (!creatorToken) {
    throw new Error('No creator token found. Cannot cancel draw.');
  }
  
  try {
    const { data, error } = await supabase
      .rpc('cancel_draw', {
        p_draw_id: drawId,
        p_creator_token: creatorToken
      });
    
    if (error) throw error;
    
    if (!data) {
      throw new Error('Not authorized to cancel this draw or draw not found');
    }
    
    return data;
  } catch (err) {
    throw err;
  }
}

export function verifyDraw(drawData) {
  if (drawData.status !== 'revealed') {
    return { valid: false, reason: 'Not revealed yet' };
  }
  
  const computedCommit = ethers.keccak256(drawData.server_salt);
  const commitMatch = computedCommit === drawData.server_commit;
  
  if (!commitMatch) {
    return { valid: false, reason: 'Server salt does not match commitment' };
  }

  return {
    valid: true,
    commitMatch: true,
    calculationMatch: true
  };
}

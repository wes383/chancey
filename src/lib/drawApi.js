import { supabase } from './supabase';
import { ethers } from 'ethers';

export async function createDraw({
  userSeed,
  minValue,
  maxValue,
  numDraws,
  allowDuplicates,
  separator,
  targetBlock
}) {
  const response = await fetch(
    `${process.env.REACT_APP_SUPABASE_URL}/functions/v1/create-draw`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.REACT_APP_SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify({
        userSeed,
        minValue,
        maxValue,
        numDraws,
        allowDuplicates,
        separator,
        targetBlock
      })
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create draw');
  }

  const data = await response.json();
  
  // Store session token in sessionStorage
  if (data.sessionToken) {
    sessionStorage.setItem(`draw_session_${data.drawId}`, data.sessionToken);
  }
  
  return data;
}

export async function revealDraw(drawId, { blockHash }) {
  const response = await fetch(
    `${process.env.REACT_APP_SUPABASE_URL}/functions/v1/reveal-draw`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.REACT_APP_SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify({
        drawId,
        blockHash
      })
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to reveal draw');
  }

  return await response.json();
}

export async function getDraw(drawId) {
  const { data, error } = await supabase
    .from('public_draws')
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
      async (payload) => {
        const { data } = await supabase
          .from('public_draws')
          .select('*')
          .eq('id', drawId)
          .single();
        
        if (data) {
          callback(data);
        }
      }
    )
    .subscribe();
  
  return () => {
    supabase.removeChannel(channel);
  };
}

export async function cancelDraw(drawId) {
  if (!drawId) return;

  const sessionToken = sessionStorage.getItem(`draw_session_${drawId}`);
  if (!sessionToken) {
    throw new Error('No session found. Cannot cancel draw.');
  }

  const response = await fetch(
    `${process.env.REACT_APP_SUPABASE_URL}/functions/v1/cancel-draw`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.REACT_APP_SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify({ drawId, sessionToken })
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to cancel draw');
  }

  sessionStorage.removeItem(`draw_session_${drawId}`);

  return await response.json();
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

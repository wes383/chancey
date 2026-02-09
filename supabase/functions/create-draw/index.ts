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
    const {
      userSeed,
      minValue,
      maxValue,
      numDraws,
      allowDuplicates,
      separator,
      targetBlock
    } = await req.json();

    if (!userSeed || minValue === undefined || maxValue === undefined || !targetBlock) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...responseCorsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate server salt and commit on server side
    const serverSalt = generateServerSalt();
    const serverCommit = await keccak256(serverSalt);

    const sessionToken = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 48);

    const clientIp = req.headers.get('x-forwarded-for') || 
                     req.headers.get('x-real-ip') || 
                     'unknown';
    const userAgent = req.headers.get('user-agent') || 'unknown';

    const drawId = generateDrawId();

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || Deno.env.get('_SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('_SUPABASE_SERVICE_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      console.error('Missing environment variables');
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data, error } = await supabase
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
        server_salt: serverSalt,
        server_commit: serverCommit,
        session_token: sessionToken,
        session_expires_at: expiresAt.toISOString(),
        creator_ip: clientIp,
        creator_user_agent: userAgent,
        status: 'waiting'
      })
      .select()
      .single();

    if (error) {
      console.error('Database error:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to create draw' }),
        { status: 500, headers: { ...responseCorsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        drawId: data.id,
        url: `${origin}/draw/${data.id}`,
        expiresAt: expiresAt.toISOString(),
        sessionToken: sessionToken,
        serverCommit: serverCommit
        // Do NOT return serverSalt here - it will be revealed after block arrives
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

function generateDrawId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function generateServerSalt(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return '0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function keccak256(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBytes = encoder.encode(data);
  const hashBytes = keccak_256(dataBytes);
  return '0x' + Array.from(hashBytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

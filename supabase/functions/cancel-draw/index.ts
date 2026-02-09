import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, getCorsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  const origin = req.headers.get('origin');
  const responseCorsHeaders = getCorsHeaders(origin);
  
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: responseCorsHeaders });
  }

  try {
    const { drawId, sessionToken } = await req.json();

    if (!drawId || !sessionToken) {
      return new Response(
        JSON.stringify({ error: 'drawId and sessionToken are required' }),
        { status: 400, headers: { ...responseCorsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const clientIp = req.headers.get('x-forwarded-for') || 
                     req.headers.get('x-real-ip') || 
                     'unknown';
    const userAgent = req.headers.get('user-agent') || 'unknown';

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

    const { data: draw, error: fetchError } = await supabase
      .from('draws')
      .select('*')
      .eq('id', drawId)
      .eq('session_token', sessionToken)
      .single();

    if (fetchError || !draw) {
      return new Response(
        JSON.stringify({ error: 'Invalid session or draw not found' }),
        { status: 403, headers: { ...responseCorsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (new Date(draw.session_expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ error: 'Session expired. Cannot cancel draw.' }),
        { status: 403, headers: { ...responseCorsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (draw.status !== 'waiting') {
      return new Response(
        JSON.stringify({ error: 'Can only cancel waiting draws' }),
        { status: 400, headers: { ...responseCorsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const ipMatch = draw.creator_ip === clientIp;
    const uaMatch = draw.creator_user_agent === userAgent;
    
    if (!ipMatch || !uaMatch) {
      console.warn(`Session validation warning for draw ${drawId}:`, {
        ipMatch,
        uaMatch
      });
    }

    const { error: updateError } = await supabase
      .from('draws')
      .update({
        status: 'cancelled',
        session_token: null,
        session_expires_at: null
      })
      .eq('id', drawId)
      .eq('session_token', sessionToken);

    if (updateError) {
      console.error('Update error:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to cancel draw' }),
        { status: 500, headers: { ...responseCorsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Draw cancelled successfully' }),
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

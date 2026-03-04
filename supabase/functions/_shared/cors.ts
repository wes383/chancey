const allowedOrigins = [
  'http://localhost:3000',
  'https://chancey.vercel.app',
  'https://chancey.wesluma.com'
];

export function getCorsHeaders(origin: string | null) {
  const allowedOrigin = allowedOrigins.includes(origin || '') 
    ? origin 
    : allowedOrigins[0];
    
  return {
    'Access-Control-Allow-Origin': allowedOrigin || 'http://localhost:3000',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, cookie',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
  };
}

// For OPTIONS requests
export const corsHeaders = {
  'Access-Control-Allow-Origin': 'http://localhost:3000',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, cookie',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Credentials': 'true',
};

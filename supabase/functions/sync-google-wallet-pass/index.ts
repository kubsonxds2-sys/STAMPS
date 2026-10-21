import { withSupabase } from 'npm:@supabase/server@1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const jsonResponse = (status: number, payload: Record<string, unknown>) => new Response(
  JSON.stringify(payload),
  { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
);

const toBase64Url = (value: string | Uint8Array) => {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  let base64 = '';
  for (const byte of bytes) base64 += String.fromCharCode(byte);
  return btoa(base64).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
};

const pemToDer = (pem: string) => {
  const base64 = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, '');
  const raw = atob(base64);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
};

const signJwt = async (claims: Record<string, unknown>, privateKey: string) => {
  const header = toBase64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = toBase64Url(JSON.stringify(claims));
  const signingInput = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    'pkcs8', pemToDer(privateKey), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'],
  );
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${toBase64Url(new Uint8Array(signature))}`;
};

const walletAccessToken = async (serviceAccount: { client_email: string; private_key: string }) => {
  const now = Math.floor(Date.now() / 1000);
  const assertion = await signJwt({
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/wallet_object.issuer',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }, serviceAccount.private_key);
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const result = await response.json().catch(() => ({}));
  return response.ok && typeof result.access_token === 'string' ? result.access_token : null;
};

const handleSync = withSupabase({ auth: 'user' }, async (request, context) => {
  if (request.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed.' });

  const serviceAccountRaw = Deno.env.get('GOOGLE_WALLET_SERVICE_ACCOUNT_JSON');
  const issuerId = Deno.env.get('GOOGLE_WALLET_ISSUER_ID');
  if (!serviceAccountRaw || !issuerId) return jsonResponse(503, { error: 'Google Wallet is not configured yet.' });

  let input: { cardId?: unknown };
  let serviceAccount: { client_email?: string; private_key?: string };
  try {
    input = await request.json();
    serviceAccount = JSON.parse(serviceAccountRaw);
  } catch {
    return jsonResponse(400, { error: 'Invalid request.' });
  }
  const cardId = typeof input.cardId === 'string' ? input.cardId.trim() : '';
  if (!cardId || !serviceAccount.client_email || !serviceAccount.private_key) {
    return jsonResponse(400, { error: 'Invalid card reference.' });
  }

  const { data: authData } = await context.supabase.auth.getUser();
  const user = authData.user;
  if (!user) return jsonResponse(401, { error: 'Sign in required.' });

  const admin = context.supabaseAdmin;
  const { data: actor } = await admin.from('profiles').select('id,role,owner_id,access').eq('id', user.id).maybeSingle();
  if (!actor || actor.access !== 'active') return jsonResponse(403, { error: 'Not allowed.' });
  const ownerId = actor.role === 'staff' ? actor.owner_id : actor.id;
  if (!ownerId) return jsonResponse(403, { error: 'Not allowed.' });

  const { data: card } = await admin
    .from('issued_cards')
    .select('unique_id,stamps,campaign_id,customer_id')
    .eq('id', cardId)
    .eq('owner_id', ownerId)
    .maybeSingle();
  if (!card) return jsonResponse(404, { error: 'Card not found.' });

  const [{ data: campaign }, { data: customer }] = await Promise.all([
    admin.from('campaigns').select('name,reward_name,total_stamps').eq('id', card.campaign_id).eq('owner_id', ownerId).maybeSingle(),
    admin.from('customers').select('name').eq('id', card.customer_id).eq('owner_id', ownerId).maybeSingle(),
  ]);
  if (!campaign) return jsonResponse(404, { error: 'Campaign not found.' });

  const accessToken = await walletAccessToken(serviceAccount as { client_email: string; private_key: string });
  if (!accessToken) return jsonResponse(502, { error: 'Google Wallet authentication failed.' });

  const totalStamps = Number(campaign.total_stamps) || 10;
  const stamps = Math.max(0, Math.min(Number(card.stamps) || 0, totalStamps));
  const objectId = `${issuerId}.stampee_${card.unique_id.replaceAll('-', '_')}`;
  const response = await fetch(
    `https://walletobjects.googleapis.com/walletobjects/v1/genericObject/${encodeURIComponent(objectId)}?updateMask=subheader,textModulesData`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subheader: { defaultValue: { language: 'en', value: `${stamps}/${totalStamps} stamps` } },
        textModulesData: [
          { id: 'progress', header: 'STAMPS', body: `${stamps}/${totalStamps}` },
          { id: 'reward', header: 'REWARD', body: campaign.reward_name || 'Reward' },
          { id: 'member', header: 'MEMBER', body: customer?.name || 'Customer' },
        ],
      }),
    },
  );

  // A 404 means the customer has not added this card to Wallet yet. The stamp update itself succeeded.
  if (response.status === 404) return jsonResponse(200, { synced: false, reason: 'not_added_yet' });
  if (!response.ok) return jsonResponse(502, { error: 'Google Wallet update failed.' });
  return jsonResponse(200, { synced: true });
});

Deno.serve((request) => request.method === 'OPTIONS'
  ? new Response('ok', { headers: corsHeaders })
  : handleSync(request));

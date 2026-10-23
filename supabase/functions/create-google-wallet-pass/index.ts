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
    'pkcs8',
    pemToDer(privateKey),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${toBase64Url(new Uint8Array(signature))}`;
};

const stringValue = (value: unknown, fallback = '') => typeof value === 'string' ? value : fallback;

const handlePass = withSupabase({ auth: 'none' }, async (request, context) => {
  if (request.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed.' });

  const serviceAccountRaw = Deno.env.get('GOOGLE_WALLET_SERVICE_ACCOUNT_JSON');
  const issuerId = Deno.env.get('GOOGLE_WALLET_ISSUER_ID');
  const classId = Deno.env.get('GOOGLE_WALLET_CLASS_ID');
  const appUrl = (Deno.env.get('APP_PUBLIC_URL') || '').replace(/\/+$/, '');
  if (!serviceAccountRaw || !issuerId || !classId || !appUrl) {
    return jsonResponse(503, { error: 'Google Wallet is not configured yet.' });
  }

  let input: { slug?: unknown; cardUniqueId?: unknown };
  let serviceAccount: { client_email?: string; private_key?: string };
  try {
    input = await request.json();
    serviceAccount = JSON.parse(serviceAccountRaw);
  } catch {
    return jsonResponse(400, { error: 'Invalid request.' });
  }
  const slug = stringValue(input.slug).trim();
  const cardUniqueId = stringValue(input.cardUniqueId).trim();
  if (!/^[a-z0-9-]{3,80}$/i.test(slug) || !/^[0-9a-f-]{36}$/i.test(cardUniqueId)) {
    return jsonResponse(400, { error: 'Invalid card reference.' });
  }
  if (!serviceAccount.client_email || !serviceAccount.private_key) {
    return jsonResponse(503, { error: 'Google Wallet credentials are incomplete.' });
  }

  const { data, error } = await context.supabaseAdmin.rpc('get_public_card', {
    slug_input: slug,
    card_unique_id: cardUniqueId,
  });
  if (error || !data?.card || !data?.campaign) {
    return jsonResponse(404, { error: 'Card not found.' });
  }

  const campaign = data.campaign as Record<string, unknown>;
  const card = data.card as Record<string, unknown>;
  const customer = (data.customer ?? {}) as Record<string, unknown>;
  const colors = (campaign.colors ?? {}) as Record<string, unknown>;
  const totalStamps = Number(campaign.total_stamps) || 10;
  const stamps = Math.max(0, Math.min(Number(card.stamps) || 0, totalStamps));
  const objectId = `${issuerId}.stampee_${cardUniqueId.replaceAll('-', '_')}`;
  // Public cards are routed as /:slug/:uniqueId (there is no /card/:slug/:id route).
  const publicCardUrl = `${appUrl}/${encodeURIComponent(slug)}/${encodeURIComponent(cardUniqueId)}`;
  const campaignName = stringValue(campaign.name, 'Loyalty card');
  const rewardName = stringValue(campaign.reward_name, 'Reward');

  const object = {
    id: objectId,
    classId,
    state: 'ACTIVE',
    accountName: stringValue(customer.name, 'Customer'),
    accountId: stringValue(card.id, cardUniqueId),
    loyaltyPoints: {
      label: 'Stamps',
      balance: { string: `${stamps}/${totalStamps}` },
    },
    hexBackgroundColor: stringValue(colors.background, '#1f2937'),
    barcode: { type: 'QR_CODE', value: publicCardUrl, alternateText: cardUniqueId },
    textModulesData: [
      { id: 'program', header: 'PROGRAM', body: campaignName },
      { id: 'reward', header: 'REWARD', body: rewardName },
    ],
    linksModuleData: { uris: [{ uri: publicCardUrl, description: 'Open loyalty card', id: 'stampee-card' }] },
  };

  try {
    const token = await signJwt({
      iss: serviceAccount.client_email,
      aud: 'google',
      typ: 'savetowallet',
      iat: Math.floor(Date.now() / 1000),
      origins: [new URL(appUrl).host],
      payload: { loyaltyObjects: [object] },
    }, serviceAccount.private_key);
    return jsonResponse(200, { saveUrl: `https://pay.google.com/gp/v/save/${token}` });
  } catch {
    return jsonResponse(500, { error: 'Unable to create Google Wallet pass.' });
  }
});

Deno.serve((request) => request.method === 'OPTIONS'
  ? new Response('ok', { headers: corsHeaders })
  : handlePass(request));

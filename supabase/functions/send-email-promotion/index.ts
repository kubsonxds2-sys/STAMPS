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

const escapeHtml = (value: string) => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

const handlePromotion = withSupabase({ auth: 'user' }, async (request, context) => {
  if (request.method !== 'POST') return jsonResponse(405, { success: false, error: 'Method not allowed.' });

  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  const emailFrom = Deno.env.get('PROMO_EMAIL_FROM');
  const appUrl = (Deno.env.get('APP_PUBLIC_URL') || 'https://stampee.co').replace(/\/+$/, '');

  if (!resendApiKey || !emailFrom) {
    return jsonResponse(503, { success: false, error: 'Email sending is not configured yet.' });
  }

  const { data: authData, error: authError } = await context.supabase.auth.getUser();
  const authUser = authData.user;
  if (authError || !authUser || !authUser.email_confirmed_at) {
    return jsonResponse(401, { success: false, error: 'A verified owner account is required.' });
  }

  const admin = context.supabaseAdmin;
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id,role,access,business_name,email')
    .eq('id', authUser.id)
    .maybeSingle();
  if (profileError || !profile || profile.role !== 'owner' || profile.access !== 'active') {
    return jsonResponse(403, { success: false, error: 'Only an active business owner can send promotions.' });
  }

  let input: { campaignId?: unknown; subject?: unknown; body?: unknown };
  try {
    input = await request.json();
  } catch {
    return jsonResponse(400, { success: false, error: 'The promotion details are invalid.' });
  }
  const campaignId = typeof input.campaignId === 'string' ? input.campaignId.trim() : '';
  const subject = typeof input.subject === 'string' ? input.subject.trim() : '';
  const body = typeof input.body === 'string' ? input.body.trim() : '';
  if (!campaignId || !subject || !body || subject.length > 150 || body.length > 5000) {
    return jsonResponse(400, { success: false, error: 'Add a subject and message within the allowed length.' });
  }

  const { data: campaign, error: campaignError } = await admin
    .from('campaigns')
    .select('id,name')
    .eq('id', campaignId)
    .eq('owner_id', profile.id)
    .maybeSingle();
  if (campaignError || !campaign) {
    return jsonResponse(404, { success: false, error: 'The selected campaign could not be found.' });
  }

  const cardRows: Array<{ customer_id: string }> = [];
  for (let offset = 0; offset <= 10000; offset += 1000) {
    const { data: cardBatch, error: cardsError } = await admin
      .from('issued_cards')
      .select('customer_id,created_at')
      .eq('owner_id', profile.id)
      .eq('campaign_id', campaign.id)
      .order('created_at', { ascending: true })
      .range(offset, offset + 999);
    if (cardsError) return jsonResponse(500, { success: false, error: 'Unable to load campaign customers.' });
    cardRows.push(...(cardBatch ?? []));
    if (!cardBatch || cardBatch.length < 1000) break;
  }
  if (cardRows.length > 10000) {
    return jsonResponse(413, { success: false, error: 'This campaign is over the 10,000-card limit for one send.' });
  }

  const customerIds = [...new Set((cardRows ?? []).map((row) => row.customer_id as string))];
  const recipients: Array<{ id: string; name: string; email: string; unsubscribeToken: string }> = [];
  for (let offset = 0; offset < customerIds.length; offset += 500) {
    const idChunk = customerIds.slice(offset, offset + 500);
    const { data: optedInCustomers, error: customersError } = await admin
      .from('customers')
      .select('id,name,email,marketing_email_unsubscribe_token')
      .eq('owner_id', profile.id)
      .eq('status', 'Active')
      .eq('marketing_email_opt_in', true)
      .neq('email', '')
      .in('id', idChunk);
    if (customersError) return jsonResponse(500, { success: false, error: 'Unable to load opted-in customers.' });
    for (const customer of optedInCustomers ?? []) {
      recipients.push({
        id: customer.id,
        name: customer.name,
        email: customer.email,
        unsubscribeToken: customer.marketing_email_unsubscribe_token,
      });
    }
  }

  if (recipients.length === 0) {
    return jsonResponse(400, { success: false, error: 'No customers in this campaign have opted in to email promotions.' });
  }
  if (recipients.length > 1000) {
    return jsonResponse(413, { success: false, error: 'This promotion is limited to 1,000 recipients per send.' });
  }

  const { data: promotion, error: promotionError } = await admin
    .from('email_promotions')
    .insert({
      owner_id: profile.id,
      campaign_id: campaign.id,
      campaign_name: campaign.name,
      subject,
      body,
      status: 'sending',
      recipient_count: recipients.length,
    })
    .select('id')
    .single();
  if (promotionError || !promotion) {
    return jsonResponse(500, { success: false, error: 'Unable to record this promotion.' });
  }

  let sentCount = 0;
  let failedCount = 0;
  const escapedBody = escapeHtml(body).replace(/\r?\n/g, '<br>');
  const batches: typeof recipients[] = [];
  for (let offset = 0; offset < recipients.length; offset += 100) {
    batches.push(recipients.slice(offset, offset + 100));
  }

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
    const messages = batches[batchIndex].map((recipient) => {
      const unsubscribeUrl = `${appUrl}/unsubscribe?token=${encodeURIComponent(recipient.unsubscribeToken)}`;
      const greeting = recipient.name ? `Hi ${escapeHtml(recipient.name)},` : 'Hello,';
      return {
        from: emailFrom,
        reply_to: profile.email ? [profile.email] : undefined,
        to: [recipient.email],
        subject,
        text: `${recipient.name ? `Hi ${recipient.name},\n\n` : ''}${body}\n\nUnsubscribe from promotions: ${unsubscribeUrl}`,
        html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#1d1d1f;line-height:1.6"><p style="font-size:12px;text-transform:uppercase;letter-spacing:.12em;color:#6e6e73">${escapeHtml(profile.business_name)} · ${escapeHtml(campaign.name)}</p><p>${greeting}</p><p>${escapedBody}</p><p style="border-top:1px solid #eee;margin-top:28px;padding-top:16px;font-size:12px;color:#6e6e73">You are receiving this because you agreed to receive email promotions for ${escapeHtml(campaign.name)}.<br><a href="${unsubscribeUrl}">Unsubscribe from promotions</a></p></div>`,
      };
    });

    try {
      const resendResponse = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': `${promotion.id}-batch-${batchIndex}`,
        },
        body: JSON.stringify(messages),
      });
      const result = await resendResponse.json().catch(() => ({}));
      if (resendResponse.ok && Array.isArray(result.data)) {
        sentCount += result.data.length;
        failedCount += messages.length - result.data.length;
      } else {
        failedCount += messages.length;
      }
    } catch {
      failedCount += messages.length;
    }
    if (batchIndex < batches.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 600));
    }
  }

  const status = sentCount === 0 ? 'failed' : failedCount === 0 ? 'sent' : 'partial';
  await admin.from('email_promotions').update({
    status,
    sent_count: sentCount,
    failed_count: failedCount,
    sent_at: new Date().toISOString(),
  }).eq('id', promotion.id);

  return jsonResponse(200, { success: true, sentCount, failedCount });
});

Deno.serve((request) => request.method === 'OPTIONS'
  ? new Response('ok', { headers: corsHeaders })
  : handlePromotion(request));

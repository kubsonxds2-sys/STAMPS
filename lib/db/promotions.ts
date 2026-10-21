import { supabase } from '../supabase';

export interface EmailPromotionRecord {
  id: string;
  campaign_id: string | null;
  campaign_name: string;
  subject: string;
  status: 'sending' | 'sent' | 'partial' | 'failed';
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  created_at: string;
  sent_at: string | null;
}

export async function fetchEmailPromotions(ownerId: string): Promise<EmailPromotionRecord[]> {
  const { data, error } = await supabase
    .from('email_promotions')
    .select('id,campaign_id,campaign_name,subject,status,recipient_count,sent_count,failed_count,created_at,sent_at')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error || !data) return [];
  return data as EmailPromotionRecord[];
}

export async function sendEmailPromotion(input: {
  campaignId: string;
  subject: string;
  body: string;
}): Promise<{ ok: boolean; sentCount?: number; failedCount?: number; error?: string }> {
  const { data, error } = await supabase.functions.invoke('send-email-promotion', {
    body: input,
  });
  if (error || !data || typeof data !== 'object') {
    return { ok: false, error: 'Unable to send this promotion right now. Please try again.' };
  }
  const result = data as { success?: boolean; sentCount?: number; failedCount?: number; error?: string };
  if (!result.success) {
    return { ok: false, error: result.error ?? 'Unable to send this promotion right now. Please try again.' };
  }
  return {
    ok: true,
    sentCount: result.sentCount ?? 0,
    failedCount: result.failedCount ?? 0,
  };
}

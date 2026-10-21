import { supabase } from './supabase';

export async function createGoogleWalletSaveUrl(
  slug: string,
  cardUniqueId: string,
): Promise<{ ok: true; saveUrl: string } | { ok: false; error: string }> {
  const { data, error } = await supabase.functions.invoke('create-google-wallet-pass', {
    body: { slug, cardUniqueId },
  });

  if (error || !data?.saveUrl || typeof data.saveUrl !== 'string') {
    return { ok: false, error: 'Google Wallet is not ready yet. Please try again shortly.' };
  }

  return { ok: true, saveUrl: data.saveUrl };
}

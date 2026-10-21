import { supabase } from './supabase';

/** Updates an existing Google Wallet pass after a staff member changes a card. */
export async function syncGoogleWalletPass(cardId: string): Promise<void> {
  try {
    await supabase.functions.invoke('sync-google-wallet-pass', { body: { cardId } });
  } catch {
    // A card can be used without Wallet. A delayed Wallet update must not undo a completed stamp action.
  }
}

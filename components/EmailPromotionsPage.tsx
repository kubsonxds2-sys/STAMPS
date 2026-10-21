import React, { useEffect, useMemo, useState } from 'react';
import { Mail, Send, Users, Clock3 } from 'lucide-react';
import type { Customer, Template } from '../types';
import { useAuth } from './AuthProvider';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { fetchEmailPromotions, sendEmailPromotion, type EmailPromotionRecord } from '../lib/db/promotions';

interface EmailPromotionsPageProps {
  campaigns: Template[];
  customers: Customer[];
}

const statusLabel: Record<EmailPromotionRecord['status'], string> = {
  sending: 'Sending',
  sent: 'Sent',
  partial: 'Partially sent',
  failed: 'Failed',
};

export const EmailPromotionsPage: React.FC<EmailPromotionsPageProps> = ({ campaigns, customers }) => {
  const { currentOwner } = useAuth();
  const [campaignId, setCampaignId] = useState(campaigns[0]?.id ?? '');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [history, setHistory] = useState<EmailPromotionRecord[]>([]);
  const [sending, setSending] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!campaignId && campaigns.length) setCampaignId(campaigns[0].id);
  }, [campaignId, campaigns]);

  useEffect(() => {
    if (!currentOwner) {
      setLoadingHistory(false);
      return;
    }
    let active = true;
    void fetchEmailPromotions(currentOwner.id).then((items) => {
      if (!active) return;
      setHistory(items);
      setLoadingHistory(false);
    });
    return () => { active = false; };
  }, [currentOwner?.id]);

  const selectedCampaign = campaigns.find((campaign) => campaign.id === campaignId);
  const eligibleCustomers = useMemo(() => customers.filter((customer) => (
    Boolean(customer.marketingEmailOptIn)
    && customer.status === 'Active'
    && Boolean(customer.email.trim())
    && customer.cards.some((card) => card.campaignId === campaignId)
  )), [campaignId, customers]);

  const handleSend = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setNotice('');
    if (!campaignId || !selectedCampaign) {
      setError('Create a campaign before sending a promotion.');
      return;
    }
    if (!subject.trim() || !body.trim()) {
      setError('Add an email subject and message.');
      return;
    }
    if (eligibleCustomers.length === 0) {
      setError('No customers in this campaign have opted in to email promotions.');
      return;
    }
    const confirmed = window.confirm(
      `Send “${subject.trim()}” to ${eligibleCustomers.length} opted-in customer${eligibleCustomers.length === 1 ? '' : 's'} in ${selectedCampaign.name}?`
    );
    if (!confirmed) return;

    setSending(true);
    const result = await sendEmailPromotion({
      campaignId,
      subject: subject.trim(),
      body: body.trim(),
    });
    setSending(false);
    if (!result.ok) {
      setError(result.error ?? 'Unable to send this promotion right now. Please try again.');
      return;
    }
    setNotice(
      result.failedCount
        ? `Accepted ${result.sentCount} email${result.sentCount === 1 ? '' : 's'}; ${result.failedCount} could not be sent.`
        : `Promotion sent to ${result.sentCount} customer${result.sentCount === 1 ? '' : 's'}.`
    );
    setSubject('');
    setBody('');
    if (currentOwner) setHistory(await fetchEmailPromotions(currentOwner.id));
  };

  return (
    <div className="h-full overflow-y-auto bg-gray-50/50 p-4 md:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Customer communication</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground md:text-3xl">Email promotions</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Send an offer to customers in one campaign who explicitly agreed to receive email promotions. Every message includes an unsubscribe link.
          </p>
        </header>

        <form onSubmit={handleSend} className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(260px,0.8fr)]">
          <section className="space-y-5 rounded-3xl border bg-white p-5 shadow-sm md:p-7">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#eef5e8] text-[#4c7a2b]"><Mail size={20} /></div>
              <div>
                <h2 className="font-semibold text-foreground">Compose promotion</h2>
                <p className="text-sm text-muted-foreground">Write a short, useful offer for your customers.</p>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="promotion-campaign">Loyalty campaign</Label>
              <select
                id="promotion-campaign"
                value={campaignId}
                onChange={(event) => setCampaignId(event.target.value)}
                disabled={campaigns.length === 0 || sending}
                className="h-11 rounded-xl border border-input bg-background px-3 text-sm"
              >
                {campaigns.length === 0 && <option value="">No campaigns yet</option>}
                {campaigns.map((campaign) => <option value={campaign.id} key={campaign.id}>{campaign.name}</option>)}
              </select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="promotion-subject">Email subject</Label>
              <Input id="promotion-subject" maxLength={150} value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="A little something for your next visit" disabled={sending} />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="promotion-body">Message</Label>
              <textarea
                id="promotion-body"
                value={body}
                onChange={(event) => setBody(event.target.value)}
                maxLength={5000}
                rows={7}
                placeholder="Tell customers what the offer is and when it ends."
                disabled={sending}
                className="resize-y rounded-xl border border-input bg-background px-3 py-2.5 text-sm leading-6 outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <p className="text-xs text-muted-foreground">{body.length}/5000 characters</p>
            </div>

            {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
            {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div>}

            <Button type="submit" className="h-11 rounded-full px-6" disabled={sending || eligibleCustomers.length === 0 || campaigns.length === 0}>
              <Send size={16} className="mr-2" />{sending ? 'Sending...' : 'Review and send'}
            </Button>
          </section>

          <aside className="space-y-4">
            <section className="rounded-3xl border bg-white p-5 shadow-sm md:p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Eligible recipients</p>
                  <p className="mt-2 text-4xl font-bold tracking-tight text-foreground">{eligibleCustomers.length}</p>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f5f4ef] text-[#1d1d1f]"><Users size={20} /></div>
              </div>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {selectedCampaign ? `Customers with an active or past card in “${selectedCampaign.name}” and an active email consent.` : 'Choose a campaign to see its opted-in customers.'}
              </p>
            </section>
            <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-900">
              Promotions go only to customers who checked the optional email consent box. Loyalty card messages are separate from marketing emails.
            </section>
          </aside>
        </form>

        <section className="rounded-3xl border bg-white p-5 shadow-sm md:p-7">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f5f4ef] text-[#5f6368]"><Clock3 size={18} /></div>
            <div>
              <h2 className="font-semibold text-foreground">Recent promotions</h2>
              <p className="text-sm text-muted-foreground">A record of emails submitted for delivery.</p>
            </div>
          </div>
          {loadingHistory ? (
            <p className="mt-5 text-sm text-muted-foreground">Loading history...</p>
          ) : history.length === 0 ? (
            <p className="mt-5 rounded-2xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">No promotions sent yet.</p>
          ) : (
            <div className="mt-5 divide-y">
              {history.map((item) => (
                <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-4 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{item.subject}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{item.campaign_name} · {new Date(item.created_at).toLocaleString()}</p>
                  </div>
                  <div className="text-right text-sm">
                    <p className="font-medium text-foreground">{statusLabel[item.status]}</p>
                    <p className="text-xs text-muted-foreground">{item.sent_count}/{item.recipient_count} accepted · {item.failed_count} failed</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

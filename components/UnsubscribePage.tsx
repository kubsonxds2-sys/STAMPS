import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from './ui/button';
import { unsubscribeMarketingEmail } from '../lib/db/publicSignup';

export const UnsubscribePage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [status, setStatus] = useState<'ready' | 'saving' | 'done' | 'invalid' | 'error'>(token ? 'ready' : 'invalid');

  const handleUnsubscribe = async () => {
    setStatus('saving');
    try {
      const success = await unsubscribeMarketingEmail(token);
      setStatus(success ? 'done' : 'invalid');
    } catch {
      setStatus('error');
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f5f5f7] px-4 py-10">
      <section className="w-full max-w-lg rounded-[2rem] border border-black/[0.08] bg-white p-7 text-center shadow-[0_24px_64px_-38px_rgba(0,0,0,0.35)] sm:p-10">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#6e6e73]">Email preferences</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-[#1d1d1f]">
          {status === 'done' ? 'You are unsubscribed' : 'Unsubscribe from promotions'}
        </h1>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-[#5f6368]">
          {status === 'done'
            ? 'You will no longer receive marketing emails from this business. Loyalty card updates are not affected.'
            : status === 'invalid'
              ? 'This unsubscribe link is invalid or has expired.'
              : status === 'error'
                ? 'We could not update your email preferences. Please try again.'
                : 'Choose whether to stop receiving marketing emails. Your loyalty card will remain active.'}
        </p>
        {status !== 'done' && status !== 'invalid' && (
          <Button
            className="mt-7 h-12 rounded-full bg-[#1d1d1f] px-7 text-white hover:bg-black"
            onClick={handleUnsubscribe}
            disabled={status === 'saving' || !token}
          >
            {status === 'saving' ? 'Updating...' : 'Unsubscribe'}
          </Button>
        )}
      </section>
    </main>
  );
};

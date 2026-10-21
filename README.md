<div align="center">
<img width="1200" alt="Stampee preview" src="public/image_1.jpg" />
</div>

# Stampee

Stampee is a digital loyalty card and stamp card app for a single business. You can self-host the frontend and connect it to your own Supabase project.

All access starts at `/login`. There is no marketplace or multi-tenant public signup flow for businesses.

## Tech Stack

- React 18
- TypeScript
- Vite
- Tailwind CSS
- Radix UI primitives
- React Router
- Supabase Auth, Postgres, Storage, and RPC functions
- Vercel Analytics
- Vercel deployment config via [`vercel.json`](vercel.json)

## Prerequisites

- Node.js
- A Supabase project

## Local Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy the environment template:
   ```bash
   cp .env.example .env.local
   ```

3. Configure `.env.local`:

   Required:
   - `VITE_APP_URL`: your app URL, for example `http://localhost:5173`
   - `VITE_SUPABASE_URL`: your [Supabase](https://supabase.com) project URL
   - `VITE_SUPABASE_ANON_KEY`: your Supabase anon key

   Optional:
   - `VITE_ENABLE_DEMO_WORKSPACE`: set to `true` to enable the demo workspace in development
   - `VITE_SUPPORT_EMAIL`: support email shown in the app

4. Set up the database in the Supabase SQL Editor:
   ```text
   supabase/migration.sql   -> run first for a fresh install
   supabase/seed.sql        -> optional, run second for the local/dev demo admin
   ```

   Notes:
   - [`supabase/migration.sql`](supabase/migration.sql) is the canonical fresh-install script. It includes the current schema, RLS policies, storage policies, and RPC functions.
   - The smaller SQL files in [`supabase/legacy-patches/`](supabase/legacy-patches/) are upgrade or repair scripts for older or existing projects and are not part of the default new-project setup. Existing projects should also run [`atomic_reward_redemption.sql`](supabase/legacy-patches/atomic_reward_redemption.sql) and [`email_promotions_and_consent.sql`](supabase/legacy-patches/email_promotions_and_consent.sql).
   - [`supabase/seed.sql`](supabase/seed.sql) is for local or development environments only because it creates a known demo account.

5. Configure email promotions:
   - Deploy [`supabase/functions/send-email-promotion`](supabase/functions/send-email-promotion) as a Supabase Edge Function.
   - Add the `RESEND_API_KEY`, `PROMO_EMAIL_FROM`, and `APP_PUBLIC_URL` secrets to the Supabase project. `PROMO_EMAIL_FROM` must use a sender domain verified with Resend.
   - The Supabase service-role key is used only inside the Edge Function and must never be added to frontend environment variables.
   - For local Edge Function development, copy [`supabase/functions/.env.example`](supabase/functions/.env.example) to `supabase/functions/.env` and fill in test values.
   - See the [Supabase Edge Functions guide](https://supabase.com/docs/guides/functions) and [Resend batch email API](https://resend.com/docs/api-reference/emails/send-batch).

5. Start the dev server:
   ```bash
   npm run dev
   ```

## Demo Admin Seed

If you run [`supabase/seed.sql`](supabase/seed.sql), it creates this development-only owner account:

| Field | Value |
|---|---|
| Email | `admin@stampee.local` |
| Password | `Admin1234` |
| Slug | `demo` |

Change the password after first login in `Settings -> Account`.

Do not use the demo seed account as-is in production.

## Available Scripts

- `npm run dev`: start the Vite development server
- `npm run generate:sitemap`: regenerate `public/sitemap.xml`
- `npm run build`: regenerate the sitemap, then build the production bundle
- `npm run preview`: preview the production build locally

There is currently no automated test suite in the repo. `npm run build` is the main verification step for this project today.

## Product Notes

- Multiple business owner accounts can use one shared Supabase project. Each owner profile is the current business boundary; campaigns, customers, and issued cards carry `owner_id`, with Supabase Row Level Security policies separating access.
- Business owners can create accounts through `/signup`; staff accounts are created by the owner from `Settings -> Staff`.
- Public customer-facing routes are supported for viewing issued cards and joining enabled campaigns
- Customer cards show their stamp count and history. Google Wallet issuer setup is in progress; the backend pass integration is not complete yet. See [`docs/google-wallet-setup.md`](docs/google-wallet-setup.md) for the setup log and remaining steps. Apple Wallet passes are not integrated.
- Location-based customer notifications are not part of the current implementation.

## Deploy

You can deploy the app anywhere that serves a Vite SPA, including Vercel.

1. Add the same `VITE_...` environment variables to your deployment platform.
2. If you use Vercel, you can optionally enable Vercel Web Analytics.
3. [`vercel.json`](vercel.json) already rewrites client-side routes to `index.html`.
4. Make sure your Supabase project has already been initialized with [`supabase/migration.sql`](supabase/migration.sql).

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for contribution guidelines.

## License

[MIT](LICENSE)

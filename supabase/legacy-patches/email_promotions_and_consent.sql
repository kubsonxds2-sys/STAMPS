-- Apply to existing projects to add explicit email opt-in, unsubscribe and promotion history.

-- 3. CUSTOMERS TABLE
create table if not exists public.customers (
  id text primary key default gen_random_uuid()::text,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  email text not null,
  mobile text,
  status text not null default 'Active' check (status in ('Active', 'Inactive')),
  marketing_email_opt_in boolean not null default false,
  marketing_email_consent_at timestamptz,
  marketing_email_unsubscribed_at timestamptz,
  marketing_email_unsubscribe_token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now()
);

alter table public.customers
  add column if not exists marketing_email_opt_in boolean not null default false,
  add column if not exists marketing_email_consent_at timestamptz,
  add column if not exists marketing_email_unsubscribed_at timestamptz,
  add column if not exists marketing_email_unsubscribe_token uuid;

update public.customers
set marketing_email_unsubscribe_token = gen_random_uuid()
where marketing_email_unsubscribe_token is null;

alter table public.customers
  alter column marketing_email_unsubscribe_token set default gen_random_uuid(),
  alter column marketing_email_unsubscribe_token set not null;

create unique index if not exists customers_marketing_unsubscribe_token_key
  on public.customers (marketing_email_unsubscribe_token);

alter table public.customers enable row level security;

drop policy if exists "Owners can manage own customers" on public.customers;
create policy "Owners can manage own customers"
  on public.customers for all
  using (auth.uid() = owner_id);

drop policy if exists "Staff can read owner customers" on public.customers;
create policy "Staff can read owner customers"
  on public.customers for select
  using (
    owner_id = (select owner_id from public.profiles where id = auth.uid())
  );

drop policy if exists "Staff can update owner customers" on public.customers;
create policy "Staff can update owner customers"
  on public.customers for update
  using (
    owner_id = (select owner_id from public.profiles where id = auth.uid())
  );

-- Owner-visible record of each email promotion sent to opted-in customers.
create table if not exists public.email_promotions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  campaign_id text references public.campaigns(id) on delete set null,
  campaign_name text not null,
  subject text not null,
  body text not null,
  status text not null default 'sending' check (status in ('sending', 'sent', 'partial', 'failed')),
  recipient_count integer not null default 0,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

grant select on public.email_promotions to authenticated;

alter table public.email_promotions enable row level security;

drop policy if exists "Owners can read own email promotions" on public.email_promotions;
create policy "Owners can read own email promotions"
  on public.email_promotions for select
  using (owner_id = (select auth.uid()));

create or replace function public.unsubscribe_marketing_email(token_input uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  matching_customer_id text;
begin
  select id into matching_customer_id
  from public.customers
  where marketing_email_unsubscribe_token = token_input;

  if not found then
    return false;
  end if;

  update public.customers
  set marketing_email_opt_in = false,
      marketing_email_unsubscribed_at = coalesce(marketing_email_unsubscribed_at, now())
  where id = matching_customer_id;

  return true;
end;
$$;

revoke all on function public.unsubscribe_marketing_email(uuid) from public;
grant execute on function public.unsubscribe_marketing_email(uuid) to anon, authenticated;

drop function if exists public.register_public_campaign_signup(text, text, text, text, text);

create or replace function public.register_public_campaign_signup(
  slug_input text,
  campaign_id_input text,
  customer_name_input text,
  customer_email_input text default null,
  customer_mobile_input text default null,
  marketing_email_opt_in_input boolean default false
)
returns jsonb as $$
declare
  owner_row record;
  campaign_row public.campaigns%rowtype;
  customer_row public.customers%rowtype;
  existing_card_row record;
  normalized_name text;
  normalized_email text;
  normalized_mobile text;
  now_ts timestamptz := now();
  new_card_id text;
  new_unique_id uuid;
begin
  normalized_name := trim(coalesce(customer_name_input, ''));
  normalized_email := nullif(lower(trim(coalesce(customer_email_input, ''))), '');
  normalized_mobile := nullif(regexp_replace(coalesce(customer_mobile_input, ''), '[^0-9]+', '', 'g'), '');

  if normalized_name = '' then
    return jsonb_build_object('outcome', 'error', 'error', 'Name is required.');
  end if;

  if coalesce(marketing_email_opt_in_input, false) and normalized_email is null then
    return jsonb_build_object('outcome', 'error', 'error', 'Enter an email address to receive promotions.');
  end if;

  select id, slug, business_name
  into owner_row
  from public.profiles
  where slug = slug_input and role = 'owner';
  if not found then
    return jsonb_build_object('outcome', 'error', 'error', 'Business not found.');
  end if;

  select *
  into campaign_row
  from public.campaigns
  where id = campaign_id_input
    and owner_id = owner_row.id;
  if not found then
    return jsonb_build_object('outcome', 'error', 'error', 'Campaign not found.');
  end if;

  if normalized_email is not null or normalized_mobile is not null then
    select *
    into customer_row
    from public.customers c
    where c.owner_id = owner_row.id
      and (
        (normalized_email is not null and nullif(lower(trim(c.email)), '') = normalized_email)
        or
        (normalized_mobile is not null and nullif(regexp_replace(coalesce(c.mobile, ''), '[^0-9]+', '', 'g'), '') = normalized_mobile)
      )
    order by c.created_at asc
    limit 1;
  end if;

  if customer_row.id is not null then
    if coalesce(marketing_email_opt_in_input, false) and normalized_email is not null then
      update public.customers
      set email = normalized_email,
          marketing_email_opt_in = true,
          marketing_email_consent_at = now_ts,
          marketing_email_unsubscribed_at = null,
          marketing_email_unsubscribe_token = gen_random_uuid()
      where id = customer_row.id;
    end if;

    select ic.unique_id
    into existing_card_row
    from public.issued_cards ic
    where ic.owner_id = owner_row.id
      and ic.campaign_id = campaign_row.id
      and ic.customer_id = customer_row.id
      and ic.status = 'Active'
    order by ic.created_at asc
    limit 1;

    if found then
      return jsonb_build_object('outcome', 'redirect_existing', 'uniqueId', existing_card_row.unique_id);
    end if;
  end if;

  if campaign_row.is_enabled = false then
    return jsonb_build_object('outcome', 'campaign_disabled_no_existing');
  end if;

  if customer_row.id is null then
    insert into public.customers (
      id, owner_id, name, email, mobile, status,
      marketing_email_opt_in, marketing_email_consent_at
    )
    values (
      gen_random_uuid()::text,
      owner_row.id,
      normalized_name,
      coalesce(normalized_email, ''),
      normalized_mobile,
      'Active',
      coalesce(marketing_email_opt_in_input, false) and normalized_email is not null,
      case when coalesce(marketing_email_opt_in_input, false) and normalized_email is not null then now_ts else null end
    )
    returning * into customer_row;
  end if;

  new_card_id := gen_random_uuid()::text;
  new_unique_id := gen_random_uuid();

  insert into public.issued_cards (
    id,
    unique_id,
    customer_id,
    campaign_id,
    owner_id,
    campaign_name,
    stamps,
    last_visit,
    status,
    template_snapshot
  )
  values (
    new_card_id,
    new_unique_id,
    customer_row.id,
    campaign_row.id,
    owner_row.id,
    campaign_row.name,
    0,
    current_date,
    'Active',
    jsonb_build_object(
      'id', campaign_row.id,
      'name', campaign_row.name,
      'description', campaign_row.description,
      'rewardName', campaign_row.reward_name,
      'tagline', campaign_row.tagline,
      'backgroundImage', campaign_row.background_image,
      'backgroundOpacity', campaign_row.background_opacity,
      'logoImage', campaign_row.logo_image,
      'showLogo', campaign_row.show_logo,
      'titleSize', campaign_row.title_size,
      'iconKey', campaign_row.icon_key,
      'colors', campaign_row.colors,
      'totalStamps', campaign_row.total_stamps,
      'social', campaign_row.social
    )
  );

  insert into public.transactions (
    id,
    card_id,
    type,
    amount,
    date,
    "timestamp",
    title
  )
  values (
    gen_random_uuid()::text,
    new_card_id,
    'issued',
    0,
    to_char(now_ts, 'Mon FMDD, YYYY FMHH12:MI AM'),
    floor(extract(epoch from now_ts) * 1000)::bigint,
    'Card Issued'
  );

  return jsonb_build_object('outcome', 'issued', 'uniqueId', new_unique_id);
end;
$$ language plpgsql security definer
set search_path = public;

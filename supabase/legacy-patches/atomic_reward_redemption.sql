-- Apply this patch to existing databases to enable atomic reward redemption.

-- Reward redemption and cycle reset must succeed or fail together. Locking the
-- card row also prevents two staff sessions from redeeming the same cycle.
create or replace function public.redeem_issued_card_reward(card_id_input text, remarks_input text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_row public.profiles%rowtype;
  card_row public.issued_cards%rowtype;
  campaign_row public.campaigns%rowtype;
  owner_uid uuid;
  owner_access text;
  stamps_required integer;
  reward_name_value text;
  transaction_id text := gen_random_uuid()::text;
  transaction_time timestamptz := clock_timestamp();
  transaction_title text;
  transaction_remarks text := nullif(btrim(remarks_input), '');
begin
  select * into actor_row
  from public.profiles
  where id = auth.uid();

  if not found or actor_row.access <> 'active' then
    raise exception 'REDEMPTION_NOT_ALLOWED';
  end if;

  if actor_row.role = 'owner' then
    owner_uid := actor_row.id;
  elsif actor_row.role = 'staff' then
    owner_uid := actor_row.owner_id;
  end if;

  if owner_uid is null then
    raise exception 'REDEMPTION_NOT_ALLOWED';
  end if;

  if actor_row.role = 'staff' then
    select access into owner_access
    from public.profiles
    where id = owner_uid and role = 'owner';
    if not found or owner_access <> 'active' then
      raise exception 'REDEMPTION_NOT_ALLOWED';
    end if;
  end if;

  select * into card_row
  from public.issued_cards
  where id = card_id_input
  for update;

  if not found or card_row.owner_id <> owner_uid then
    raise exception 'CARD_NOT_FOUND_OR_UNAUTHORIZED';
  end if;

  if card_row.status <> 'Active' then
    raise exception 'CARD_NOT_ACTIVE';
  end if;

  if card_row.campaign_id is not null then
    select * into campaign_row
    from public.campaigns
    where id = card_row.campaign_id;
  end if;

  if card_row.template_snapshot ? 'totalStamps'
    and (card_row.template_snapshot->>'totalStamps') ~ '^[0-9]+$' then
    stamps_required := (card_row.template_snapshot->>'totalStamps')::integer;
  else
    stamps_required := coalesce(campaign_row.total_stamps, 10);
  end if;

  if card_row.template_snapshot ? 'rewardName' then
    reward_name_value := nullif(btrim(card_row.template_snapshot->>'rewardName'), '');
  end if;
  reward_name_value := coalesce(reward_name_value, nullif(btrim(campaign_row.reward_name), ''), 'Reward');

  if card_row.stamps < stamps_required then
    raise exception 'REWARD_NOT_READY';
  end if;

  transaction_title := 'Reward redeemed: ' || reward_name_value;

  insert into public.transactions (
    id, card_id, type, amount, date, "timestamp", title, remarks,
    actor_id, actor_name, actor_role
  ) values (
    transaction_id,
    card_row.id,
    'redeem',
    0,
    to_char(transaction_time, 'Mon DD, YYYY HH12:MI AM'),
    (extract(epoch from transaction_time) * 1000)::bigint,
    transaction_title,
    transaction_remarks,
    actor_row.id,
    actor_row.business_name,
    actor_row.role
  );

  update public.issued_cards
  set stamps = 0,
      status = 'Active',
      completed_date = null
  where id = card_row.id;

  return jsonb_build_object(
    'success', true,
    'transaction', jsonb_build_object(
      'id', transaction_id,
      'type', 'redeem',
      'amount', 0,
      'date', to_char(transaction_time, 'Mon DD, YYYY HH12:MI AM'),
      'timestamp', (extract(epoch from transaction_time) * 1000)::bigint,
      'title', transaction_title,
      'remarks', transaction_remarks,
      'actorId', actor_row.id,
      'actorName', actor_row.business_name,
      'actorRole', actor_row.role
    )
  );
end;
$$;

revoke all on function public.redeem_issued_card_reward(text, text) from public, anon;
grant execute on function public.redeem_issued_card_reward(text, text) to authenticated;

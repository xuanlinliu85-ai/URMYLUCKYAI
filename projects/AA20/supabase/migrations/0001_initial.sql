create extension if not exists pgcrypto;

create table public.players (
  id uuid primary key,
  nickname text not null check (char_length(nickname) between 1 and 16),
  avatar_id text not null,
  created_at timestamptz not null default now()
);

create table public.rooms (
  id uuid primary key,
  code text not null unique check (code ~ '^[A-Z2-9]{5,6}$'),
  host_player_id uuid not null references public.players(id),
  status text not null default 'waiting' check (status in ('waiting','playing','paused','finished')),
  max_players int not null default 7 check (max_players between 2 and 7),
  game_mode text not null default 'poker_squid' check (game_mode in ('poker','poker_squid')),
  rule_snapshot jsonb not null,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create table public.room_members (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  player_id uuid not null references public.players(id),
  seat_no int check (seat_no between 1 and 7),
  stack bigint not null default 10000 check (stack >= 0),
  buy_in_total bigint not null default 10000 check (buy_in_total >= 0),
  squid_count int not null default 0 check (squid_count >= 0),
  token_hash text not null,
  connection_state text not null default 'connected' check (connection_state in ('connected','disconnected_grace','sitting_out','left')),
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  unique(room_id, player_id),
  unique(room_id, seat_no)
);
create unique index room_members_token_hash_idx on public.room_members(room_id, token_hash);

create table public.rule_snapshots (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  version int not null,
  rules jsonb not null,
  created_at timestamptz not null default now(),
  unique(room_id, version)
);

create table public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create table public.room_runtime_state (
  room_id uuid primary key references public.rooms(id) on delete cascade,
  state_version bigint not null default 1,
  poker_state jsonb not null default '{}'::jsonb,
  squid_state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.hands (
  id uuid primary key,
  room_id uuid not null references public.rooms(id) on delete cascade,
  hand_no int not null,
  dealer_seat int not null,
  state text not null,
  board jsonb not null default '[]'::jsonb,
  public_result jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  unique(room_id, hand_no)
);

create table public.hand_private_cards (
  hand_id uuid not null references public.hands(id) on delete cascade,
  player_id uuid not null references public.players(id),
  cards jsonb not null,
  primary key(hand_id, player_id)
);

create table public.hand_actions (
  id uuid primary key default gen_random_uuid(),
  action_id uuid not null unique,
  hand_id uuid not null references public.hands(id) on delete cascade,
  player_id uuid not null references public.players(id),
  action_type text not null,
  amount bigint,
  state_version bigint not null,
  created_at timestamptz not null default now()
);

create table public.pots (
  id uuid primary key default gen_random_uuid(),
  hand_id uuid not null references public.hands(id) on delete cascade,
  pot_no int not null,
  pot_type text not null check (pot_type in ('MAIN','SIDE')),
  amount bigint not null,
  eligible_player_ids jsonb not null,
  winner_ids jsonb not null default '[]'::jsonb,
  split_amounts jsonb not null default '{}'::jsonb,
  unique(hand_id, pot_no)
);

create table public.poker_results (
  id uuid primary key default gen_random_uuid(),
  hand_id uuid not null references public.hands(id) on delete cascade,
  player_id uuid not null references public.players(id),
  amount bigint not null,
  hand_rank jsonb,
  unique(hand_id, player_id)
);

create table public.squid_rounds (
  id uuid primary key,
  room_id uuid not null references public.rooms(id) on delete cascade,
  round_no int not null,
  rules jsonb not null,
  participants jsonb not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  unique(room_id, round_no)
);

create table public.squid_awards (
  id uuid primary key default gen_random_uuid(),
  squid_round_id uuid not null references public.squid_rounds(id) on delete cascade,
  hand_id uuid not null references public.hands(id),
  player_id uuid not null references public.players(id),
  amount int not null check (amount > 0),
  reason text not null,
  created_at timestamptz not null default now(),
  unique(squid_round_id, hand_id, player_id)
);

create table public.squid_settlements (
  id uuid primary key default gen_random_uuid(),
  squid_round_id uuid not null references public.squid_rounds(id) on delete cascade,
  from_player_id uuid not null references public.players(id),
  to_player_id uuid not null references public.players(id),
  amount bigint not null check (amount > 0),
  details jsonb not null,
  created_at timestamptz not null default now(),
  unique(squid_round_id, from_player_id, to_player_id)
);

create table public.night_summaries (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  player_id uuid not null references public.players(id),
  summary jsonb not null,
  created_at timestamptz not null default now(),
  unique(room_id, player_id)
);

alter table public.players enable row level security;
alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.rule_snapshots enable row level security;
alter table public.game_sessions enable row level security;
alter table public.room_runtime_state enable row level security;
alter table public.hands enable row level security;
alter table public.hand_private_cards enable row level security;
alter table public.hand_actions enable row level security;
alter table public.pots enable row level security;
alter table public.poker_results enable row level security;
alter table public.squid_rounds enable row level security;
alter table public.squid_awards enable row level security;
alter table public.squid_settlements enable row level security;
alter table public.night_summaries enable row level security;

-- No browser table policies are intentional. The publishable key can use Realtime
-- Broadcast/Presence, while every durable read and write goes through Next.js APIs.

create or replace function public.create_room_v1(
  p_room_id uuid, p_code text, p_player_id uuid, p_nickname text,
  p_avatar_id text, p_token_hash text, p_max_players int,
  p_game_mode text, p_rules jsonb, p_starting_stack bigint
) returns jsonb language plpgsql security definer set search_path = public as $$
begin
  insert into players(id, nickname, avatar_id) values (p_player_id, trim(p_nickname), p_avatar_id);
  insert into rooms(id, code, host_player_id, max_players, game_mode, rule_snapshot)
    values (p_room_id, upper(p_code), p_player_id, p_max_players, p_game_mode, p_rules);
  insert into room_members(room_id, player_id, seat_no, stack, buy_in_total, token_hash)
    values (p_room_id, p_player_id, 1, p_starting_stack, p_starting_stack, p_token_hash);
  insert into rule_snapshots(room_id, version, rules) values (p_room_id, 1, p_rules);
  insert into room_runtime_state(room_id, state_version, poker_state, squid_state)
    values (p_room_id, 1, '{}'::jsonb, '{}'::jsonb);
  return jsonb_build_object('room_id', p_room_id, 'player_id', p_player_id, 'code', upper(p_code), 'state_version', 1);
end $$;

create or replace function public.join_room_v1(
  p_player_id uuid, p_code text, p_nickname text, p_avatar_id text, p_token_hash text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_room rooms%rowtype; v_seat int;
begin
  select * into v_room from rooms where code = upper(p_code) for update;
  if not found then raise exception 'room_not_found'; end if;
  if v_room.status <> 'waiting' then raise exception 'room_already_started'; end if;
  if exists(select 1 from room_members rm join players p on p.id=rm.player_id where rm.room_id=v_room.id and lower(p.nickname)=lower(trim(p_nickname)) and rm.left_at is null)
    then raise exception 'nickname_taken'; end if;
  select seat into v_seat from generate_series(1, v_room.max_players) seat
    where not exists(select 1 from room_members where room_id=v_room.id and seat_no=seat and left_at is null) order by seat limit 1;
  if v_seat is null then raise exception 'room_full'; end if;
  insert into players(id, nickname, avatar_id) values (p_player_id, trim(p_nickname), p_avatar_id);
  insert into room_members(room_id, player_id, seat_no, stack, buy_in_total, token_hash)
    values (v_room.id, p_player_id, v_seat, (v_room.rule_snapshot#>>'{poker,startingStack}')::bigint, (v_room.rule_snapshot#>>'{poker,startingStack}')::bigint, p_token_hash);
  return jsonb_build_object('room_id', v_room.id, 'player_id', p_player_id, 'code', v_room.code, 'seat_no', v_seat);
end $$;

create or replace function public.update_room_settings_v1(
  p_room_id uuid, p_expected_version bigint, p_rules jsonb, p_starting_stack bigint default null
) returns bigint language plpgsql security definer set search_path = public as $$
declare v_room rooms%rowtype; v_runtime room_runtime_state%rowtype; v_version bigint;
begin
  select * into v_room from rooms where id=p_room_id for update;
  if not found then raise exception 'room_not_found'; end if;
  select * into v_runtime from room_runtime_state where room_id=p_room_id for update;
  if v_runtime.state_version <> p_expected_version then raise exception 'state_conflict'; end if;
  if v_room.status <> 'waiting' and coalesce(v_runtime.poker_state->>'street','') <> 'FINISHED' then raise exception 'hand_in_progress'; end if;
  if p_starting_stack is not null and v_room.status <> 'waiting' then raise exception 'hand_in_progress'; end if;
  update rooms set rule_snapshot=p_rules where id=p_room_id;
  insert into rule_snapshots(room_id, version, rules) values (p_room_id, (p_rules->>'version')::int, p_rules);
  if p_starting_stack is not null then
    update room_members set stack=p_starting_stack, buy_in_total=p_starting_stack where room_id=p_room_id and left_at is null;
  end if;
  update room_runtime_state set state_version=state_version+1, updated_at=now() where room_id=p_room_id returning state_version into v_version;
  return v_version;
end $$;

create or replace function public.rebuy_room_v1(
  p_room_id uuid, p_player_id uuid, p_expected_version bigint, p_amount bigint, p_poker_state jsonb
) returns bigint language plpgsql security definer set search_path = public as $$
declare v_room rooms%rowtype; v_runtime room_runtime_state%rowtype; v_version bigint;
begin
  if p_amount <= 0 then raise exception 'invalid_rebuy'; end if;
  select * into v_room from rooms where id=p_room_id for update;
  if not found then raise exception 'room_not_found'; end if;
  select * into v_runtime from room_runtime_state where room_id=p_room_id for update;
  if v_runtime.state_version <> p_expected_version then raise exception 'state_conflict'; end if;
  if v_room.status <> 'waiting' and coalesce(v_runtime.poker_state->>'street','') <> 'FINISHED' then raise exception 'hand_in_progress'; end if;
  update room_members set stack=stack+p_amount, buy_in_total=buy_in_total+p_amount
    where room_id=p_room_id and player_id=p_player_id and left_at is null;
  if not found then raise exception 'player_not_in_room'; end if;
  update room_runtime_state set poker_state=p_poker_state, state_version=state_version+1, updated_at=now()
    where room_id=p_room_id returning state_version into v_version;
  return v_version;
end $$;

create or replace function public.cas_runtime_v1(
  p_room_id uuid, p_expected_version bigint, p_poker_state jsonb, p_squid_state jsonb
) returns bigint language plpgsql security definer set search_path = public as $$
declare v_version bigint;
begin
  update room_runtime_state set poker_state=p_poker_state, squid_state=p_squid_state,
    state_version=state_version+1, updated_at=now()
    where room_id=p_room_id and state_version=p_expected_version
    returning state_version into v_version;
  if v_version is null then raise exception 'state_conflict'; end if;
  return v_version;
end $$;

create or replace function public.apply_action_cas_v1(
  p_room_id uuid, p_expected_version bigint, p_action_id uuid, p_hand_id uuid,
  p_player_id uuid, p_action_type text, p_amount bigint,
  p_poker_state jsonb, p_squid_state jsonb
) returns bigint language plpgsql security definer set search_path = public as $$
declare v_version bigint;
begin
  if exists(select 1 from hand_actions where action_id=p_action_id) then
    select state_version into v_version from room_runtime_state where room_id=p_room_id;
    return v_version;
  end if;
  update room_runtime_state set poker_state=p_poker_state, squid_state=p_squid_state,
    state_version=state_version+1, updated_at=now()
    where room_id=p_room_id and state_version=p_expected_version
    returning state_version into v_version;
  if v_version is null then raise exception 'state_conflict'; end if;
  insert into hand_actions(action_id, hand_id, player_id, action_type, amount, state_version)
    values (p_action_id, p_hand_id, p_player_id, p_action_type, p_amount, v_version);
  return v_version;
end $$;

revoke all on function public.create_room_v1 from public, anon, authenticated;
revoke all on function public.join_room_v1 from public, anon, authenticated;
revoke all on function public.cas_runtime_v1 from public, anon, authenticated;
revoke all on function public.apply_action_cas_v1 from public, anon, authenticated;
revoke all on function public.update_room_settings_v1 from public, anon, authenticated;
revoke all on function public.rebuy_room_v1 from public, anon, authenticated;
grant execute on function public.create_room_v1 to service_role;
grant execute on function public.join_room_v1 to service_role;
grant execute on function public.cas_runtime_v1 to service_role;
grant execute on function public.apply_action_cas_v1 to service_role;
grant execute on function public.update_room_settings_v1 to service_role;
grant execute on function public.rebuy_room_v1 to service_role;

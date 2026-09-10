-- Adds auditable buy-ins plus safe between-hand blind and rebuy operations.
alter table public.room_members
  add column if not exists buy_in_total bigint;

update public.room_members rm
set buy_in_total = coalesce(rm.buy_in_total, (r.rule_snapshot#>>'{poker,startingStack}')::bigint, rm.stack)
from public.rooms r
where r.id = rm.room_id and rm.buy_in_total is null;

alter table public.room_members alter column buy_in_total set not null;
alter table public.room_members alter column buy_in_total set default 10000;

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
declare v_room rooms%rowtype; v_seat int; v_starting_stack bigint;
begin
  select * into v_room from rooms where code = upper(p_code) for update;
  if not found then raise exception 'room_not_found'; end if;
  if v_room.status <> 'waiting' then raise exception 'room_already_started'; end if;
  if exists(select 1 from room_members rm join players p on p.id=rm.player_id where rm.room_id=v_room.id and lower(p.nickname)=lower(trim(p_nickname)) and rm.left_at is null)
    then raise exception 'nickname_taken'; end if;
  select seat into v_seat from generate_series(1, v_room.max_players) seat
    where not exists(select 1 from room_members where room_id=v_room.id and seat_no=seat and left_at is null) order by seat limit 1;
  if v_seat is null then raise exception 'room_full'; end if;
  v_starting_stack := (v_room.rule_snapshot#>>'{poker,startingStack}')::bigint;
  insert into players(id, nickname, avatar_id) values (p_player_id, trim(p_nickname), p_avatar_id);
  insert into room_members(room_id, player_id, seat_no, stack, buy_in_total, token_hash)
    values (v_room.id, p_player_id, v_seat, v_starting_stack, v_starting_stack, p_token_hash);
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

revoke all on function public.update_room_settings_v1 from public, anon, authenticated;
revoke all on function public.rebuy_room_v1 from public, anon, authenticated;
revoke all on function public.create_room_v1 from public, anon, authenticated;
revoke all on function public.join_room_v1 from public, anon, authenticated;
grant execute on function public.update_room_settings_v1 to service_role;
grant execute on function public.rebuy_room_v1 to service_role;
grant execute on function public.create_room_v1 to service_role;
grant execute on function public.join_room_v1 to service_role;

-- PPT Factory Team Style Library remote repository.
-- Apply with Supabase migrations, expose the `ppt_factory` schema in API
-- settings, and keep the Storage bucket private. RPCs derive the actor from
-- auth.uid(); no actor identity parameter is accepted.

create schema if not exists ppt_factory;
revoke all on schema ppt_factory from public, anon;
grant usage on schema ppt_factory to authenticated, service_role;

create table if not exists ppt_factory.tenants (
  tenant_id text primary key check (tenant_id ~ '^[A-Za-z0-9_-]{1,80}$'),
  created_by uuid not null,
  created_at timestamptz not null default clock_timestamp()
);

create table if not exists ppt_factory.teams (
  tenant_id text not null references ppt_factory.tenants (tenant_id) on delete restrict,
  team_id text not null check (team_id ~ '^[A-Za-z0-9_-]{1,80}$'),
  name text not null check (char_length(btrim(name)) between 1 and 160),
  revision bigint not null check (revision > 0),
  library jsonb not null check (jsonb_typeof(library) = 'object'),
  created_by uuid not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (tenant_id, team_id),
  check ((library ->> 'tenantId') = tenant_id),
  check ((library ->> 'teamId') = team_id),
  check ((library ->> 'revision')::bigint = revision),
  check ((library ->> 'schema') = 'ppt-factory/team-style-library/v1')
);

create table if not exists ppt_factory.team_members (
  tenant_id text not null,
  team_id text not null,
  user_id uuid not null,
  role text not null check (role in ('owner', 'editor', 'viewer')),
  added_by uuid not null,
  added_at timestamptz not null,
  updated_by uuid not null,
  updated_at timestamptz not null,
  primary key (tenant_id, team_id, user_id),
  foreign key (tenant_id, team_id) references ppt_factory.teams (tenant_id, team_id) on delete restrict
);

create table if not exists ppt_factory.team_artifact_versions (
  tenant_id text not null,
  team_id text not null,
  artifact_type text not null check (artifact_type in ('style_pack', 'golden_slide')),
  artifact_id text not null check (
    char_length(artifact_id) between 1 and 120
    and artifact_id !~ '[[:cntrl:]/]'
    and position(chr(92) in artifact_id) = 0
    and artifact_id <> '..'
  ),
  version text not null check (version ~ '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$'),
  name text not null check (char_length(btrim(name)) between 1 and 240),
  state text not null check (state in ('published', 'archived')),
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  provenance jsonb not null check (jsonb_typeof(provenance) = 'object'),
  parent_version text,
  parent_content_hash text,
  published_by uuid not null,
  published_at timestamptz not null,
  archived_by uuid,
  archived_at timestamptz,
  primary key (tenant_id, team_id, artifact_type, artifact_id, version),
  unique (tenant_id, team_id, artifact_type, artifact_id, version, content_hash),
  foreign key (tenant_id, team_id) references ppt_factory.teams (tenant_id, team_id) on delete restrict,
  check ((parent_version is null) = (parent_content_hash is null)),
  check (parent_version is null or parent_version ~ '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$'),
  check (parent_content_hash is null or parent_content_hash ~ '^[a-f0-9]{64}$'),
  check ((state = 'published' and archived_by is null and archived_at is null)
      or (state = 'archived' and archived_by is not null and archived_at is not null))
);

create table if not exists ppt_factory.team_library_revisions (
  tenant_id text not null,
  team_id text not null,
  revision bigint not null check (revision > 0),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  committed_by uuid not null,
  committed_at timestamptz not null default clock_timestamp(),
  primary key (tenant_id, team_id, revision),
  foreign key (tenant_id, team_id) references ppt_factory.teams (tenant_id, team_id) on delete restrict,
  check ((snapshot ->> 'tenantId') = tenant_id),
  check ((snapshot ->> 'teamId') = team_id),
  check ((snapshot ->> 'revision')::bigint = revision)
);

create table if not exists ppt_factory.team_style_assets (
  asset_id text not null check (asset_id ~ '^[A-Za-z0-9_-]{1,80}$'),
  tenant_id text not null,
  team_id text not null,
  object_path text not null check (object_path !~ '(^|/)\.\.(/|$)'),
  content_type text not null check (char_length(content_type) between 3 and 120),
  byte_size bigint not null check (byte_size >= 0),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  artifact_type text check (artifact_type in ('style_pack', 'golden_slide')),
  artifact_id text,
  artifact_version text,
  created_by uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (tenant_id, team_id, asset_id),
  unique (object_path),
  foreign key (tenant_id, team_id) references ppt_factory.teams (tenant_id, team_id) on delete restrict,
  foreign key (tenant_id, team_id, artifact_type, artifact_id, artifact_version)
    references ppt_factory.team_artifact_versions (tenant_id, team_id, artifact_type, artifact_id, version) on delete restrict,
  check (object_path like tenant_id || '/' || team_id || '/%'),
  check ((artifact_type is null and artifact_id is null and artifact_version is null)
      or (artifact_type is not null and artifact_id is not null and artifact_version is not null))
);

create index if not exists team_members_user_scope_idx
  on ppt_factory.team_members (user_id, tenant_id, team_id);
create index if not exists teams_tenant_updated_idx
  on ppt_factory.teams (tenant_id, updated_at desc);
create index if not exists artifact_versions_scope_type_idx
  on ppt_factory.team_artifact_versions (tenant_id, team_id, artifact_type, artifact_id, published_at desc);
create index if not exists artifact_versions_scope_state_idx
  on ppt_factory.team_artifact_versions (tenant_id, team_id, state, artifact_type);
create index if not exists library_revisions_scope_time_idx
  on ppt_factory.team_library_revisions (tenant_id, team_id, committed_at desc);
create index if not exists style_assets_scope_artifact_idx
  on ppt_factory.team_style_assets (tenant_id, team_id, artifact_type, artifact_id, artifact_version);

create or replace function ppt_factory.current_actor_id()
returns uuid
language sql
stable
security invoker
set search_path = pg_catalog
as $$ select auth.uid() $$;

create or replace function ppt_factory.is_team_member(p_tenant_id text, p_team_id text, p_roles text[] default null)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, ppt_factory
as $$
  select exists (
    select 1 from ppt_factory.team_members m
    where m.tenant_id = p_tenant_id
      and m.team_id = p_team_id
      and m.user_id = auth.uid()
      and (p_roles is null or m.role = any (p_roles))
  )
$$;

create or replace function ppt_factory.reject_immutable_row_change()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  raise exception 'PPT_FACTORY_CONFLICT: immutable revision rows cannot be changed' using errcode = 'P0001';
end
$$;

create or replace function ppt_factory.guard_artifact_version_update()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  if old.tenant_id <> new.tenant_id or old.team_id <> new.team_id
    or old.artifact_type <> new.artifact_type or old.artifact_id <> new.artifact_id
    or old.version <> new.version or old.name <> new.name
    or old.content_hash <> new.content_hash or old.content <> new.content
    or old.provenance <> new.provenance or old.parent_version is distinct from new.parent_version
    or old.parent_content_hash is distinct from new.parent_content_hash
    or old.published_by <> new.published_by or old.published_at <> new.published_at then
    raise exception 'PPT_FACTORY_CONFLICT: immutable artifact version cannot be replaced' using errcode = 'P0001';
  end if;
  if old.state = 'archived' and (new.state <> 'archived'
      or old.archived_by is distinct from new.archived_by
      or old.archived_at is distinct from new.archived_at) then
    raise exception 'PPT_FACTORY_CONFLICT: archived artifact version is immutable' using errcode = 'P0001';
  end if;
  if old.state = 'published' and new.state = 'archived'
      and (new.archived_by is null or new.archived_at is null) then
    raise exception 'PPT_FACTORY_INVALID: archive provenance is required' using errcode = 'P0001';
  end if;
  return new;
end
$$;

drop trigger if exists team_library_revisions_immutable on ppt_factory.team_library_revisions;
create trigger team_library_revisions_immutable
before update or delete on ppt_factory.team_library_revisions
for each row execute function ppt_factory.reject_immutable_row_change();

drop trigger if exists team_artifact_versions_immutable_delete on ppt_factory.team_artifact_versions;
create trigger team_artifact_versions_immutable_delete
before delete on ppt_factory.team_artifact_versions
for each row execute function ppt_factory.reject_immutable_row_change();

drop trigger if exists team_artifact_versions_guard_update on ppt_factory.team_artifact_versions;
create trigger team_artifact_versions_guard_update
before update on ppt_factory.team_artifact_versions
for each row execute function ppt_factory.guard_artifact_version_update();

alter table ppt_factory.tenants enable row level security;
alter table ppt_factory.teams enable row level security;
alter table ppt_factory.team_members enable row level security;
alter table ppt_factory.team_artifact_versions enable row level security;
alter table ppt_factory.team_library_revisions enable row level security;
alter table ppt_factory.team_style_assets enable row level security;

drop policy if exists tenants_member_select on ppt_factory.tenants;
create policy tenants_member_select on ppt_factory.tenants for select to authenticated
using (exists (select 1 from ppt_factory.team_members m where m.tenant_id = tenants.tenant_id and m.user_id = auth.uid()));
drop policy if exists teams_member_select on ppt_factory.teams;
create policy teams_member_select on ppt_factory.teams for select to authenticated
using (ppt_factory.is_team_member(tenant_id, team_id));
drop policy if exists members_team_select on ppt_factory.team_members;
create policy members_team_select on ppt_factory.team_members for select to authenticated
using (ppt_factory.is_team_member(tenant_id, team_id));
drop policy if exists artifacts_team_select on ppt_factory.team_artifact_versions;
create policy artifacts_team_select on ppt_factory.team_artifact_versions for select to authenticated
using (ppt_factory.is_team_member(tenant_id, team_id));
drop policy if exists revisions_team_select on ppt_factory.team_library_revisions;
create policy revisions_team_select on ppt_factory.team_library_revisions for select to authenticated
using (ppt_factory.is_team_member(tenant_id, team_id));
drop policy if exists assets_team_select on ppt_factory.team_style_assets;
create policy assets_team_select on ppt_factory.team_style_assets for select to authenticated
using (ppt_factory.is_team_member(tenant_id, team_id));

create or replace function ppt_factory.team_style_library_read(p_tenant_id text, p_team_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, ppt_factory
as $$
declare
  result jsonb;
begin
  if auth.uid() is null then
    raise exception 'PPT_FACTORY_FORBIDDEN: authenticated actor required' using errcode = 'P0001';
  end if;
  if not ppt_factory.is_team_member(p_tenant_id, p_team_id) then
    return null;
  end if;
  select library into result from ppt_factory.teams
  where tenant_id = p_tenant_id and team_id = p_team_id;
  return result;
end
$$;

create or replace function ppt_factory.team_style_library_create(p_library jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, ppt_factory
as $$
declare
  actor uuid := auth.uid();
  tenant_key text := p_library ->> 'tenantId';
  team_key text := p_library ->> 'teamId';
  owner_count integer;
  tenant_allowed boolean;
  tenant_creator uuid;
  member jsonb;
begin
  if actor is null then
    raise exception 'PPT_FACTORY_FORBIDDEN: authenticated actor required' using errcode = 'P0001';
  end if;
  if p_library ->> 'schema' <> 'ppt-factory/team-style-library/v1'
      or (p_library ->> 'revision')::bigint <> 1
      or tenant_key !~ '^[A-Za-z0-9_-]{1,80}$'
      or team_key !~ '^[A-Za-z0-9_-]{1,80}$' then
    raise exception 'PPT_FACTORY_INVALID: invalid initial library snapshot' using errcode = 'P0001';
  end if;
  select count(*) into owner_count
  from jsonb_array_elements(p_library -> 'members') item
  where item ->> 'userId' = actor::text and item ->> 'role' = 'owner';
  if owner_count <> 1 then
    raise exception 'PPT_FACTORY_FORBIDDEN: authenticated creator must be the initial owner' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_library -> 'artifacts') <> 0 then
    raise exception 'PPT_FACTORY_INVALID: initial library cannot contain artifact versions' using errcode = 'P0001';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(tenant_key, 0));
  select t.created_by into tenant_creator
  from ppt_factory.tenants t
  where t.tenant_id = tenant_key;
  tenant_allowed := tenant_creator is null or tenant_creator = actor or exists (
      select 1 from ppt_factory.team_members m
      where m.tenant_id = tenant_key and m.user_id = actor and m.role = 'owner'
    );
  if not tenant_allowed then
    raise exception 'PPT_FACTORY_FORBIDDEN: tenant owner membership required to create another team' using errcode = 'P0001';
  end if;
  insert into ppt_factory.tenants (tenant_id, created_by, created_at)
  values (tenant_key, actor, (p_library ->> 'createdAt')::timestamptz)
  on conflict (tenant_id) do nothing;
  begin
    insert into ppt_factory.teams
      (tenant_id, team_id, name, revision, library, created_by, created_at, updated_at)
    values
      (tenant_key, team_key, p_library ->> 'name', 1, p_library, actor,
       (p_library ->> 'createdAt')::timestamptz, (p_library ->> 'updatedAt')::timestamptz);
  exception when unique_violation then
    raise exception 'PPT_FACTORY_CONFLICT: Team Style Library already exists' using errcode = 'P0001';
  end;
  for member in select value from jsonb_array_elements(p_library -> 'members') loop
    insert into ppt_factory.team_members
      (tenant_id, team_id, user_id, role, added_by, added_at, updated_by, updated_at)
    values
      (tenant_key, team_key, (member ->> 'userId')::uuid, member ->> 'role',
       (member ->> 'addedBy')::uuid, (member ->> 'addedAt')::timestamptz,
       (member ->> 'updatedBy')::uuid, (member ->> 'updatedAt')::timestamptz);
  end loop;
  insert into ppt_factory.team_library_revisions
    (tenant_id, team_id, revision, snapshot, committed_by, committed_at)
  values (tenant_key, team_key, 1, p_library, actor, clock_timestamp());
  return p_library;
end
$$;

create or replace function ppt_factory.team_style_library_compare_and_swap(p_library jsonb, p_expected_revision bigint)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, ppt_factory
as $$
declare
  actor uuid := auth.uid();
  tenant_key text := p_library ->> 'tenantId';
  team_key text := p_library ->> 'teamId';
  stored_revision bigint;
  prior_library jsonb;
  member jsonb;
  existing_member ppt_factory.team_members%rowtype;
  artifact jsonb;
  existing ppt_factory.team_artifact_versions%rowtype;
  actor_role text;
  latest_version text;
  latest_hash text;
begin
  if actor is null then
    raise exception 'PPT_FACTORY_FORBIDDEN: authenticated actor required' using errcode = 'P0001';
  end if;
  select revision, library into stored_revision, prior_library
  from ppt_factory.teams
  where tenant_id = tenant_key and team_id = team_key
  for update;
  if not found then
    raise exception 'PPT_FACTORY_NOT_FOUND: Team Style Library not found' using errcode = 'P0001';
  end if;
  select role into actor_role from ppt_factory.team_members
  where tenant_id = tenant_key and team_id = team_key and user_id = actor;
  if actor_role is null then
    raise exception 'PPT_FACTORY_FORBIDDEN: team membership required' using errcode = 'P0001';
  end if;
  if actor_role = 'viewer' then
    raise exception 'PPT_FACTORY_FORBIDDEN: viewer cannot mutate the team library' using errcode = 'P0001';
  end if;
  if stored_revision <> p_expected_revision
      or (p_library ->> 'revision')::bigint <> p_expected_revision + 1 then
    raise exception 'PPT_FACTORY_CONFLICT: Team Style Library revision conflict' using errcode = 'P0001';
  end if;
  if p_library ->> 'schema' <> 'ppt-factory/team-style-library/v1'
      or p_library ->> 'createdAt' <> prior_library ->> 'createdAt' then
    raise exception 'PPT_FACTORY_INVALID: invalid library snapshot' using errcode = 'P0001';
  end if;
  if (
      (p_library -> 'members') is distinct from (prior_library -> 'members')
      or (p_library ->> 'name') is distinct from (prior_library ->> 'name')
    ) and actor_role <> 'owner' then
    raise exception 'PPT_FACTORY_FORBIDDEN: owner role required for membership or team metadata changes' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from ppt_factory.team_members m
    where m.tenant_id = tenant_key and m.team_id = team_key
      and not exists (select 1 from jsonb_array_elements(p_library -> 'members') j where j ->> 'userId' = m.user_id::text)
  ) then
    raise exception 'PPT_FACTORY_CONFLICT: existing member records cannot be removed' using errcode = 'P0001';
  end if;
  if not exists (select 1 from jsonb_array_elements(p_library -> 'members') j where j ->> 'role' = 'owner') then
    raise exception 'PPT_FACTORY_CONFLICT: Team must retain at least one owner' using errcode = 'P0001';
  end if;
  for member in select value from jsonb_array_elements(p_library -> 'members') loop
    select * into existing_member from ppt_factory.team_members
    where tenant_id = tenant_key and team_id = team_key and user_id = (member ->> 'userId')::uuid;
    if found then
      if existing_member.added_by <> (member ->> 'addedBy')::uuid
          or existing_member.added_at <> (member ->> 'addedAt')::timestamptz then
        raise exception 'PPT_FACTORY_CONFLICT: member creation provenance is immutable' using errcode = 'P0001';
      end if;
      if (existing_member.role <> member ->> 'role'
          or existing_member.updated_by <> (member ->> 'updatedBy')::uuid
          or existing_member.updated_at <> (member ->> 'updatedAt')::timestamptz)
          and member ->> 'updatedBy' <> actor::text then
        raise exception 'PPT_FACTORY_INVALID: member update actor must match authenticated actor' using errcode = 'P0001';
      end if;
    elsif member ->> 'addedBy' <> actor::text or member ->> 'updatedBy' <> actor::text then
      raise exception 'PPT_FACTORY_INVALID: member creator must match authenticated actor' using errcode = 'P0001';
    end if;
    insert into ppt_factory.team_members
      (tenant_id, team_id, user_id, role, added_by, added_at, updated_by, updated_at)
    values
      (tenant_key, team_key, (member ->> 'userId')::uuid, member ->> 'role',
       (member ->> 'addedBy')::uuid, (member ->> 'addedAt')::timestamptz,
       (member ->> 'updatedBy')::uuid, (member ->> 'updatedAt')::timestamptz)
    on conflict (tenant_id, team_id, user_id) do update
      set role = excluded.role, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
  end loop;
  if exists (
    select 1 from ppt_factory.team_artifact_versions v
    where v.tenant_id = tenant_key and v.team_id = team_key
      and not exists (
        select 1 from jsonb_array_elements(p_library -> 'artifacts') j
        where j ->> 'artifactType' = v.artifact_type and j ->> 'artifactId' = v.artifact_id and j ->> 'version' = v.version
      )
  ) then
    raise exception 'PPT_FACTORY_CONFLICT: immutable artifact versions cannot be removed' using errcode = 'P0001';
  end if;
  for artifact in select value from jsonb_array_elements(p_library -> 'artifacts') loop
    select * into existing from ppt_factory.team_artifact_versions
    where tenant_id = tenant_key and team_id = team_key
      and artifact_type = artifact ->> 'artifactType'
      and artifact_id = artifact ->> 'artifactId'
      and version = artifact ->> 'version';
    if found then
      if existing.name <> artifact ->> 'name'
          or existing.content_hash <> artifact ->> 'contentHash'
          or existing.content <> artifact -> 'content'
          or existing.provenance <> artifact -> 'provenance'
          or existing.parent_version is distinct from (artifact -> 'provenance' ->> 'parentVersion')
          or existing.parent_content_hash is distinct from (artifact -> 'provenance' ->> 'parentContentHash')
          or existing.published_by <> (artifact -> 'provenance' ->> 'publishedBy')::uuid
          or existing.published_at <> (artifact -> 'provenance' ->> 'publishedAt')::timestamptz then
        raise exception 'PPT_FACTORY_CONFLICT: immutable artifact version cannot be replaced' using errcode = 'P0001';
      end if;
      if existing.state = 'published' and artifact ->> 'state' = 'archived'
          and actor_role <> 'owner' then
        raise exception 'PPT_FACTORY_FORBIDDEN: owner role required to archive' using errcode = 'P0001';
      end if;
      if existing.state = 'published' and artifact ->> 'state' = 'archived'
          and artifact ->> 'archivedBy' <> actor::text then
        raise exception 'PPT_FACTORY_INVALID: archive actor must match authenticated actor' using errcode = 'P0001';
      end if;
      if existing.state = 'published' and artifact ->> 'state' = 'archived'
          and artifact ->> 'archivedAt' is distinct from p_library ->> 'updatedAt' then
        raise exception 'PPT_FACTORY_INVALID: archive time must match the library revision time' using errcode = 'P0001';
      end if;
      update ppt_factory.team_artifact_versions
      set state = artifact ->> 'state',
          archived_by = nullif(artifact ->> 'archivedBy', '')::uuid,
          archived_at = nullif(artifact ->> 'archivedAt', '')::timestamptz
      where tenant_id = tenant_key and team_id = team_key
        and artifact_type = artifact ->> 'artifactType'
        and artifact_id = artifact ->> 'artifactId'
        and version = artifact ->> 'version';
    else
      if artifact -> 'provenance' ->> 'publishedBy' <> actor::text then
        raise exception 'PPT_FACTORY_INVALID: publisher must match authenticated actor' using errcode = 'P0001';
      end if;
      if artifact ->> 'state' <> 'published'
          or artifact ? 'archivedBy'
          or artifact ? 'archivedAt' then
        raise exception 'PPT_FACTORY_INVALID: new artifact versions must start published without archive provenance' using errcode = 'P0001';
      end if;
      latest_version := null;
      latest_hash := null;
      select p.version, p.content_hash into latest_version, latest_hash
      from ppt_factory.team_artifact_versions p
      where p.tenant_id = tenant_key and p.team_id = team_key
        and p.artifact_type = artifact ->> 'artifactType'
        and p.artifact_id = artifact ->> 'artifactId'
      order by split_part(p.version, '.', 1)::bigint desc,
        split_part(p.version, '.', 2)::bigint desc,
        split_part(p.version, '.', 3)::bigint desc
      limit 1;
      if latest_version is null then
        if artifact -> 'provenance' ->> 'parentVersion' is not null
            or artifact -> 'provenance' ->> 'parentContentHash' is not null then
          raise exception 'PPT_FACTORY_CONFLICT: first artifact version cannot claim a parent' using errcode = 'P0001';
        end if;
      else
        if artifact -> 'provenance' ->> 'parentVersion' is distinct from latest_version
            or artifact -> 'provenance' ->> 'parentContentHash' is distinct from latest_hash then
          raise exception 'PPT_FACTORY_CONFLICT: artifact parent must be the latest immutable version' using errcode = 'P0001';
        end if;
        if row(
            split_part(artifact ->> 'version', '.', 1)::bigint,
            split_part(artifact ->> 'version', '.', 2)::bigint,
            split_part(artifact ->> 'version', '.', 3)::bigint
          ) <= row(
            split_part(latest_version, '.', 1)::bigint,
            split_part(latest_version, '.', 2)::bigint,
            split_part(latest_version, '.', 3)::bigint
          ) then
          raise exception 'PPT_FACTORY_CONFLICT: artifact version must increase monotonically' using errcode = 'P0001';
        end if;
      end if;
      insert into ppt_factory.team_artifact_versions
        (tenant_id, team_id, artifact_type, artifact_id, version, name, state,
         content_hash, content, provenance, parent_version, parent_content_hash,
         published_by, published_at, archived_by, archived_at)
      values
        (tenant_key, team_key, artifact ->> 'artifactType', artifact ->> 'artifactId', artifact ->> 'version',
         artifact ->> 'name', artifact ->> 'state', artifact ->> 'contentHash', artifact -> 'content', artifact -> 'provenance',
         artifact -> 'provenance' ->> 'parentVersion', artifact -> 'provenance' ->> 'parentContentHash',
         (artifact -> 'provenance' ->> 'publishedBy')::uuid, (artifact -> 'provenance' ->> 'publishedAt')::timestamptz,
         nullif(artifact ->> 'archivedBy', '')::uuid, nullif(artifact ->> 'archivedAt', '')::timestamptz);
    end if;
  end loop;
  update ppt_factory.teams
  set name = p_library ->> 'name', revision = p_expected_revision + 1,
      library = p_library, updated_at = (p_library ->> 'updatedAt')::timestamptz
  where tenant_id = tenant_key and team_id = team_key;
  insert into ppt_factory.team_library_revisions
    (tenant_id, team_id, revision, snapshot, committed_by, committed_at)
  values (tenant_key, team_key, p_expected_revision + 1, p_library, actor, clock_timestamp());
  return p_library;
end
$$;

revoke all on all tables in schema ppt_factory from public, anon, authenticated;
revoke all on all functions in schema ppt_factory from public, anon, authenticated;
grant select on ppt_factory.team_style_assets to authenticated;
grant execute on function ppt_factory.is_team_member(text, text, text[]) to authenticated;
grant execute on function ppt_factory.team_style_library_read(text, text) to authenticated;
grant execute on function ppt_factory.team_style_library_create(jsonb) to authenticated;
grant execute on function ppt_factory.team_style_library_compare_and_swap(jsonb, bigint) to authenticated;

-- Default private bucket. If PPT_FACTORY_SUPABASE_STYLE_BUCKET is customized,
-- create the matching private bucket and update the literal in policies below.
insert into storage.buckets (id, name, public)
values ('ppt-factory-style-library', 'ppt-factory-style-library', false)
on conflict (id) do update set public = false;

drop policy if exists ppt_factory_team_style_assets_read on storage.objects;
create policy ppt_factory_team_style_assets_read on storage.objects
for select to authenticated
using (
  bucket_id = 'ppt-factory-style-library'
  and ppt_factory.is_team_member((storage.foldername(name))[1], (storage.foldername(name))[2])
);

drop policy if exists ppt_factory_team_style_assets_write on storage.objects;
create policy ppt_factory_team_style_assets_write on storage.objects
for insert to authenticated
with check (
  bucket_id = 'ppt-factory-style-library'
  and ppt_factory.is_team_member((storage.foldername(name))[1], (storage.foldername(name))[2], array['owner', 'editor'])
);

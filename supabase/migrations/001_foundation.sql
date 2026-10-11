-- Phase 2. Run once through Supabase migrations; never use a service key in the browser.
create table public.households(id uuid primary key default gen_random_uuid(),name text not null check(length(name) between 1 and 80),timezone text not null default 'Europe/Copenhagen');
create table public.users(id uuid primary key references auth.users(id),name text not null);
create table public.household_members(household_id uuid references public.households(id),user_id uuid references public.users(id),role text not null check(role in ('owner','member')),primary key(household_id,user_id));
create table public.household_invites(household_id uuid references public.households(id),email text not null,created_at timestamptz not null default now(),primary key(household_id,email));
create table public.locations(id uuid primary key,household_id uuid not null references public.households(id),name text not null check(length(name) between 1 and 80),independent boolean not null default false,version integer not null default 1,updated_at timestamptz not null default now(),unique(household_id,id));
create unique index location_names on public.locations(household_id,lower(name));
create table public.categories(id uuid primary key,household_id uuid not null references public.households(id),name text not null check(length(name) between 1 and 80),version integer not null default 1,updated_at timestamptz not null default now(),unique(household_id,id));
create unique index category_names on public.categories(household_id,lower(name));
create table public.tasks(id uuid primary key,household_id uuid not null references public.households(id),title text not null check(length(title) between 1 and 160),description text not null default '' check(length(description)<=5000),estimate integer not null check(estimate between 1 and 10080),priority text not null check(priority in ('high','medium','low')),category_id uuid,assignee_id uuid,archived boolean not null default false,created_by uuid not null references public.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),version integer not null default 1,unique(household_id,id),foreign key(household_id,category_id) references public.categories(household_id,id),foreign key(household_id,assignee_id) references public.household_members(household_id,user_id));
create table public.task_locations(household_id uuid not null,task_id uuid not null,location_id uuid not null,primary key(task_id,location_id),foreign key(household_id,task_id) references public.tasks(household_id,id),foreign key(household_id,location_id) references public.locations(household_id,id));
create table public.task_occurrences(id uuid primary key default gen_random_uuid(),household_id uuid not null,task_id uuid not null,start_date date,deadline date,state text not null default 'open' check(state in ('open','running','paused','completed','skipped')),foreign key(household_id,task_id) references public.tasks(household_id,id),check(deadline is null or start_date is null or deadline>=start_date));
create unique index one_open_occurrence on public.task_occurrences(task_id) where state in ('open','running','paused');
create index task_household_idx on public.tasks(household_id,archived);
create index occurrence_dates_idx on public.task_occurrences(household_id,start_date,deadline);
create table public.task_history(id uuid primary key default gen_random_uuid(),household_id uuid not null references public.households(id),task_id uuid references public.tasks(id),actor_id uuid not null references public.users(id),kind text not null,before_value jsonb,after_value jsonb,created_at timestamptz not null default now());
create table public.processed_commands(id uuid primary key,household_id uuid not null references public.households(id),actor_id uuid not null references public.users(id),result jsonb not null,created_at timestamptz not null default now());
create table public.sync_conflicts(id uuid primary key,household_id uuid not null references public.households(id),actor_id uuid not null references public.users(id),command jsonb not null,server_value jsonb,resolution jsonb,resolved_at timestamptz,created_at timestamptz not null default now());

-- Security-definer entry points have a fixed empty search path and explicit membership checks.
create function public.is_member(h uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.household_members where household_id=h and user_id=auth.uid()) $$;
create function public.is_owner(h uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.household_members where household_id=h and user_id=auth.uid() and role='owner') $$;

do $$ declare t text; begin
 foreach t in array array['households','users','household_members','household_invites','locations','categories','tasks','task_locations','task_occurrences','task_history','processed_commands','sync_conflicts'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on table public.%I from anon, authenticated',t);
 execute format('grant select on table public.%I to authenticated',t);
 end loop;
 foreach t in array array['household_members','locations','categories','tasks','task_locations','task_occurrences','task_history'] loop
 execute format('create policy member_read on public.%I for select to authenticated using(public.is_member(household_id))',t);
 end loop;
end $$;
create policy household_read on public.households for select to authenticated using(public.is_member(id));
create policy profile_read on public.users for select to authenticated using(id=auth.uid() or exists(select 1 from public.household_members m where m.user_id=users.id and public.is_member(m.household_id)));
create policy invite_read on public.household_invites for select to authenticated using(public.is_owner(household_id));
create policy commands_read on public.processed_commands for select to authenticated using(actor_id=auth.uid() and public.is_member(household_id));
create policy conflicts_read on public.sync_conflicts for select to authenticated using(actor_id=auth.uid() and public.is_member(household_id));

create function public.my_household() returns jsonb language plpgsql security definer set search_path='' as $$
declare h public.households; mail text; begin
 if auth.uid() is null then raise exception 'Login påkrævet'; end if;
 select email into mail from auth.users where id=auth.uid();
 insert into public.users(id,name) values(auth.uid(),coalesce(split_part(mail,'@',1),'Medlem')) on conflict do nothing;
 insert into public.household_members(household_id,user_id,role) select household_id,auth.uid(),'member' from public.household_invites where lower(email)=lower(mail) and created_at>now()-interval '7 days' on conflict do nothing;
 delete from public.household_invites where lower(email)=lower(mail);
 select hh.* into h from public.households hh join public.household_members m on m.household_id=hh.id where m.user_id=auth.uid() order by hh.id limit 1;
 if h.id is null then return null; end if;
 return jsonb_build_object('id',h.id,'name',h.name,'members',(select jsonb_agg(jsonb_build_object('userId',u.id,'name',u.name,'role',m.role)) from public.household_members m join public.users u on u.id=m.user_id where m.household_id=h.id));
end $$;
create function public.create_household(p_name text) returns uuid language plpgsql security definer set search_path='' as $$
declare h uuid; existing uuid; mail text; begin
 if auth.uid() is null then raise exception 'Login påkrævet';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 select household_id into existing from public.household_members where user_id=auth.uid() limit 1;
 if existing is not null then return existing;end if;
 select email into mail from auth.users where id=auth.uid();
 insert into public.users(id,name) values(auth.uid(),coalesce(split_part(mail,'@',1),'Medlem')) on conflict do nothing;
 insert into public.households(name) values(trim(p_name)) returning id into h;
 insert into public.household_members values(h,auth.uid(),'owner');
 insert into public.locations(id,household_id,name,independent) values(gen_random_uuid(),h,'Hjemme',false),(gen_random_uuid(),h,'Sommerhus',false),(gen_random_uuid(),h,'Andre steder',false),(gen_random_uuid(),h,'Uafhængig af lokation',true);
 insert into public.categories(id,household_id,name) select gen_random_uuid(),h,n from unnest(array['Have','Hus','Bil','Vedligehold','Andet']) n;
 return h;
end $$;
create function public.invite_member(p_household uuid,p_email text) returns void language plpgsql security definer set search_path='' as $$ begin
 if not public.is_owner(p_household) then raise exception 'Kun ejeren kan invitere';end if;
 if p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(p_email)>254 then raise exception 'Ugyldig e-mail';end if;
 insert into public.household_invites(household_id,email) values(p_household,lower(trim(p_email))) on conflict(household_id,email) do update set created_at=now();
end $$;

create function public.task_json(t public.tasks) returns jsonb language sql stable set search_path='' as $$
select jsonb_build_object('id',t.id,'householdId',t.household_id,'title',t.title,'description',t.description,'estimate',t.estimate,'priority',t.priority,'categoryId',t.category_id,'assigneeId',t.assignee_id,'archived',t.archived,'createdBy',t.created_by,'createdAt',t.created_at,'updatedAt',t.updated_at,'version',t.version,'locationIds',coalesce((select jsonb_agg(location_id order by location_id) from public.task_locations where task_id=t.id),'[]'::jsonb),'startDate',coalesce((select start_date::text from public.task_occurrences where task_id=t.id and state in ('open','running','paused')),''),'deadline',coalesce((select deadline::text from public.task_occurrences where task_id=t.id and state in ('open','running','paused')),'')) $$;
create function public.location_json(l public.locations) returns jsonb language sql immutable set search_path='' as $$select jsonb_build_object('id',l.id,'householdId',l.household_id,'name',l.name,'independent',l.independent,'version',l.version,'updatedAt',l.updated_at)$$;
create function public.category_json(c public.categories) returns jsonb language sql immutable set search_path='' as $$select jsonb_build_object('id',c.id,'householdId',c.household_id,'name',c.name,'independent',false,'version',c.version,'updatedAt',c.updated_at)$$;
create function public.household_snapshot(p_household uuid) returns jsonb language plpgsql security definer set search_path='' as $$ begin
 if not public.is_member(p_household) then raise exception 'Ingen adgang til husstanden';end if;
 -- Same lock as writes: a snapshot never mixes task and location revisions.
 perform 1 from public.households where id=p_household for share;
 return jsonb_build_object('tasks',coalesce((select jsonb_agg(public.task_json(t)) from public.tasks t where household_id=p_household),'[]'::jsonb),'locations',(select jsonb_agg(public.location_json(l)) from public.locations l where household_id=p_household),'categories',(select jsonb_agg(public.category_json(c)) from public.categories c where household_id=p_household));
end $$;
create function public.apply_command(p_household uuid,p_command jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare entity text:=p_command->>'entity'; payload jsonb:=p_command->'payload'; eid uuid:=(p_command->>'entityId')::uuid; cid uuid:=(p_command->>'id')::uuid; base integer:=(p_command->>'baseVersion')::integer; current_value jsonb; record_value jsonb; result_value jsonb; next_version integer; loc uuid; old_household uuid; task_row public.tasks;
begin
 if not public.is_member(p_household) then raise exception 'Ingen adgang til husstanden';end if;
 if entity is null or entity not in ('task','location','category') or base is null or base<0 or eid is null or cid is null or payload is null then raise exception 'Ugyldig kommando';end if;
 if (payload->>'householdId')::uuid is distinct from p_household or (payload->>'id')::uuid is distinct from eid then raise exception 'Forkert identitet';end if;
 perform 1 from public.households where id=p_household for update;
 select result into result_value from public.processed_commands where id=cid and household_id=p_household and actor_id=auth.uid();
 if found then return result_value;end if;
 if entity='task' then select household_id,public.task_json(t) into old_household,current_value from public.tasks t where id=eid;
 elsif entity='location' then select household_id,public.location_json(l) into old_household,current_value from public.locations l where id=eid;
 else select household_id,public.category_json(c) into old_household,current_value from public.categories c where id=eid;end if;
 if old_household is not null and old_household<>p_household then raise exception 'Ugyldig identifikation';end if;
 if coalesce((current_value->>'version')::integer,0)<>base then
  result_value:=jsonb_build_object('conflict',true,'current',current_value);
  insert into public.sync_conflicts(id,household_id,actor_id,command,server_value) values(cid,p_household,auth.uid(),p_command,current_value);
 else
  next_version:=base+1;
  if entity='task' then
   if jsonb_typeof(payload->'locationIds') is distinct from 'array' or jsonb_array_length(payload->'locationIds')=0 then raise exception 'Vælg mindst én lokation';end if;
   if length(trim(payload->>'title'))=0 then raise exception 'Titel mangler';end if;
   insert into public.tasks(id,household_id,title,description,estimate,priority,category_id,assignee_id,archived,created_by,version)
   values(eid,p_household,trim(payload->>'title'),payload->>'description',(payload->>'estimate')::integer,payload->>'priority',nullif(payload->>'categoryId','')::uuid,nullif(payload->>'assigneeId','')::uuid,(payload->>'archived')::boolean,auth.uid(),next_version)
   on conflict(id) do update set title=excluded.title,description=excluded.description,estimate=excluded.estimate,priority=excluded.priority,category_id=excluded.category_id,assignee_id=excluded.assignee_id,archived=excluded.archived,updated_at=now(),version=next_version;
   delete from public.task_locations where task_id=eid;
   for loc in select distinct value::uuid from jsonb_array_elements_text(payload->'locationIds') loop insert into public.task_locations values(p_household,eid,loc);end loop;
   if current_value is null then insert into public.task_occurrences(household_id,task_id,start_date,deadline) values(p_household,eid,nullif(payload->>'startDate','')::date,nullif(payload->>'deadline','')::date);
   else update public.task_occurrences set start_date=nullif(payload->>'startDate','')::date,deadline=nullif(payload->>'deadline','')::date where task_id=eid and state in ('open','running','paused');end if;
   select * into task_row from public.tasks where id=eid;record_value:=public.task_json(task_row);
   insert into public.task_history(household_id,task_id,actor_id,kind,before_value,after_value) values(p_household,eid,auth.uid(),case when current_value is null then 'created' else 'edited' end,current_value,record_value);
  elsif entity='location' then
   if current_value is not null and (payload->>'independent')::boolean is distinct from (current_value->>'independent')::boolean then raise exception 'Lokationens type kan ikke ændres';end if;
   insert into public.locations(id,household_id,name,independent,version) values(eid,p_household,trim(payload->>'name'),coalesce((payload->>'independent')::boolean,false),next_version) on conflict(id) do update set name=excluded.name,version=next_version,updated_at=now();
   select public.location_json(l) into record_value from public.locations l where id=eid;
  else
   insert into public.categories(id,household_id,name,version) values(eid,p_household,trim(payload->>'name'),next_version) on conflict(id) do update set name=excluded.name,version=next_version,updated_at=now();
   select public.category_json(c) into record_value from public.categories c where id=eid;
  end if;
  result_value:=jsonb_build_object('conflict',false,'version',next_version,'record',record_value);
 end if;
 insert into public.processed_commands(id,household_id,actor_id,result) values(cid,p_household,auth.uid(),result_value);
 return result_value;
end $$;
-- Explicit allow-list. No direct write privilege and no anonymous RPC access.
revoke all on function public.is_member(uuid),public.is_owner(uuid),public.my_household(),public.create_household(text),public.invite_member(uuid,text),public.task_json(public.tasks),public.location_json(public.locations),public.category_json(public.categories),public.household_snapshot(uuid),public.apply_command(uuid,jsonb) from public,anon;
grant execute on function public.is_member(uuid),public.is_owner(uuid),public.my_household(),public.create_household(text),public.invite_member(uuid,text),public.household_snapshot(uuid),public.apply_command(uuid,jsonb) to authenticated;

create function public.record_conflict_resolution(p_id uuid,p_resolution jsonb) returns void language plpgsql security definer set search_path='' as $$begin
 if not exists(select 1 from public.sync_conflicts where id=p_id and actor_id=auth.uid() and public.is_member(household_id)) then raise exception 'Ingen adgang til konflikten';end if;
 if p_resolution->>'choice' is null or p_resolution->>'choice' not in ('server','local') then raise exception 'Ugyldigt valg';end if;
 update public.sync_conflicts set resolution=p_resolution,resolved_at=now() where id=p_id;
end $$;
revoke all on function public.record_conflict_resolution(uuid,jsonb) from public,anon;
grant execute on function public.record_conflict_resolution(uuid,jsonb) to authenticated;

-- Phase 4: one occurrence per one-off task. Recurrence is a later migration.
-- Keep occurrence identifiers unchanged; the phase-4 work DTO uses task_id as id.
alter table public.task_occurrences add column actor_id uuid references public.users(id), add column version integer not null default 0, add column adjustment_seconds double precision not null default 0, add column remaining_minutes double precision check(remaining_minutes>=0), add column completed_at bigint, add column completed_by uuid references public.users(id), add column updated_at timestamptz not null default now();
create unique index one_running_task_per_user on public.task_occurrences(actor_id) where state='running';
create table public.time_entries(id uuid primary key,occurrence_id uuid not null references public.task_occurrences(id),household_id uuid not null references public.households(id),user_id uuid not null references public.users(id),started_at bigint not null check(started_at>=0),stopped_at bigint check(stopped_at>=started_at));
create unique index one_active_interval on public.time_entries(occurrence_id) where stopped_at is null;
create table public.task_queues(household_id uuid references public.households(id),owner_id uuid references public.users(id),budget_minutes integer not null default 120 check(budget_minutes between 1 and 10080),version integer not null default 0,updated_at timestamptz not null default now(),primary key(household_id,owner_id));
create table public.task_queue_items(household_id uuid not null,owner_id uuid not null,task_id uuid not null,position integer not null,primary key(household_id,owner_id,task_id),foreign key(household_id,owner_id) references public.task_queues(household_id,owner_id),foreign key(household_id,task_id) references public.tasks(household_id,id));
alter table public.time_entries enable row level security;
alter table public.task_queues enable row level security;
alter table public.task_queue_items enable row level security;
revoke all on public.time_entries,public.task_queues,public.task_queue_items from public,anon,authenticated;
grant select on public.time_entries,public.task_queues,public.task_queue_items to authenticated;
create policy member_read on public.time_entries for select to authenticated using(public.is_member(household_id));
create policy personal_read on public.task_queues for select to authenticated using(owner_id=auth.uid() and public.is_member(household_id));
create policy personal_read on public.task_queue_items for select to authenticated using(owner_id=auth.uid() and public.is_member(household_id));

create function public.work_json(o public.task_occurrences) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',o.task_id,'taskId',o.task_id,'householdId',o.household_id,'name',(select title from public.tasks where id=o.task_id),'status',o.state,'actorId',o.actor_id,'intervals',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'userId',e.user_id,'startedAt',e.started_at,'stoppedAt',e.stopped_at) order by e.started_at,coalesce(e.stopped_at,253402300799000),e.id) from public.time_entries e where e.occurrence_id=o.id),'[]'::jsonb),'adjustmentSeconds',o.adjustment_seconds,'remainingMinutes',o.remaining_minutes,'completedAt',o.completed_at,'completedBy',o.completed_by,'version',o.version,'updatedAt',o.updated_at)
$$;
create function public.queue_json(q public.task_queues) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',q.owner_id,'ownerId',q.owner_id,'householdId',q.household_id,'name','Min kø','items',coalesce((select jsonb_agg(task_id order by position) from public.task_queue_items where household_id=q.household_id and owner_id=q.owner_id),'[]'::jsonb),'budgetMinutes',q.budget_minutes,'version',q.version,'updatedAt',q.updated_at)
$$;
alter function public.household_snapshot(uuid) rename to registry_snapshot;
revoke all on function public.registry_snapshot(uuid) from public,anon,authenticated;
create function public.household_snapshot(p_household uuid) returns jsonb language plpgsql security definer set search_path='' as $$
 declare snapshot jsonb; begin
 snapshot:=public.registry_snapshot(p_household);
 return snapshot || jsonb_build_object('works',coalesce((select jsonb_agg(public.work_json(o)) from public.task_occurrences o where household_id=p_household),'[]'::jsonb),'queues',coalesce((select jsonb_agg(public.queue_json(q)) from public.task_queues q where household_id=p_household and owner_id=auth.uid()),'[]'::jsonb));
 end $$;
alter function public.apply_command(uuid,jsonb) rename to apply_registry_command;
revoke all on function public.apply_registry_command(uuid,jsonb) from public,anon,authenticated;
create function public.apply_command(p_household uuid,p_command jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
 declare entity text:=p_command->>'entity'; payload jsonb:=p_command->'payload'; eid uuid:=(p_command->>'entityId')::uuid; cid uuid:=(p_command->>'id')::uuid; base integer:=(p_command->>'baseVersion')::integer; action text:=p_command->>'action'; at_ms bigint:=(p_command->>'at')::bigint; amount double precision:=(p_command->>'value')::double precision; current_value jsonb; record_value jsonb; result_value jsonb; o public.task_occurrences; t public.tasks; q public.task_queues; e public.time_entries; total double precision; blocked boolean:=false; item uuid; pos integer:=0;
 begin
 if not public.is_member(p_household) then raise exception 'Ingen adgang til husstanden';end if;
 perform 1 from public.households where id=p_household for update;
 select result into result_value from public.processed_commands where id=cid and household_id=p_household and actor_id=auth.uid();
 if found then return result_value;end if;
 if entity in ('task','location','category') then
  if entity='task' and coalesce((payload->>'archived')::boolean,false) and exists(select 1 from public.task_occurrences where task_id=eid and household_id=p_household and state='running') then raise exception 'Sæt opgaven på pause før den arkiveres';end if;
  return public.apply_registry_command(p_household,p_command);
 end if;
 if entity is null or entity not in ('work','queue') or cid is null or eid is null or base is null or base<0 or payload is null then raise exception 'Ugyldig kommando';end if;
 if (payload->>'id')::uuid is distinct from eid or (payload->>'householdId')::uuid is distinct from p_household then raise exception 'Forkert identitet';end if;
 if entity='queue' then
  if eid<>auth.uid() or (payload->>'ownerId')::uuid is distinct from auth.uid() then raise exception 'Køen er personlig';end if;
  select * into q from public.task_queues where household_id=p_household and owner_id=auth.uid();
  if found then current_value:=public.queue_json(q);end if;
 else
  select * into t from public.tasks where id=eid and household_id=p_household;
  if not found then raise exception 'Opgaven findes ikke';end if;
  select * into o from public.task_occurrences where task_id=eid and household_id=p_household;
  if not found then raise exception 'Opgavens forekomst mangler';end if;
  current_value:=public.work_json(o);
  if action is null or action not in ('start','pause','complete','skip','correct','remaining') or at_ms is null or at_ms<0 or at_ms>253402300799000 then raise exception 'Ugyldig arbejdshandling';end if;
  select * into e from public.time_entries where occurrence_id=o.id order by (stopped_at is null) desc,started_at desc,stopped_at desc,id desc limit 1;
  select coalesce(sum((coalesce(stopped_at,at_ms)-started_at)/1000.0),0) into total from public.time_entries where occurrence_id=o.id;
  blocked:= (o.state in ('completed','skipped') and action<>'correct') or (o.state='running' and (o.actor_id<>auth.uid() or action in ('start','correct','remaining'))) or (action='pause' and o.state<>'running');
  if action='start' then
   blocked:=blocked or t.archived or (o.start_date is not null and o.start_date>(to_timestamp(at_ms/1000.0) at time zone 'Europe/Copenhagen')::date) or exists(select 1 from public.task_occurrences where actor_id=auth.uid() and state='running') or coalesce(o.remaining_minutes,t.estimate-greatest(0,total+o.adjustment_seconds)/60)<=0;
  end if;
  if action in ('start','pause','complete','skip') and e.id is not null and at_ms<coalesce(e.stopped_at,e.started_at) then blocked:=true;end if;
 end if;
 if coalesce((current_value->>'version')::integer,0)<>base or blocked then
  result_value:=jsonb_build_object('conflict',true,'current',current_value);
  insert into public.sync_conflicts(id,household_id,actor_id,command,server_value) values(cid,p_household,auth.uid(),p_command,current_value);
 else
  if entity='queue' then
   if jsonb_typeof(payload->'items') is distinct from 'array' then raise exception 'Ugyldig kø';end if;
   insert into public.task_queues(household_id,owner_id,budget_minutes,version) values(p_household,auth.uid(),(payload->>'budgetMinutes')::integer,base+1) on conflict(household_id,owner_id) do update set budget_minutes=excluded.budget_minutes,version=excluded.version,updated_at=now();
   -- Validate before replacement, so existing archived items can remain visibly blocked.
   for item in select value::uuid from jsonb_array_elements_text(payload->'items') loop
    select * into t from public.tasks where id=item and household_id=p_household;
    if not found then raise exception 'Opgaven findes ikke i husstanden';end if;
    if t.archived and not exists(select 1 from public.task_queue_items where household_id=p_household and owner_id=auth.uid() and task_id=item) then raise exception 'Gendan opgaven først';end if;
   end loop;
   delete from public.task_queue_items where household_id=p_household and owner_id=auth.uid();
   for item in select value::uuid from jsonb_array_elements_text(payload->'items') loop
    if exists(select 1 from public.task_occurrences where task_id=item and state in ('open','running','paused')) then
     insert into public.task_queue_items values(p_household,auth.uid(),item,pos) on conflict do nothing;pos:=pos+1;
    end if;
   end loop;
   select public.queue_json(v) into record_value from public.task_queues v where household_id=p_household and owner_id=auth.uid();
  else
   if action in ('correct','remaining') and (amount is null or amount='NaN'::float8 or amount<case when action='correct' then 0 else 1 end or amount>case when action='correct' then 525600 else 10080 end) then raise exception 'Ugyldigt minuttal';end if;
   if action='start' then
    insert into public.time_entries values(cid,o.id,p_household,auth.uid(),at_ms,null);o.state:='running';o.actor_id:=auth.uid();
   elsif action in ('pause','complete','skip') then
    if o.state='running' then
     update public.time_entries set stopped_at=at_ms where id=e.id;
     if o.remaining_minutes is not null then o.remaining_minutes:=greatest(0,o.remaining_minutes-(at_ms-e.started_at)/60000.0);end if;
     o.state:='paused';
    end if;
    if action='complete' then o.state:='completed';o.actor_id:=auth.uid();o.completed_at:=at_ms;o.completed_by:=auth.uid();end if;
    if action in ('complete','skip') then
     update public.task_queues qq set updated_at=now() where household_id=p_household and (action='complete' or owner_id=auth.uid()) and exists(select 1 from public.task_queue_items qi where qi.household_id=qq.household_id and qi.owner_id=qq.owner_id and qi.task_id=eid);
     delete from public.task_queue_items where household_id=p_household and task_id=eid and (action='complete' or owner_id=auth.uid());
    end if;
   elsif action='correct' then o.adjustment_seconds:=amount*60-total;
   elsif action='remaining' then o.remaining_minutes:=amount;
   end if;
   update public.task_occurrences set state=o.state,actor_id=o.actor_id,adjustment_seconds=o.adjustment_seconds,remaining_minutes=o.remaining_minutes,completed_at=o.completed_at,completed_by=o.completed_by,version=base+1,updated_at=now() where id=o.id returning * into o;
   record_value:=public.work_json(o);
   insert into public.task_history(household_id,task_id,actor_id,kind,before_value,after_value) values(p_household,eid,auth.uid(),action,current_value,record_value);
  end if;
  result_value:=jsonb_build_object('conflict',false,'version',base+1,'record',record_value);
 end if;
 insert into public.processed_commands(id,household_id,actor_id,result) values(cid,p_household,auth.uid(),result_value);
 return result_value;
 end $$;
revoke all on function public.work_json(public.task_occurrences),public.queue_json(public.task_queues),public.household_snapshot(uuid),public.apply_command(uuid,jsonb) from public,anon;
grant execute on function public.household_snapshot(uuid),public.apply_command(uuid,jsonb) to authenticated;

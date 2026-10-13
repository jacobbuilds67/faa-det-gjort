-- Versioned recurrence rules and immutable occurrence identities. Existing IDs are retained.
create table public.recurrence_rules(id uuid primary key default gen_random_uuid(),household_id uuid not null,task_id uuid not null,version integer not null,rule jsonb,created_at timestamptz not null default now(),unique(task_id,version),foreign key(household_id,task_id) references public.tasks(household_id,id));
alter table public.recurrence_rules enable row level security;
revoke all on public.recurrence_rules from public,anon,authenticated;
grant select on public.recurrence_rules to authenticated;
create policy member_read on public.recurrence_rules for select to authenticated using(public.is_member(household_id));
alter table public.task_occurrences add column public_id uuid,add column is_current boolean not null default true,add column rule_snapshot jsonb,add column task_snapshot jsonb,add column missed_periods jsonb not null default '[]';
update public.task_occurrences set public_id=task_id;
alter table public.task_occurrences alter column public_id set not null;
-- The foundation creates the first occurrence without a public ID; the wrapper sets task_id atomically.
alter table public.task_occurrences alter column public_id set default gen_random_uuid();
create unique index occurrence_public_identity on public.task_occurrences(public_id);
create unique index one_current_occurrence on public.task_occurrences(task_id) where is_current;
alter table public.task_queue_items add column occurrence_id uuid references public.task_occurrences(public_id);
update public.task_queue_items set occurrence_id=task_id;

create function public.annual_day(y integer,md text) returns date language sql immutable set search_path='' as $$select make_date(y,split_part(md,'-',1)::integer,least(split_part(md,'-',2)::integer,extract(day from (make_date(y,split_part(md,'-',1)::integer,1)+interval '1 month -1 day'))::integer))$$;
create function public.validate_recurrence(r jsonb) returns void language plpgsql set search_path='' as $$
 declare k text:=r->>'kind'; a date; v integer; p jsonb; q jsonb; s date; e date; last_end date; begin
 if r is null or r='null'::jsonb then return;end if;
 if jsonb_typeof(r)<>'object' or k is null or k not in ('interval','weekdays','season') or r->>'anchor' is null or (r->>'anchor')!~'^\d{4}-\d{2}-\d{2}$' then raise exception 'Ugyldig gentagelse';end if;
 a:=(r->>'anchor')::date;
 if a<date '1900-01-01' or a>date '9500-01-01' then raise exception 'Gentagelsens dato er uden for det understøttede interval';end if;
 if k in ('interval','weekdays') then
  if jsonb_typeof(r->'every') is distinct from 'number' or (r->>'every')::numeric<>trunc((r->>'every')::numeric) then raise exception 'Ugyldigt interval';end if;
  v:=(r->>'every')::integer;if v<1 or v>(case when k='weekdays' then 52 else 365 end) then raise exception 'Ugyldigt interval';end if;
  if jsonb_typeof(r->'months') is distinct from 'array' or jsonb_array_length(r->'months') not between 1 and 12 then raise exception 'Vælg aktive måneder';end if;
  for p in select value from jsonb_array_elements(r->'months') loop if jsonb_typeof(p)<>'number' or p::text::numeric<>trunc(p::text::numeric) or p::text::integer not between 1 and 12 then raise exception 'Ugyldig måned';end if;end loop;
  if k='interval' then
   if r->>'mode' is null or r->>'mode' not in ('calendar','completion') or r->>'unit' is null or r->>'unit' not in ('day','week','month','year') then raise exception 'Ugyldig intervaltype';end if;
  else
   if jsonb_typeof(r->'days') is distinct from 'array' or jsonb_array_length(r->'days') not between 1 and 7 then raise exception 'Vælg ugedage';end if;
   for p in select value from jsonb_array_elements(r->'days') loop if jsonb_typeof(p)<>'number' or p::text::numeric<>trunc(p::text::numeric) or p::text::integer not between 1 and 7 then raise exception 'Ugyldig ugedag';end if;end loop;
  end if;
 else
  if jsonb_typeof(r->'periods') is distinct from 'array' or jsonb_array_length(r->'periods') not between 1 and 12 then raise exception 'Vælg sæsonperioder';end if;
  for p in select value from jsonb_array_elements(r->'periods') loop
   if p->>'start' is null or p->>'end' is null or (p->>'start')!~'^\d{2}-\d{2}$' or (p->>'end')!~'^\d{2}-\d{2}$' then raise exception 'Ugyldig sæsondato';end if;
   s:=('2000-'||(p->>'start'))::date;e:=('2000-'||(p->>'end'))::date;
  end loop;
  for q in select jsonb_build_object('s',public.annual_day(yr,period_item->>'start'),'e',public.annual_day(yr+case when period_item->>'end'<period_item->>'start' then 1 else 0 end,period_item->>'end')) from generate_series(2000,2002) yr cross join jsonb_array_elements(r->'periods') period_item order by public.annual_day(yr,period_item->>'start') loop
   if last_end is not null and (q->>'s')::date<=last_end then raise exception 'Sæsonperioder må ikke overlappe';end if;last_end:=(q->>'e')::date;
  end loop;
 end if;
 end $$;
create function public.recurrence_period(r jsonb,previous_date date,finished_date date) returns jsonb language plpgsql set search_path='' as $$
 declare anchor_date date:=(r->>'anchor')::date; k text:=r->>'kind'; candidate date; ending date; threshold date; base date; step integer:=(r->>'every')::integer; n integer; y integer; p jsonb; missed jsonb:='[]'; week_number integer; begin
 if k='season' then
  for y in select generate_series(extract(year from coalesce(previous_date,anchor_date))::integer-case when previous_date is null then 1 else 0 end,greatest(extract(year from coalesce(finished_date,anchor_date))::integer,extract(year from anchor_date)::integer,extract(year from previous_date)::integer)+1) loop
   for p in select value from jsonb_array_elements(r->'periods') order by value->>'start' loop
    candidate:=public.annual_day(y,p->>'start');ending:=public.annual_day(y+case when p->>'end'<p->>'start' then 1 else 0 end,p->>'end');
    if ending<anchor_date or (previous_date is not null and candidate<=previous_date) then continue;end if;
    if finished_date is not null and ending<finished_date then missed:=missed||jsonb_build_array(jsonb_build_object('startDate',candidate,'deadline',ending));continue;end if;
    return jsonb_build_object('period',jsonb_build_object('startDate',candidate,'deadline',ending),'missed',missed);
   end loop;
  end loop;
 else
  threshold:=greatest(previous_date,finished_date,anchor_date-1);base:=anchor_date;
  if k='interval' and r->>'mode'='completion' and previous_date is not null then
   base:=greatest(anchor_date,(greatest(previous_date,finished_date)+(step::text||' '||(r->>'unit'))::interval)::date);threshold:=base-1;
  end if;
  for n in 0..146400 loop
   if k='interval' then candidate:=(base+((n::bigint*step)::text||' '||(r->>'unit'))::interval)::date;
   else candidate:=greatest(anchor_date,threshold)+n;end if;
   if candidate>threshold+interval '400 years' then exit;end if;
   if candidate<=threshold or not (r->'months' @> to_jsonb(array[extract(month from candidate)::integer])) then continue;end if;
   if k='weekdays' then
    week_number:=floor((candidate-(anchor_date-(extract(isodow from anchor_date)::integer-1)))/7.0)::integer;
    if week_number%step<>0 or not (r->'days' @> to_jsonb(array[extract(isodow from candidate)::integer])) then continue;end if;
   end if;
   return jsonb_build_object('period',jsonb_build_object('startDate',candidate,'deadline',candidate),'missed','[]'::jsonb);
  end loop;
 end if;
 raise exception 'Gentagelsen giver ingen dato inden for 400 år';
 end $$;

alter function public.task_json(public.tasks) rename to task_json_v4;
create function public.task_json(t public.tasks) returns jsonb language sql stable set search_path='' as $$select public.task_json_v4(t)||jsonb_build_object('recurrence',(select rule from public.recurrence_rules where task_id=t.id order by version desc limit 1))$$;
alter function public.work_json(public.task_occurrences) rename to work_json_v4;
create function public.work_json(o public.task_occurrences) returns jsonb language sql stable set search_path='' as $$select public.work_json_v4(o)||jsonb_build_object('occurrenceId',o.public_id,'plannedStart',coalesce(o.start_date::text,''),'plannedDeadline',coalesce(o.deadline::text,''),'ruleSnapshot',o.rule_snapshot,'taskSnapshot',o.task_snapshot,'missedPeriods',o.missed_periods)$$;
create function public.history_json(o public.task_occurrences) returns jsonb language sql stable set search_path='' as $$select public.work_json(o)||jsonb_build_object('id',o.public_id)$$;
alter function public.queue_json(public.task_queues) rename to queue_json_v4;
create function public.queue_json(q public.task_queues) returns jsonb language sql stable set search_path='' as $$select public.queue_json_v4(q)||jsonb_build_object('occurrenceIds',coalesce((select jsonb_object_agg(task_id,occurrence_id) from public.task_queue_items where household_id=q.household_id and owner_id=q.owner_id),'{}'))$$;
-- Freeze the best available task details for pre-existing completed work.
update public.task_occurrences occ set task_snapshot=public.task_json(t) from public.tasks t where occ.task_id=t.id and occ.state in ('completed','skipped');
create or replace function public.household_snapshot(p_household uuid) returns jsonb language plpgsql security definer set search_path='' as $$declare snapshot jsonb;begin
 snapshot:=public.registry_snapshot(p_household);
 return snapshot||jsonb_build_object('works',coalesce((select jsonb_agg(public.work_json(o)) from public.task_occurrences o where household_id=p_household and is_current),'[]'),'history',coalesce((select jsonb_agg(public.history_json(o)) from public.task_occurrences o where household_id=p_household and state in ('completed','skipped')),'[]'),'queues',coalesce((select jsonb_agg(public.queue_json(q)) from public.task_queues q where household_id=p_household and owner_id=auth.uid()),'[]'));
 end $$;

-- Retain phase-4 transition validation, selecting only the current occurrence.
create function public.apply_phase4_command(p_household uuid,p_command jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
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
  select * into o from public.task_occurrences where task_id=eid and household_id=p_household and is_current;
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
create or replace function public.apply_command(p_household uuid,p_command jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
 declare entity text:=p_command->>'entity';eid uuid:=(p_command->>'entityId')::uuid;cid uuid:=(p_command->>'id')::uuid;payload jsonb:=p_command->'payload';action text:=p_command->>'action';result_value jsonb;current_value jsonb;r jsonb;old_rule jsonb;period jsonb;prev public.task_occurrences;o public.task_occurrences;t public.tasks;rule_version integer;next_id uuid;forward jsonb:=p_command;items jsonb:='[]';item uuid;history_value jsonb:='[]';amount double precision;total double precision;begin
 if not public.is_member(p_household) then raise exception 'Ingen adgang til husstanden';end if;
 perform 1 from public.households where id=p_household for update;
 select result into result_value from public.processed_commands where id=cid and household_id=p_household and actor_id=auth.uid();if found then return result_value;end if;
 if entity='task' then
  r:=nullif(payload->'recurrence','null'::jsonb);perform public.validate_recurrence(r);
  select rule,version into old_rule,rule_version from public.recurrence_rules where task_id=eid order by version desc limit 1;
  select * into prev from public.task_occurrences where task_id=eid and household_id=p_household and is_current;
  if r is distinct from old_rule and prev.state in ('completed','skipped') then raise exception 'Opret en ny opgave med gentagelse; historikken bevares';end if;
  if r is not null then period:=public.recurrence_period(r,null,null);end if;
  result_value:=public.apply_phase4_command(p_household,p_command);
  if not (result_value->>'conflict')::boolean then
   if r is distinct from old_rule then insert into public.recurrence_rules(household_id,task_id,version,rule) values(p_household,eid,coalesce(rule_version,0)+1,r);end if;
   if prev.id is null then update public.task_occurrences set public_id=eid where task_id=eid and is_current;end if;
   if r is not null and (prev.id is null or (r is distinct from old_rule and prev.state='open' and not exists(select 1 from public.time_entries where occurrence_id=prev.id))) then
    update public.task_occurrences set start_date=(period->'period'->>'startDate')::date,deadline=(period->'period'->>'deadline')::date,rule_snapshot=r where task_id=eid and is_current;
   elsif prev.id is not null and (prev.rule_snapshot is not null or exists(select 1 from public.time_entries where occurrence_id=prev.id)) then
    update public.task_occurrences set start_date=prev.start_date,deadline=prev.deadline where id=prev.id;
   end if;
   if r is null and r is distinct from old_rule and prev.state='open' and not exists(select 1 from public.time_entries where occurrence_id=prev.id) then update public.task_occurrences set rule_snapshot=null,start_date=nullif(payload->>'startDate','')::date,deadline=nullif(payload->>'deadline','')::date where id=prev.id;end if;
   select * into t from public.tasks where id=eid;select * into o from public.task_occurrences where task_id=eid and is_current;
   result_value:=result_value||jsonb_build_object('record',public.task_json(t),'work',public.work_json(o));
  end if;
 elsif entity='queue' then
  -- Queues are bound to a specific occurrence, never automatically to its successor.
  if jsonb_typeof(payload->'items') is distinct from 'array' then raise exception 'Ugyldig kø';end if;
  for item in select value::uuid from jsonb_array_elements_text(payload->'items') loop
   if not exists(select 1 from public.tasks where id=item and household_id=p_household) then raise exception 'Opgaven findes ikke i husstanden';end if;
   if exists(select 1 from public.task_occurrences where task_id=item and household_id=p_household and is_current and state in ('open','paused','running') and public_id=coalesce((payload->'occurrenceIds'->>item::text)::uuid,item)) then items:=items||to_jsonb(item);end if;
  end loop;
  forward:=jsonb_set(p_command,'{payload,items}',items);result_value:=public.apply_phase4_command(p_household,forward);
  if not (result_value->>'conflict')::boolean then
   update public.task_queue_items qi set occurrence_id=occ.public_id from public.task_occurrences occ where qi.household_id=p_household and qi.owner_id=auth.uid() and occ.task_id=qi.task_id and occ.is_current;
   select public.queue_json(q) into current_value from public.task_queues q where household_id=p_household and owner_id=auth.uid();result_value:=result_value||jsonb_build_object('record',current_value);
  end if;
 elsif entity='history' then
  select * into o from public.task_occurrences where public_id=eid and household_id=p_household and state in ('completed','skipped');
  if not found or action is distinct from 'correct' or (payload->>'id')::uuid is distinct from eid or (payload->>'householdId')::uuid is distinct from p_household then raise exception 'Ugyldig historikrettelse';end if;
  current_value:=public.history_json(o);amount:=(p_command->>'value')::double precision;
  if amount is null or amount='NaN'::float8 or amount<0 or amount>525600 then raise exception 'Ugyldigt minuttal';end if;
  if (p_command->>'baseVersion')::integer is distinct from o.version then
   result_value:=jsonb_build_object('conflict',true,'current',current_value);insert into public.sync_conflicts(id,household_id,actor_id,command,server_value) values(cid,p_household,auth.uid(),p_command,current_value);
  else
   select coalesce(sum((stopped_at-started_at)/1000.0),0) into total from public.time_entries where occurrence_id=o.id;
   update public.task_occurrences set adjustment_seconds=amount*60-total,version=version+1,updated_at=now() where id=o.id returning * into o;
   insert into public.task_history(household_id,task_id,actor_id,kind,before_value,after_value) values(p_household,o.task_id,auth.uid(),'correct',current_value,public.history_json(o));
   result_value:=jsonb_build_object('conflict',false,'version',o.version,'record',public.history_json(o));
  end if;
  insert into public.processed_commands(id,household_id,actor_id,result) values(cid,p_household,auth.uid(),result_value);
 elsif entity='work' then
  select * into prev from public.task_occurrences where task_id=eid and household_id=p_household and is_current;
  if not found then raise exception 'Opgaven findes ikke';end if;
  if coalesce((p_command->>'occurrenceId')::uuid,eid)<>prev.public_id then
   result_value:=jsonb_build_object('conflict',true,'current',public.work_json(prev));insert into public.sync_conflicts(id,household_id,actor_id,command,server_value) values(cid,p_household,auth.uid(),p_command,public.work_json(prev));insert into public.processed_commands(id,household_id,actor_id,result) values(cid,p_household,auth.uid(),result_value);return result_value;
  end if;
  select rule into r from public.recurrence_rules where task_id=eid order by version desc limit 1;
  if action='skipOccurrence' then
   if r is null then raise exception 'Opgaven gentages ikke';end if;
   forward:=jsonb_set(p_command,'{action}','"complete"');
  end if;
  if action in ('complete','skipOccurrence') and r is not null then
   next_id:=(p_command->>'nextOccurrenceId')::uuid;if next_id is null then raise exception 'Genindlæs appen før gentagelsen afsluttes';end if;
   period:=public.recurrence_period(r,coalesce(prev.start_date,(to_timestamp((p_command->>'at')::bigint/1000.0) at time zone 'Europe/Copenhagen')::date),(to_timestamp((p_command->>'at')::bigint/1000.0) at time zone 'Europe/Copenhagen')::date);
  end if;
  result_value:=public.apply_phase4_command(p_household,forward);
  if not (result_value->>'conflict')::boolean then
   select * into t from public.tasks where id=eid;
   if action in ('complete','skipOccurrence') then
    update public.task_occurrences set state=case when action='skipOccurrence' then 'skipped' else state end,task_snapshot=public.task_json(t),missed_periods=coalesce(period->'missed','[]'::jsonb) where id=prev.id returning * into o;
    if r is not null then
     update public.task_occurrences set is_current=false where id=o.id;
     insert into public.task_occurrences(household_id,task_id,start_date,deadline,version,public_id,rule_snapshot) values(p_household,eid,(period->'period'->>'startDate')::date,(period->'period'->>'deadline')::date,o.version,next_id,r);
    end if;
    history_value:=jsonb_build_array(public.history_json(o));
    -- Store the actual terminal status and rule rather than the translated phase-4 action.
    update public.task_history set kind=action,after_value=public.history_json(o) where id=(select id from public.task_history where task_id=eid and actor_id=auth.uid() and kind='complete' order by created_at desc,id desc limit 1);
   elsif action='correct' and prev.state in ('completed','skipped') then
    select * into o from public.task_occurrences where id=prev.id;history_value:=jsonb_build_array(public.history_json(o));
   end if;
   select * into o from public.task_occurrences where task_id=eid and is_current;
   result_value:=result_value||jsonb_build_object('record',public.work_json(o),'history',history_value);
  else update public.sync_conflicts set command=p_command where id=cid;end if;
 else return public.apply_phase4_command(p_household,p_command);
 end if;
 update public.processed_commands set result=result_value where id=cid and actor_id=auth.uid() and household_id=p_household;
 return result_value;
 end $$;
revoke all on function public.annual_day(integer,text),public.validate_recurrence(jsonb),public.recurrence_period(jsonb,date,date),public.task_json(public.tasks),public.work_json(public.task_occurrences),public.history_json(public.task_occurrences),public.queue_json(public.task_queues),public.apply_phase4_command(uuid,jsonb) from public,anon,authenticated;
-- Previous helper functions were already private. Public entry points retain their grants.

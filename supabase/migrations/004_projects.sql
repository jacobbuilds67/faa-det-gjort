-- Phase 6: projects and an acyclic task dependency graph.
create table public.projects(
 id uuid primary key,
 household_id uuid not null references public.households(id),
 name text not null check(length(trim(name)) between 1 and 120),
 description text not null default '' check(length(description)<=3000),
 archived boolean not null default false,
 version integer not null default 1,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(household_id,id)
);
create unique index project_names on public.projects(household_id,lower(name));
alter table public.tasks add column project_id uuid;
alter table public.tasks add foreign key(household_id,project_id) references public.projects(household_id,id);
create table public.task_dependencies(
 household_id uuid not null,
 task_id uuid not null,
 depends_on_task_id uuid not null,
 primary key(task_id,depends_on_task_id),
 check(task_id<>depends_on_task_id),
 foreign key(household_id,task_id) references public.tasks(household_id,id) on delete cascade,
 foreign key(household_id,depends_on_task_id) references public.tasks(household_id,id)
);
alter table public.projects enable row level security;
alter table public.task_dependencies enable row level security;
revoke all on public.projects,public.task_dependencies from public,anon,authenticated;
grant select on public.projects,public.task_dependencies to authenticated;
create policy member_read on public.projects for select to authenticated using(public.is_member(household_id));
create policy member_read on public.task_dependencies for select to authenticated using(public.is_member(household_id));

create function public.project_json(p public.projects) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',p.id,'householdId',p.household_id,'name',p.name,'description',p.description,'archived',p.archived,'version',p.version,'createdAt',p.created_at,'updatedAt',p.updated_at)
$$;
alter function public.task_json(public.tasks) rename to task_json_phase5;
create function public.task_json(t public.tasks) returns jsonb language sql stable set search_path='' as $$
 select public.task_json_phase5(t)||jsonb_build_object(
  'projectId',t.project_id,
  'dependencyIds',coalesce((select jsonb_agg(depends_on_task_id order by depends_on_task_id) from public.task_dependencies where task_id=t.id),'[]'::jsonb)
 )
$$;
alter function public.household_snapshot(uuid) rename to household_snapshot_phase5;
create function public.household_snapshot(p_household uuid) returns jsonb language plpgsql security definer set search_path='' as $$
 declare snapshot jsonb;begin
 snapshot:=public.household_snapshot_phase5(p_household);
 return snapshot||jsonb_build_object('projects',coalesce((select jsonb_agg(public.project_json(p)) from public.projects p where household_id=p_household),'[]'::jsonb));
 end
$$;

alter function public.apply_command(uuid,jsonb) rename to apply_phase5_command;
create function public.apply_command(p_household uuid,p_command jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
 declare entity text:=p_command->>'entity';payload jsonb:=p_command->'payload';eid uuid:=(p_command->>'entityId')::uuid;cid uuid:=(p_command->>'id')::uuid;base integer:=(p_command->>'baseVersion')::integer;current_value jsonb;result_value jsonb;record_value jsonb;next_version integer;dep uuid;t public.tasks;p public.projects;has_cycle boolean;begin
 if not public.is_member(p_household) then raise exception 'Ingen adgang til husstanden';end if;
 perform 1 from public.households where id=p_household for update;
 select result into result_value from public.processed_commands where id=cid and household_id=p_household and actor_id=auth.uid();if found then return result_value;end if;
 if entity='project' then
  if cid is null or eid is null or base is null or base<0 or payload is null or (payload->>'id')::uuid is distinct from eid or (payload->>'householdId')::uuid is distinct from p_household then raise exception 'Ugyldig projektkommando';end if;
  select public.project_json(v) into current_value from public.projects v where id=eid;
  if coalesce((current_value->>'version')::integer,0)<>base then
   result_value:=jsonb_build_object('conflict',true,'current',current_value);
   insert into public.sync_conflicts(id,household_id,actor_id,command,server_value) values(cid,p_household,auth.uid(),p_command,current_value);
  else
   next_version:=base+1;
   insert into public.projects(id,household_id,name,description,archived,version) values(eid,p_household,trim(payload->>'name'),coalesce(payload->>'description',''),coalesce((payload->>'archived')::boolean,false),next_version)
   on conflict(id) do update set name=excluded.name,description=excluded.description,archived=excluded.archived,version=next_version,updated_at=now();
   select public.project_json(v) into record_value from public.projects v where id=eid;
   result_value:=jsonb_build_object('conflict',false,'version',next_version,'record',record_value);
  end if;
  insert into public.processed_commands(id,household_id,actor_id,result) values(cid,p_household,auth.uid(),result_value);
  return result_value;
 end if;
 if entity='work' and p_command->>'action' in ('start','complete') and exists(
  select 1 from public.task_dependencies d left join public.task_occurrences o on o.task_id=d.depends_on_task_id and o.is_current
  where d.task_id=eid and d.household_id=p_household and coalesce(o.state,'open')<>'completed'
 ) then
  select public.work_json(o) into current_value from public.task_occurrences o where o.task_id=eid and o.is_current;
  result_value:=jsonb_build_object('conflict',true,'current',current_value);
  insert into public.sync_conflicts(id,household_id,actor_id,command,server_value) values(cid,p_household,auth.uid(),p_command,current_value);
  insert into public.processed_commands(id,household_id,actor_id,result) values(cid,p_household,auth.uid(),result_value);
  return result_value;
 end if;
 result_value:=public.apply_phase5_command(p_household,p_command);
 if entity='task' and not (result_value->>'conflict')::boolean then
  if nullif(payload->>'projectId','') is not null and not exists(select 1 from public.projects where id=(payload->>'projectId')::uuid and household_id=p_household) then raise exception 'Projektet findes ikke';end if;
  update public.tasks set project_id=nullif(payload->>'projectId','')::uuid where id=eid and household_id=p_household;
  delete from public.task_dependencies where task_id=eid;
  if payload?'dependencyIds' then
   if jsonb_typeof(payload->'dependencyIds')<>'array' or jsonb_array_length(payload->'dependencyIds')>100 then raise exception 'Ugyldige afhængigheder';end if;
   for dep in select distinct value::uuid from jsonb_array_elements_text(payload->'dependencyIds') loop
    if not exists(select 1 from public.tasks where id=dep and household_id=p_household) then raise exception 'Afhængigheden findes ikke';end if;
    insert into public.task_dependencies values(p_household,eid,dep);
   end loop;
  end if;
  with recursive walk(node,path,cycle) as (
   select d.depends_on_task_id,array[d.task_id,d.depends_on_task_id],d.task_id=d.depends_on_task_id from public.task_dependencies d where d.task_id=eid
   union all
   select d.depends_on_task_id,w.path||d.depends_on_task_id,d.depends_on_task_id=any(w.path) from walk w join public.task_dependencies d on d.task_id=w.node where not w.cycle
  ) select coalesce(bool_or(cycle),false) into has_cycle from walk;
  if has_cycle then raise exception 'Afhængigheder må ikke danne en cirkel';end if;
  select * into t from public.tasks where id=eid;
  record_value:=public.task_json(t);
  result_value:=result_value||jsonb_build_object('record',record_value);
  update public.processed_commands set result=result_value where id=cid and household_id=p_household and actor_id=auth.uid();
  update public.task_history set after_value=record_value where id=(select id from public.task_history where task_id=eid order by created_at desc,id desc limit 1);
 end if;
 return result_value;
 end
$$;
revoke all on function public.project_json(public.projects),public.task_json_phase5(public.tasks),public.household_snapshot_phase5(uuid),public.apply_phase5_command(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.household_snapshot(uuid),public.apply_command(uuid,jsonb) from public,anon;
grant execute on function public.household_snapshot(uuid),public.apply_command(uuid,jsonb) to authenticated;

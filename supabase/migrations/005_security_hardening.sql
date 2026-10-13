-- Supabase's optional automatic-RLS event trigger creates this helper as SECURITY DEFINER.
-- The DDL event trigger does not need API roles to execute the function directly.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke all on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end
$$;

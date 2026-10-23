-- =====================================================================
-- LIMPEZA DO PROJETO ANTIGO — rode UMA vez, ANTES do schema.sql da plataforma VA
-- Apaga TUDO o que foi criado no schema "public": views, tabelas (com dados),
-- funções, tipos e sequências. Também remove gatilhos antigos que chamavam
-- essas funções (ex.: gatilho em auth.users que criava perfil no cadastro).
-- NÃO mexe em: usuários do Authentication, Storage, extensões e schemas internos.
-- =====================================================================

do $$
declare r record;
begin
  -- views e views materializadas
  for r in
    select c.oid, n.nspname, c.relname, c.relkind
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('v','m')
       and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e')
  loop
    if r.relkind = 'm' then
      execute format('drop materialized view if exists %I.%I cascade', r.nspname, r.relname);
    else
      execute format('drop view if exists %I.%I cascade', r.nspname, r.relname);
    end if;
  end loop;

  -- tabelas (dados, políticas RLS, gatilhos e índices vão junto)
  for r in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r','p')
       and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e')
  loop
    execute format('drop table if exists public.%I cascade', r.relname);
  end loop;

  -- sequências avulsas
  for r in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'S'
       and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e')
  loop
    execute format('drop sequence if exists public.%I cascade', r.relname);
  end loop;

  -- funções e procedures (as de extensões ficam)
  for r in
    select p.oid::regprocedure as assinatura, p.prokind
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    if r.prokind = 'p' then
      execute format('drop procedure if exists %s cascade', r.assinatura);
    elsif r.prokind = 'a' then
      execute format('drop aggregate if exists %s cascade', r.assinatura);
    else
      execute format('drop function if exists %s cascade', r.assinatura);
    end if;
  end loop;

  -- tipos (enums, compostos, domínios)
  for r in
    select t.typname from pg_type t join pg_namespace n on n.oid = t.typnamespace
     where n.nspname = 'public' and t.typtype in ('e','c','d')
       and (t.typrelid = 0 or (select relkind from pg_class where oid = t.typrelid) = 'c')
       and not exists (select 1 from pg_depend d where d.objid = t.oid and d.deptype = 'e')
  loop
    execute format('drop type if exists public.%I cascade', r.typname);
  end loop;
end $$;

-- Conferência: deve listar 0 objetos
select 'restou' as status, count(*) as objetos
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind in ('r','p','v','m','S');

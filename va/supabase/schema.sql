-- =====================================================================
-- Plataforma VA — schema completo
--   NÚCLEO (compartilhado): perfis, acesso por módulo, fazendas, retiros, áreas
--   MÓDULO PEC (VApec):     pec_categorias, pec_movimentacoes, pec_transferencias, pec_sugestoes
-- Próximos módulos (agri, estoque, financeiro) entram com o prefixo próprio.
-- Execute num projeto Supabase novo. Pode ser executado mais de uma vez.
-- =====================================================================

create extension if not exists pgcrypto;

-- =====================================================================
-- NÚCLEO
-- =====================================================================

-- Usuários da plataforma. "administrador" = acesso total a todos os módulos.
create table if not exists public.perfis (
  id             uuid primary key references auth.users(id) on delete cascade,
  nome           text not null,
  email          text not null,
  administrador  boolean not null default false,
  ativo          boolean not null default true,
  criado_por     uuid references auth.users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Acesso de cada usuário a cada módulo, com o papel naquele módulo.
--   pec:        analista (vínculo por fazenda) | capataz (vínculo por retiro)
--   agri:       analista (fazenda)             | operador (retiro)
--   estoque:    analista (fazenda)             | almoxarife (fazenda)
--   financeiro: analista (fazenda)             | operador (fazenda)
create table if not exists public.usuario_modulos (
  usuario_id  uuid not null references public.perfis(id) on delete cascade,
  modulo      text not null check (modulo in ('pec','agri','estoque','financeiro')),
  papel       text not null,
  permissoes  jsonb not null default '{}'::jsonb,
  ativo       boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (usuario_id, modulo)
);

create table if not exists public.fazendas (
  id              uuid primary key default gen_random_uuid(),
  nome            text not null,
  proprietario    text,
  responsavel     text,
  municipio       text,
  ciclo_pecuario  text check (ciclo_pecuario in ('cria','recria','engorda','ciclo_completo')),
  habilitada      boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.retiros (
  id          uuid primary key default gen_random_uuid(),
  fazenda_id  uuid not null references public.fazendas(id) on delete cascade,
  nome        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists retiros_fazenda_idx on public.retiros(fazenda_id);

-- Vínculos por módulo (o nível depende do papel)
create table if not exists public.usuario_fazendas (
  usuario_id  uuid not null references public.perfis(id) on delete cascade,
  modulo      text not null,
  fazenda_id  uuid not null references public.fazendas(id) on delete cascade,
  primary key (usuario_id, modulo, fazenda_id)
);
create table if not exists public.usuario_retiros (
  usuario_id  uuid not null references public.perfis(id) on delete cascade,
  modulo      text not null,
  retiro_id   uuid not null references public.retiros(id) on delete cascade,
  primary key (usuario_id, modulo, retiro_id)
);

-- Áreas geográficas: piquetes (pecuária) e talhões (agricultura) num cadastro único.
-- tipo 'agrupamento' = talhões agrícolas agrupados na entressafra (ILP) para uso da pecuária;
-- "membros" guarda os ids dos talhões; vale de data_inicio até ser encerrado.
create table if not exists public.areas (
  id                  uuid primary key default gen_random_uuid(),
  fazenda_id          uuid not null references public.fazendas(id) on delete cascade,
  retiro_id           uuid not null references public.retiros(id) on delete cascade,
  nome                text not null,
  departamento        text not null check (departamento in ('pecuaria','agricultura')),
  tipo                text not null default 'area' check (tipo in ('area','agrupamento')),
  membros             jsonb not null default '[]'::jsonb,
  especie_forrageira  text,
  area_ha             numeric(12,4),
  geometria           jsonb,           -- GeoJSON (Polygon / MultiPolygon) em WGS84
  data_inicio         date,
  data_fim            date,
  ativo               boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists areas_fazenda_idx on public.areas(fazenda_id);
create index if not exists areas_updated_idx on public.areas(updated_at);
create unique index if not exists areas_nome_unico on public.areas(retiro_id, nome) where tipo = 'area';

-- =====================================================================
-- MÓDULO PEC (VApec)
-- =====================================================================

-- fazenda_id nulo = categoria padrão (vale para todas as fazendas)
create table if not exists public.pec_categorias (
  id          uuid primary key default gen_random_uuid(),
  fazenda_id  uuid references public.fazendas(id) on delete cascade,
  nome        text not null,
  sexo        text check (sexo in ('M','F','misto')),
  ua          numeric(6,3) not null default 1,
  ordem       int not null default 100,
  codigo      text,
  ativo       boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- "itens" = [{ "categoria_id": uuid, "quantidade": int }]
-- piquete_id aponta para uma área de pecuária (piquete ou agrupamento).
-- compra/venda/abate: registros comerciais, sem retiro/piquete e sem efeito no estoque;
-- "vinculos" guarda os ids das entradas/saídas de campo a que se referem.
create table if not exists public.pec_movimentacoes (
  id                    uuid primary key default gen_random_uuid(),
  fazenda_id            uuid not null references public.fazendas(id) on delete cascade,
  retiro_id             uuid references public.retiros(id),
  piquete_id            uuid references public.areas(id),
  tipo                  text not null check (tipo in (
                          'nascimento','morte','entrada','saida','mudanca_piquete',
                          'compra','venda','abate','mudanca_categoria','ajuste')),
  data                  date not null,
  itens                 jsonb not null default '[]'::jsonb,
  piquete_destino_id    uuid references public.areas(id),
  categoria_destino_id  uuid references public.pec_categorias(id),
  modo                  text check (modo in ('total','parcial')),
  sexo                  text,
  raca                  text,
  carimbo               text,
  tratamentos           text,
  causa                 text,
  motivo                text,
  vinculos              jsonb not null default '[]'::jsonb,
  origem                text,
  destino               text,
  peso_medio            numeric(10,2),
  rendimento_carcaca    numeric(6,2),
  peso_carcaca          numeric(10,2),
  valor_cabeca          numeric(14,2),
  valor_total           numeric(16,2),
  tipo_ajuste           text check (tipo_ajuste in ('entrada','saida')),
  observacoes           text,
  transferencia_id      uuid,
  sugestao_id           uuid,
  excluido              boolean not null default false,
  usuario_id            uuid references public.perfis(id) default auth.uid(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint pec_mov_retiro_obrigatorio check (retiro_id is not null or tipo in ('compra','venda','abate'))
);
create index if not exists pec_mov_fazenda_idx on public.pec_movimentacoes(fazenda_id, data);
create index if not exists pec_mov_updated_idx on public.pec_movimentacoes(updated_at);

create table if not exists public.pec_transferencias (
  id                 uuid primary key default gen_random_uuid(),
  fazenda_id         uuid not null references public.fazendas(id) on delete cascade,
  retiro_origem_id   uuid not null references public.retiros(id),
  retiro_destino_id  uuid not null references public.retiros(id),
  data               date not null,
  itens              jsonb not null default '[]'::jsonb,
  observacoes        text,
  status             text not null default 'pendente'
                     check (status in ('pendente','aceita','recusada','cancelada')),
  solicitado_por     uuid references public.perfis(id) default auth.uid(),
  respondido_por     uuid references public.perfis(id),
  respondido_em      timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (retiro_origem_id <> retiro_destino_id)
);
create index if not exists pec_transf_updated_idx on public.pec_transferencias(updated_at);

create table if not exists public.pec_sugestoes (
  id                uuid primary key default gen_random_uuid(),
  fazenda_id        uuid not null references public.fazendas(id) on delete cascade,
  retiro_id         uuid not null references public.retiros(id),
  transferencia_id  uuid references public.pec_transferencias(id) on delete cascade,
  tipo              text not null check (tipo in ('saida','entrada')),
  data              date,
  itens             jsonb not null default '[]'::jsonb,
  origem_destino    text,
  status            text not null default 'pendente' check (status in ('pendente','concluida','descartada')),
  movimentacao_id   uuid,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists pec_sug_updated_idx on public.pec_sugestoes(updated_at);

-- =====================================================================
-- updated_at automático (base da sincronização incremental)
-- =====================================================================
create or replace function public.tocar_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['perfis','usuario_modulos','fazendas','retiros','areas',
                           'pec_categorias','pec_movimentacoes','pec_transferencias','pec_sugestoes']
  loop
    execute format('drop trigger if exists trg_%1$s_updated on public.%1$s', t);
    execute format('create trigger trg_%1$s_updated before insert or update on public.%1$s
                    for each row execute function public.tocar_updated_at()', t);
  end loop;
end $$;

-- =====================================================================
-- FUNÇÕES DE ACESSO
-- =====================================================================
create or replace function public.eh_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select administrador and ativo from perfis where id = auth.uid()), false)
$$;

-- papel do usuário logado no módulo (null = sem acesso)
create or replace function public.papel(p_modulo text) returns text
language sql stable security definer set search_path = public as $$
  select um.papel from usuario_modulos um join perfis p on p.id = um.usuario_id
   where um.usuario_id = auth.uid() and um.modulo = p_modulo and um.ativo and p.ativo
$$;

create or replace function public.fazendas_acesso(p_modulo text) returns setof uuid
language sql stable security definer set search_path = public as $$
  select f.id from fazendas f where public.eh_admin()
  union
  select uf.fazenda_id from usuario_fazendas uf join fazendas f on f.id = uf.fazenda_id
   where uf.usuario_id = auth.uid() and uf.modulo = p_modulo and f.habilitada and public.papel(p_modulo) is not null
  union
  select r.fazenda_id from usuario_retiros ur join retiros r on r.id = ur.retiro_id join fazendas f on f.id = r.fazenda_id
   where ur.usuario_id = auth.uid() and ur.modulo = p_modulo and f.habilitada and public.papel(p_modulo) is not null
$$;

create or replace function public.retiros_acesso(p_modulo text) returns setof uuid
language sql stable security definer set search_path = public as $$
  select r.id from retiros r where public.eh_admin()
  union
  select r.id from retiros r join usuario_fazendas uf on uf.fazenda_id = r.fazenda_id join fazendas f on f.id = r.fazenda_id
   where uf.usuario_id = auth.uid() and uf.modulo = p_modulo and f.habilitada and public.papel(p_modulo) is not null
  union
  select ur.retiro_id from usuario_retiros ur join retiros r on r.id = ur.retiro_id join fazendas f on f.id = r.fazenda_id
   where ur.usuario_id = auth.uid() and ur.modulo = p_modulo and f.habilitada and public.papel(p_modulo) is not null
$$;

-- acesso em qualquer módulo (para os cadastros do núcleo)
create or replace function public.fazendas_acesso_qualquer() returns setof uuid
language sql stable security definer set search_path = public as $$
  select f.id from fazendas f where public.eh_admin()
  union
  select x from usuario_modulos um cross join lateral public.fazendas_acesso(um.modulo) as x
   where um.usuario_id = auth.uid()
$$;

create or replace function public.retiros_acesso_qualquer() returns setof uuid
language sql stable security definer set search_path = public as $$
  select r.id from retiros r where public.eh_admin()
  union
  select x from usuario_modulos um cross join lateral public.retiros_acesso(um.modulo) as x
   where um.usuario_id = auth.uid()
$$;

-- o usuário logado é analista de algum módulo em que "p_uid" tem acesso dentro das fazendas dele?
create or replace function public.gerencio_usuario(p_uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from usuario_modulos meu
      join usuario_modulos dele on dele.modulo = meu.modulo and dele.usuario_id = p_uid
     where meu.usuario_id = auth.uid() and meu.papel = 'analista' and meu.ativo
       and (
         exists (select 1 from usuario_fazendas uf where uf.usuario_id = p_uid and uf.modulo = meu.modulo
                   and uf.fazenda_id in (select public.fazendas_acesso(meu.modulo)))
         or exists (select 1 from usuario_retiros ur where ur.usuario_id = p_uid and ur.modulo = meu.modulo
                   and ur.retiro_id in (select public.retiros_acesso(meu.modulo)))
       )
  ) or exists (select 1 from perfis where id = p_uid and criado_por = auth.uid())
$$;

-- ---------------------------------------------------------------------
-- PEC: o que cada papel pode lançar
-- ---------------------------------------------------------------------
create or replace function public.pec_pode_movimentar(p_tipo text) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when public.eh_admin() then true
    when public.papel('pec') = 'analista' then true
    when public.papel('pec') = 'capataz' then
      p_tipo in ('nascimento','morte','entrada','saida','mudanca_piquete','transferencia')
      and coalesce((select (permissoes->>p_tipo)::boolean from usuario_modulos
                     where usuario_id = auth.uid() and modulo = 'pec'), true)
    else false end
$$;

create or replace function public.pec_gestor() returns boolean
language sql stable security definer set search_path = public as $$
  select public.eh_admin() or coalesce(public.papel('pec') = 'analista', false)
$$;

create or replace function public.pec_mov_visivel(p_fazenda uuid, p_retiro uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when p_retiro is null then p_fazenda in (select public.fazendas_acesso('pec')) and public.pec_gestor()
    else p_retiro in (select public.retiros_acesso('pec')) end
$$;

-- ---------------------------------------------------------------------
-- PEC: transferência entre retiros -> sugestões de saída e entrada
-- ---------------------------------------------------------------------
create or replace function public.pec_transferencia_validar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and old.status <> new.status then
    if old.status <> 'pendente' then
      raise exception 'Esta transferência já foi %.', old.status;
    end if;
    if new.status in ('aceita','recusada')
       and not (new.retiro_destino_id in (select public.retiros_acesso('pec'))) then
      raise exception 'Somente quem tem acesso ao retiro de destino pode aceitar ou recusar.';
    end if;
    if new.status in ('aceita','recusada') then
      new.respondido_por := coalesce(new.respondido_por, auth.uid());
      new.respondido_em  := coalesce(new.respondido_em, now());
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_pec_transferencia_validar on public.pec_transferencias;
create trigger trg_pec_transferencia_validar before update on public.pec_transferencias
  for each row execute function public.pec_transferencia_validar();

create or replace function public.pec_transferencia_gerar_sugestoes() returns trigger
language plpgsql security definer set search_path = public as $$
declare n_origem text; n_destino text;
begin
  if new.status = 'aceita'
     and (tg_op = 'INSERT' or old.status is distinct from 'aceita')
     and not exists (select 1 from pec_sugestoes where transferencia_id = new.id) then
    select nome into n_origem  from retiros where id = new.retiro_origem_id;
    select nome into n_destino from retiros where id = new.retiro_destino_id;
    insert into pec_sugestoes (fazenda_id, retiro_id, transferencia_id, tipo, data, itens, origem_destino)
    values (new.fazenda_id, new.retiro_origem_id,  new.id, 'saida',   new.data, new.itens, 'Transferência para ' || n_destino),
           (new.fazenda_id, new.retiro_destino_id, new.id, 'entrada', new.data, new.itens, 'Transferência de '   || n_origem);
  end if;
  return new;
end $$;

drop trigger if exists trg_pec_transferencia_sugestoes on public.pec_transferencias;
create trigger trg_pec_transferencia_sugestoes after insert or update on public.pec_transferencias
  for each row execute function public.pec_transferencia_gerar_sugestoes();

create or replace function public.pec_mov_concluir_sugestao() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.sugestao_id is not null and not new.excluido then
    update pec_sugestoes set status = 'concluida', movimentacao_id = new.id
     where id = new.sugestao_id and status = 'pendente';
  end if;
  return new;
end $$;

drop trigger if exists trg_pec_mov_sugestao on public.pec_movimentacoes;
create trigger trg_pec_mov_sugestao after insert on public.pec_movimentacoes
  for each row execute function public.pec_mov_concluir_sugestao();

-- ---------------------------------------------------------------------
-- PEC: estoque de animais por piquete e categoria
-- ---------------------------------------------------------------------
create or replace view public.pec_estoque with (security_invoker = true) as
with efeitos as (
  select m.fazenda_id, m.retiro_id, m.piquete_id, (i->>'categoria_id')::uuid as categoria_id,
         (i->>'quantidade')::int * case
           when m.tipo in ('nascimento','entrada') then 1
           when m.tipo in ('morte','saida','mudanca_piquete','mudanca_categoria') then -1
           when m.tipo = 'ajuste' then case when m.tipo_ajuste = 'entrada' then 1 else -1 end
           else 0 end as qtd
    from pec_movimentacoes m, jsonb_array_elements(m.itens) i
   where not m.excluido
  union all
  select m.fazenda_id, a.retiro_id, m.piquete_destino_id, (i->>'categoria_id')::uuid, (i->>'quantidade')::int
    from pec_movimentacoes m
    join areas a on a.id = m.piquete_destino_id,
         jsonb_array_elements(m.itens) i
   where not m.excluido and m.tipo = 'mudanca_piquete'
  union all
  select m.fazenda_id, m.retiro_id, m.piquete_id, m.categoria_destino_id, (i->>'quantidade')::int
    from pec_movimentacoes m, jsonb_array_elements(m.itens) i
   where not m.excluido and m.tipo = 'mudanca_categoria'
)
select fazenda_id, retiro_id, piquete_id, categoria_id, sum(qtd)::int as quantidade
  from efeitos
 group by fazenda_id, retiro_id, piquete_id, categoria_id
having sum(qtd) <> 0;

-- =====================================================================
-- RLS
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array['perfis','usuario_modulos','usuario_fazendas','usuario_retiros','fazendas','retiros','areas',
                           'pec_categorias','pec_movimentacoes','pec_transferencias','pec_sugestoes']
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Usuários e acessos: leitura; escrita somente pela função gerenciar-usuario
drop policy if exists perfis_sel on public.perfis;
create policy perfis_sel on public.perfis for select using (
  id = auth.uid() or public.eh_admin() or public.gerencio_usuario(id));
drop policy if exists um_sel on public.usuario_modulos;
create policy um_sel on public.usuario_modulos for select using (
  usuario_id = auth.uid() or public.eh_admin() or public.gerencio_usuario(usuario_id));
drop policy if exists uf_sel on public.usuario_fazendas;
create policy uf_sel on public.usuario_fazendas for select using (
  usuario_id = auth.uid() or public.eh_admin() or public.gerencio_usuario(usuario_id));
drop policy if exists ur_sel on public.usuario_retiros;
create policy ur_sel on public.usuario_retiros for select using (
  usuario_id = auth.uid() or public.eh_admin() or public.gerencio_usuario(usuario_id));

-- Fazendas e retiros: leitura para quem tem acesso em qualquer módulo; escrita só do administrador
drop policy if exists fazendas_sel on public.fazendas;
create policy fazendas_sel on public.fazendas for select using (id in (select public.fazendas_acesso_qualquer()));
drop policy if exists fazendas_ins on public.fazendas;
create policy fazendas_ins on public.fazendas for insert with check (public.eh_admin());
drop policy if exists fazendas_upd on public.fazendas;
create policy fazendas_upd on public.fazendas for update using (public.eh_admin()) with check (public.eh_admin());
drop policy if exists fazendas_del on public.fazendas;
create policy fazendas_del on public.fazendas for delete using (public.eh_admin());

drop policy if exists retiros_sel on public.retiros;
create policy retiros_sel on public.retiros for select using (fazenda_id in (select public.fazendas_acesso_qualquer()));
drop policy if exists retiros_ins on public.retiros;
create policy retiros_ins on public.retiros for insert with check (public.eh_admin());
drop policy if exists retiros_upd on public.retiros;
create policy retiros_upd on public.retiros for update using (public.eh_admin()) with check (public.eh_admin());
drop policy if exists retiros_del on public.retiros;
create policy retiros_del on public.retiros for delete using (public.eh_admin());

-- Áreas: administrador cadastra; analista da pecuária cria/encerra agrupamentos (ILP)
drop policy if exists areas_sel on public.areas;
create policy areas_sel on public.areas for select using (retiro_id in (select public.retiros_acesso_qualquer()));
drop policy if exists areas_ins on public.areas;
create policy areas_ins on public.areas for insert with check (
  public.eh_admin()
  or (tipo = 'agrupamento' and departamento = 'pecuaria' and public.pec_gestor()
      and retiro_id in (select public.retiros_acesso('pec')))
);
drop policy if exists areas_upd on public.areas;
create policy areas_upd on public.areas for update using (
  public.eh_admin()
  or (tipo = 'agrupamento' and public.pec_gestor() and retiro_id in (select public.retiros_acesso('pec')))
);

-- PEC: categorias
drop policy if exists pec_cat_sel on public.pec_categorias;
create policy pec_cat_sel on public.pec_categorias for select using (
  fazenda_id is null or fazenda_id in (select public.fazendas_acesso('pec')));
drop policy if exists pec_cat_ins on public.pec_categorias;
create policy pec_cat_ins on public.pec_categorias for insert with check (
  (fazenda_id is null and public.eh_admin())
  or (fazenda_id in (select public.fazendas_acesso('pec')) and public.pec_gestor()));
drop policy if exists pec_cat_upd on public.pec_categorias;
create policy pec_cat_upd on public.pec_categorias for update using (
  (fazenda_id is null and public.eh_admin())
  or (fazenda_id in (select public.fazendas_acesso('pec')) and public.pec_gestor()));

-- PEC: movimentações
drop policy if exists pec_mov_sel on public.pec_movimentacoes;
create policy pec_mov_sel on public.pec_movimentacoes for select using (public.pec_mov_visivel(fazenda_id, retiro_id));
drop policy if exists pec_mov_ins on public.pec_movimentacoes;
create policy pec_mov_ins on public.pec_movimentacoes for insert with check (
  public.pec_mov_visivel(fazenda_id, retiro_id) and public.pec_pode_movimentar(tipo));
drop policy if exists pec_mov_upd on public.pec_movimentacoes;
create policy pec_mov_upd on public.pec_movimentacoes for update using (
  public.pec_mov_visivel(fazenda_id, retiro_id) and (public.pec_gestor() or usuario_id = auth.uid()));

-- PEC: transferências
drop policy if exists pec_transf_sel on public.pec_transferencias;
create policy pec_transf_sel on public.pec_transferencias for select using (
  retiro_origem_id in (select public.retiros_acesso('pec')) or retiro_destino_id in (select public.retiros_acesso('pec')));
drop policy if exists pec_transf_ins on public.pec_transferencias;
create policy pec_transf_ins on public.pec_transferencias for insert with check (
  retiro_origem_id in (select public.retiros_acesso('pec')) and public.pec_pode_movimentar('transferencia') and status = 'pendente');
drop policy if exists pec_transf_upd on public.pec_transferencias;
create policy pec_transf_upd on public.pec_transferencias for update using (
  retiro_origem_id in (select public.retiros_acesso('pec')) or retiro_destino_id in (select public.retiros_acesso('pec')));

-- PEC: sugestões
drop policy if exists pec_sug_sel on public.pec_sugestoes;
create policy pec_sug_sel on public.pec_sugestoes for select using (retiro_id in (select public.retiros_acesso('pec')));
drop policy if exists pec_sug_upd on public.pec_sugestoes;
create policy pec_sug_upd on public.pec_sugestoes for update using (retiro_id in (select public.retiros_acesso('pec')));

-- =====================================================================
-- CATEGORIAS PADRÃO DA PECUÁRIA (UA ≈ equivalência em 450 kg de PV; ajustável)
-- =====================================================================
insert into public.pec_categorias (fazenda_id, nome, sexo, ua, ordem, codigo)
select null, v.nome, v.sexo, v.ua, v.ordem, v.codigo
  from (values
    ('Bezerros (as) até 9', 'misto', 0.30, 1,  'bezerro'),
    ('Machos de 9 a 12',    'M',     0.45, 2,  null),
    ('Machos de 12 a 24',   'M',     0.65, 3,  null),
    ('Machos de 25 a 36',   'M',     0.90, 4,  null),
    ('Machos acima de 36',  'M',     1.10, 5,  null),
    ('Fêmeas de 9 a 12',    'F',     0.40, 6,  null),
    ('Fêmeas de 13 a 24',   'F',     0.60, 7,  null),
    ('Fêmeas de 25 a 36',   'F',     0.80, 8,  null),
    ('Vacas',               'F',     1.00, 9,  null),
    ('Touros',              'M',     1.40, 10, null)
  ) as v(nome, sexo, ua, ordem, codigo)
 where not exists (select 1 from public.pec_categorias c where c.fazenda_id is null and c.nome = v.nome);

-- =====================================================================
-- PRIMEIRO ADMINISTRADOR
-- 1) Authentication > Users > Add user (marque "Auto Confirm").
-- 2) Troque o e-mail abaixo e execute:
--
-- insert into public.perfis (id, nome, email, administrador)
-- select id, 'Seu nome', email, true from auth.users where email = 'seu@email.com'
-- on conflict (id) do update set administrador = true, ativo = true;
-- =====================================================================

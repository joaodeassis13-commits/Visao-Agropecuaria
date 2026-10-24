-- =====================================================================
-- Plataforma VA — liberar o PRIMEIRO ADMINISTRADOR
-- Antes: crie o usuário em Authentication > Users > Add user > Create new user
--        (preencha e-mail e senha e marque "Auto Confirm User").
-- Depois: troque o e-mail e o nome nas duas linhas abaixo e clique em RUN.
-- =====================================================================

do $$
declare
  v_email text := 'seu@email.com';   -- <<< TROQUE pelo e-mail criado no Authentication
  v_nome  text := 'Seu nome';        -- <<< TROQUE pelo seu nome
  v_id    uuid;
begin
  if to_regclass('public.perfis') is null then
    raise exception 'A tabela "perfis" não existe. Rode primeiro o schema.sql da plataforma VA.';
  end if;

  select id into v_id from auth.users where lower(email) = lower(trim(v_email));
  if v_id is null then
    raise exception 'Nenhum usuário com o e-mail % em Authentication > Users. Crie o usuário lá primeiro (ou confira o e-mail).', v_email;
  end if;

  insert into public.perfis (id, nome, email, administrador, ativo)
  values (v_id, v_nome, lower(trim(v_email)), true, true)
  on conflict (id) do update set administrador = true, ativo = true, nome = excluded.nome, email = excluded.email;

  -- garante que o usuário não está bloqueado nem pendente de confirmação
  update auth.users
     set banned_until = null,
         email_confirmed_at = coalesce(email_confirmed_at, now())
   where id = v_id;

  raise notice 'Pronto: % agora é administrador da plataforma VA.', v_email;
end $$;

-- Conferência: deve aparecer uma linha com administrador = true
select p.nome, p.email, p.administrador, p.ativo, u.email_confirmed_at is not null as email_confirmado
  from public.perfis p join auth.users u on u.id = p.id
 where p.administrador;

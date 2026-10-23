// Supabase Edge Function: gerenciar-usuario
// Cria e edita usuários da plataforma VA com acesso por módulo.
//   Administrador -> tudo (inclusive analistas e outros administradores)
//   Analista de um módulo -> cria/edita os papéis inferiores daquele módulo, só nas fazendas dele
// Deploy: supabase functions deploy gerenciar-usuario
import { createClient } from "npm:@supabase/supabase-js@2";

// nível do vínculo de cada papel (fazenda ou retiro) — manter igual a src/core/modulos.js
const PAPEIS: Record<string, Record<string, "fazenda" | "retiro">> = {
  pec: { analista: "fazenda", capataz: "retiro" },
  agri: { analista: "fazenda", operador: "retiro" },
  estoque: { analista: "fazenda", almoxarife: "fazenda" },
  financeiro: { analista: "fazenda", operador: "fazenda" },
};

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

type AcessoModulo = { papel: string | null; ativo?: boolean; fazendas?: string[]; retiros?: string[]; permissoes?: Record<string, unknown> };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const chamador = createClient(url, anon, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data: { user } } = await chamador.auth.getUser();
    if (!user) return json({ erro: "Sessão expirada. Entre novamente." }, 401);

    const db = createClient(url, service, { auth: { persistSession: false } });
    const { data: eu } = await db.from("perfis").select("*").eq("id", user.id).maybeSingle();
    if (!eu || !eu.ativo) return json({ erro: "Usuário sem permissão." }, 403);
    const souAdmin = !!eu.administrador;

    // módulos em que o chamador é analista, com as fazendas dele em cada um
    const { data: meusModulos } = await db.from("usuario_modulos").select("*").eq("usuario_id", eu.id).eq("ativo", true);
    const gestorDe = new Map<string, Set<string>>();
    for (const m of meusModulos ?? []) {
      if (m.papel !== "analista") continue;
      const { data: fs } = await db.from("usuario_fazendas").select("fazenda_id").eq("usuario_id", eu.id).eq("modulo", m.modulo);
      gestorDe.set(m.modulo, new Set((fs ?? []).map((f) => f.fazenda_id)));
    }
    if (!souAdmin && !gestorDe.size) return json({ erro: "Você não pode gerenciar usuários." }, 403);

    const b = await req.json();
    const acao: "criar" | "editar" = b.acao;
    const nome = String(b.nome ?? "").trim();
    const email = String(b.email ?? "").trim().toLowerCase();
    const senha: string | undefined = b.senha || undefined;
    const modulos: Record<string, AcessoModulo> = b.modulos && typeof b.modulos === "object" ? b.modulos : {};

    if (!nome || !email) return json({ erro: "Informe nome e e-mail." }, 400);
    if (senha && senha.length < 6) return json({ erro: "A senha deve ter ao menos 6 caracteres." }, 400);
    if (acao === "criar" && !senha) return json({ erro: "Informe a senha." }, 400);

    // ---------- validação dos acessos pedidos ----------
    const retirosDaFazenda = async (fazendas: string[]) => {
      if (!fazendas.length) return [] as string[];
      const { data } = await db.from("retiros").select("id").in("fazenda_id", fazendas);
      return (data ?? []).map((r) => r.id);
    };
    const modulosATratar: string[] = [];
    for (const [mod, ac] of Object.entries(modulos)) {
      if (!PAPEIS[mod]) return json({ erro: `Módulo inválido: ${mod}` }, 400);
      if (!souAdmin && !gestorDe.has(mod)) continue; // analista só mexe nos módulos que gerencia
      if (ac.papel) {
        const nivel = PAPEIS[mod][ac.papel];
        if (!nivel) return json({ erro: `Papel inválido em ${mod}.` }, 400);
        if (!souAdmin && ac.papel === "analista") return json({ erro: "Somente o administrador cadastra analistas." }, 403);
        if (nivel === "fazenda" && !(ac.fazendas ?? []).length) return json({ erro: `Vincule ao menos uma fazenda em ${mod}.` }, 400);
        if (nivel === "retiro" && !(ac.retiros ?? []).length) return json({ erro: `Vincule ao menos um retiro em ${mod}.` }, 400);
        if (!souAdmin) {
          const minhas = gestorDe.get(mod)!;
          if ((ac.fazendas ?? []).some((f) => !minhas.has(f))) return json({ erro: "Há fazendas fora do seu acesso." }, 403);
          const meusRetiros = new Set(await retirosDaFazenda([...minhas]));
          if ((ac.retiros ?? []).some((r) => !meusRetiros.has(r))) return json({ erro: "Há retiros fora do seu acesso." }, 403);
        }
      }
      modulosATratar.push(mod);
    }

    // ---------- usuário ----------
    let uid: string;
    if (acao === "criar") {
      const { data, error } = await db.auth.admin.createUser({ email, password: senha, email_confirm: true, user_metadata: { nome } });
      if (error) {
        const existe = /already|registered|exists/i.test(error.message);
        return json({ erro: existe ? (souAdmin ? "Já existe um usuário com este e-mail." : "Já existe um usuário com este e-mail. Peça ao administrador para liberar o acesso dele.") : error.message }, 400);
      }
      uid = data.user.id;
      const { error: e2 } = await db.from("perfis").insert({
        id: uid, nome, email, administrador: souAdmin ? !!b.administrador : false, ativo: true, criado_por: eu.id,
      });
      if (e2) { await db.auth.admin.deleteUser(uid); return json({ erro: e2.message }, 400); }
    } else {
      uid = b.id;
      const { data: alvo } = await db.from("perfis").select("*").eq("id", uid).maybeSingle();
      if (!alvo) return json({ erro: "Usuário não encontrado." }, 404);
      const { data: acessosAlvo } = await db.from("usuario_modulos").select("*").eq("usuario_id", uid);

      if (!souAdmin) {
        if (alvo.administrador) return json({ erro: "Sem permissão para editar este usuário." }, 403);
        if ((acessosAlvo ?? []).some((a) => gestorDe.has(a.modulo) && a.papel === "analista"))
          return json({ erro: "Sem permissão para editar outro analista." }, 403);
      }
      // dados pessoais: administrador sempre; analista só se o usuário não tem acesso a módulos que ele não gerencia
      const podeDadosPessoais = souAdmin || (acessosAlvo ?? []).every((a) => gestorDe.has(a.modulo));
      if (podeDadosPessoais) {
        if (souAdmin && uid === eu.id && (b.ativo === false || b.administrador === false))
          return json({ erro: "Você não pode desativar nem remover o próprio acesso de administrador." }, 400);
        const att: Record<string, unknown> = {};
        if (senha) att.password = senha;
        if (email !== alvo.email) { att.email = email; att.email_confirm = true; }
        if (souAdmin) att.ban_duration = b.ativo === false ? "876000h" : "none";
        if (Object.keys(att).length) {
          const { error } = await db.auth.admin.updateUserById(uid, att);
          if (error) return json({ erro: error.message }, 400);
        }
        const up: Record<string, unknown> = { nome, email };
        if (souAdmin) { up.ativo = b.ativo !== false; up.administrador = !!b.administrador; }
        const { error: e2 } = await db.from("perfis").update(up).eq("id", uid);
        if (e2) return json({ erro: e2.message }, 400);
      }
    }

    // ---------- acessos por módulo ----------
    for (const mod of modulosATratar) {
      const ac = modulos[mod];
      // escopo que o chamador pode alterar neste módulo
      const escopoFaz = souAdmin ? null : [...gestorDe.get(mod)!];
      const escopoRet = souAdmin ? null : await retirosDaFazenda(escopoFaz!);

      // limpa os vínculos atuais dentro do escopo
      let qf = db.from("usuario_fazendas").delete().eq("usuario_id", uid).eq("modulo", mod);
      if (escopoFaz) qf = qf.in("fazenda_id", escopoFaz.length ? escopoFaz : ["00000000-0000-0000-0000-000000000000"]);
      await qf;
      let qr = db.from("usuario_retiros").delete().eq("usuario_id", uid).eq("modulo", mod);
      if (escopoRet) qr = qr.in("retiro_id", escopoRet.length ? escopoRet : ["00000000-0000-0000-0000-000000000000"]);
      await qr;

      if (!ac.papel) {
        // remove o módulo se não sobrou vínculo de outras fazendas
        const { count: cf } = await db.from("usuario_fazendas").select("*", { count: "exact", head: true }).eq("usuario_id", uid).eq("modulo", mod);
        const { count: cr } = await db.from("usuario_retiros").select("*", { count: "exact", head: true }).eq("usuario_id", uid).eq("modulo", mod);
        if (!cf && !cr) await db.from("usuario_modulos").delete().eq("usuario_id", uid).eq("modulo", mod);
        continue;
      }

      const { error } = await db.from("usuario_modulos").upsert({
        usuario_id: uid, modulo: mod, papel: ac.papel, ativo: ac.ativo !== false, permissoes: ac.permissoes ?? {},
      });
      if (error) return json({ erro: error.message }, 400);

      if (PAPEIS[mod][ac.papel] === "fazenda") {
        const rows = (ac.fazendas ?? []).map((f) => ({ usuario_id: uid, modulo: mod, fazenda_id: f }));
        if (rows.length) await db.from("usuario_fazendas").insert(rows);
      } else {
        const rows = (ac.retiros ?? []).map((r) => ({ usuario_id: uid, modulo: mod, retiro_id: r }));
        if (rows.length) await db.from("usuario_retiros").insert(rows);
      }
    }

    return json({ ok: true, id: uid });
  } catch (e) {
    return json({ erro: String((e as Error)?.message ?? e) }, 500);
  }
});

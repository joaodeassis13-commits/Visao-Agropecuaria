import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { supabase } from '../lib/supabase';
import { db, limparBanco } from '../lib/db';
import { salvarLocal, enviarPendentes, baixarDados } from '../lib/sync';
import { MODULOS, papelInfo } from '../modulos';

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

const lerJSON = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };

/** perfil + acessos por módulo, num objeto só (fica em cache para uso offline) */
async function carregarPerfil(uid) {
  const { data: p, error } = await supabase.from('perfis').select('*').eq('id', uid).maybeSingle();
  if (error) throw error;
  if (!p) return null;
  const { data: acessos } = await supabase.from('usuario_modulos').select('*').eq('usuario_id', uid);
  return { ...p, acessos: Object.fromEntries((acessos || []).map((a) => [a.modulo, a])) };
}

export function AppProvider({ children }) {
  const [session, setSession] = useState(undefined);
  const [perfil, setPerfilRaw] = useState(() => lerJSON('va_perfil'));
  const [online, setOnline] = useState(navigator.onLine);
  const [sincronizando, setSincronizando] = useState(false);
  const [ultimaSync, setUltimaSync] = useState(() => localStorage.getItem('va_ultima_sync'));
  const [erroSync, setErroSync] = useState(null);
  const [fazendaPorModulo, setFazendaPorModulo] = useState(() => lerJSON('va_fazendas') || {});
  const [modulo, setModuloRaw] = useState(() => localStorage.getItem('va_modulo') || 'pec');
  const [nav, setNavRaw] = useState({ pagina: null });
  const [toasts, setToasts] = useState([]);
  const sincRef = useRef(false);

  const setPerfil = useCallback((p) => {
    setPerfilRaw(p);
    if (p && !p.semPerfil) localStorage.setItem('va_perfil', JSON.stringify(p));
  }, []);

  const toast = useCallback((msg, tipo = 'ok') => {
    const id = Math.random();
    setToasts((t) => [...t, { id, msg, tipo }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  const setNav = useCallback((n) => setNavRaw({ ...n, ts: Date.now() }), []);

  // Sessão
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  // Conectividade
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  const uidSessao = session?.user?.id;
  useEffect(() => {
    if (!uidSessao) return;
    (async () => {
      const dono = await db.meta.get('usuario');
      if (dono && dono.valor !== uidSessao) {
        await limparBanco();
        localStorage.removeItem('va_ultima_sync');
        setUltimaSync(null);
      }
      await db.meta.put({ chave: 'usuario', valor: uidSessao });
      setPerfilRaw((p) => (p && p.id !== uidSessao ? null : p));
      try {
        const p = await carregarPerfil(uidSessao);
        setPerfil(p || { id: uidSessao, semPerfil: true });
      } catch { /* offline: mantém o perfil em cache */ }
    })();
  }, [uidSessao, setPerfil]);

  const sincronizar = useCallback(async (silencioso = false) => {
    if (sincRef.current || !navigator.onLine) return;
    const { data } = await supabase.auth.getSession();
    if (!data.session) return;
    sincRef.current = true;
    setSincronizando(true);
    setErroSync(null);
    try {
      const recusados = await enviarPendentes();
      await baixarDados();
      const agora = new Date().toISOString();
      setUltimaSync(agora);
      localStorage.setItem('va_ultima_sync', agora);
      if (recusados) setErroSync(`${recusados} lançamento(s) recusado(s) pelo servidor`);
      const p = await carregarPerfil(data.session.user.id);
      if (p) setPerfil(p);
      if (!silencioso) toast('Sincronizado com sucesso.');
    } catch (e) {
      setErroSync(e.message || 'Falha na sincronização');
      if (!silencioso) toast(`Falha ao sincronizar: ${e.message || ''}`, 'erro');
    } finally {
      sincRef.current = false;
      setSincronizando(false);
    }
  }, [toast, setPerfil]);

  const perfilOk = perfil && !perfil.semPerfil;
  useEffect(() => {
    if (uidSessao && perfilOk && online) sincronizar(true);
  }, [uidSessao, perfilOk, online, sincronizar]);

  useEffect(() => {
    if (!uidSessao) return;
    const t = setInterval(() => sincronizar(true), 2 * 60 * 1000);
    return () => clearInterval(t);
  }, [uidSessao, sincronizar]);

  const salvar = useCallback(async (tabela, rows, op = 'upsert') => {
    const r = await salvarLocal(tabela, rows, op);
    if (navigator.onLine) setTimeout(() => sincronizar(true), 300);
    return r;
  }, [sincronizar]);

  // ---------- módulos e papéis ----------
  const ehAdmin = Boolean(perfil?.administrador);
  const papel = useCallback((mod) => {
    const a = perfil?.acessos?.[mod];
    return a && a.ativo !== false ? a.papel : null;
  }, [perfil]);

  const modulosDoUsuario = useMemo(
    () => MODULOS.filter((m) => ehAdmin || papel(m.id)),
    [ehAdmin, papel],
  );

  useEffect(() => {
    if (modulosDoUsuario.length && !modulosDoUsuario.some((m) => m.id === modulo)) {
      setModuloRaw(modulosDoUsuario[0].id);
    }
  }, [modulosDoUsuario, modulo]);

  const setModulo = useCallback((id) => {
    setModuloRaw(id);
    localStorage.setItem('va_modulo', id);
    setNavRaw({ pagina: null, ts: Date.now() });
  }, []);

  /** admin ou papel gestor (analista) no módulo */
  const ehGestorDe = useCallback((mod) => ehAdmin || Boolean(papelInfo(mod, papel(mod))?.gestor), [ehAdmin, papel]);
  const ehGestor = ehGestorDe(modulo);
  const gerenciaUsuarios = ehAdmin || MODULOS.some((m) => papelInfo(m.id, papel(m.id))?.gestor);

  // ---------- fazendas acessíveis no módulo ativo ----------
  const fazendas = useLiveQuery(() => db.fazendas.toArray(), [], []);
  const meusVinculosFaz = useLiveQuery(() => (perfil ? db.usuario_fazendas.where('usuario_id').equals(perfil.id).toArray() : []), [perfil?.id], []);
  const meusVinculosRet = useLiveQuery(() => (perfil ? db.usuario_retiros.where('usuario_id').equals(perfil.id).toArray() : []), [perfil?.id], []);
  const retiros = useLiveQuery(() => db.retiros.toArray(), [], []);

  const fazendasDisponiveis = useMemo(() => {
    let lista = fazendas;
    if (!ehAdmin) {
      const ids = new Set(meusVinculosFaz.filter((v) => v.modulo === modulo).map((v) => v.fazenda_id));
      const rIds = new Set(meusVinculosRet.filter((v) => v.modulo === modulo).map((v) => v.retiro_id));
      retiros.filter((r) => rIds.has(r.id)).forEach((r) => ids.add(r.fazenda_id));
      lista = fazendas.filter((f) => ids.has(f.id) && f.habilitada);
    }
    return [...lista].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [fazendas, meusVinculosFaz, meusVinculosRet, retiros, ehAdmin, modulo]);

  const fazendaId = fazendaPorModulo[modulo] || null;
  const setFazendaId = useCallback((id) => {
    setFazendaPorModulo((m) => {
      const n = { ...m, [modulo]: id };
      localStorage.setItem('va_fazendas', JSON.stringify(n));
      return n;
    });
  }, [modulo]);

  useEffect(() => {
    if (fazendasDisponiveis.length && !fazendasDisponiveis.some((f) => f.id === fazendaId)) {
      setFazendaId(fazendasDisponiveis[0].id);
    }
  }, [fazendasDisponiveis, fazendaId, setFazendaId]);

  const pendentes = useLiveQuery(() => db.outbox.count(), [], 0);

  const sair = useCallback(async () => {
    const n = await db.outbox.count();
    if (n && !window.confirm(`Há ${n} lançamento(s) ainda não sincronizado(s). Se sair agora eles serão perdidos. Sair mesmo assim?`)) return;
    await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
    await limparBanco();
    ['va_perfil', 'va_ultima_sync', 'va_fazendas'].forEach((k) => localStorage.removeItem(k));
    setPerfilRaw(null);
    setSession(null);
  }, []);

  const logado = Boolean(session?.user) || (session === null && !online && perfilOk);

  const valor = {
    session, perfil, logado, online, sincronizando, ultimaSync, erroSync, pendentes,
    sincronizar, salvar, sair, toast, toasts,
    modulo, setModulo, modulosDoUsuario, papel, ehAdmin, ehGestor, ehGestorDe, gerenciaUsuarios,
    fazendaId, setFazendaId, fazendas, fazendasDisponiveis,
    fazendaAtiva: fazendas.find((f) => f.id === fazendaId) || null,
    nav, setNav,
  };

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

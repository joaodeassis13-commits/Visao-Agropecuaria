import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, ShieldCheck, Users, WifiOff } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { db } from '../lib/db';
import { supabase } from '../lib/supabase';
import { MODULOS, papelInfo } from '../modulos';
import { ordenarNome } from '../lib/util';
import { Cabecalho, Campo, SemAcesso, Vazio } from '../components/ui';
import { PERMISSOES_CAPATAZ } from '../../modulos/pec/lib/constants';

// permissões extras por módulo/papel (por enquanto só o capataz da pecuária)
const PERMISSOES = { pec: { capataz: PERMISSOES_CAPATAZ } };
const permissoesPadrao = (mod, papel) => Object.fromEntries((PERMISSOES[mod]?.[papel] || []).map((p) => [p.chave, true]));
const acessoVazio = () => ({ papel: '', ativo: true, fazendas: [], retiros: [], permissoes: {} });

export default function Usuarios() {
  const { perfil, ehAdmin, ehGestorDe, gerenciaUsuarios, online, sincronizar, toast } = useApp();
  const perfis = useLiveQuery(() => db.perfis.toArray(), [], []);
  const fazendas = useLiveQuery(() => db.fazendas.toArray(), [], []);
  const retiros = useLiveQuery(() => db.retiros.toArray(), [], []);
  const um = useLiveQuery(() => db.usuario_modulos.toArray(), [], []);
  const uf = useLiveQuery(() => db.usuario_fazendas.toArray(), [], []);
  const ur = useLiveQuery(() => db.usuario_retiros.toArray(), [], []);
  const [form, setForm] = useState(null);
  const [salvando, setSalvando] = useState(false);

  // módulos que o usuário logado pode configurar
  const modulosEditaveis = useMemo(() => MODULOS.filter((m) => ehAdmin || ehGestorDe(m.id)), [ehAdmin, ehGestorDe]);

  // fazendas que o usuário logado pode distribuir em cada módulo
  const escopo = useMemo(() => {
    const r = {};
    for (const m of MODULOS) {
      const faz = ehAdmin
        ? [...fazendas]
        : fazendas.filter((f) => uf.some((v) => v.usuario_id === perfil?.id && v.modulo === m.id && v.fazenda_id === f.id));
      const fIds = new Set(faz.map((f) => f.id));
      r[m.id] = { fazendas: faz.sort(ordenarNome), retiros: retiros.filter((x) => fIds.has(x.fazenda_id)).sort(ordenarNome) };
    }
    return r;
  }, [ehAdmin, fazendas, retiros, uf, perfil?.id]);

  if (!gerenciaUsuarios) return <SemAcesso />;

  const nomeFaz = (id) => fazendas.find((f) => f.id === id)?.nome || '?';
  const nomeRet = (id) => {
    const r = retiros.find((x) => x.id === id);
    return r ? `${r.nome} (${nomeFaz(r.fazenda_id)})` : '?';
  };
  const acessosDe = (uid) => um.filter((a) => a.usuario_id === uid);
  const descAcessos = (p) => {
    if (p.administrador) return 'Administrador — acesso total';
    const lista = acessosDe(p.id).map((a) => {
      const mod = MODULOS.find((m) => m.id === a.modulo);
      const nivel = papelInfo(a.modulo, a.papel)?.nivel;
      const vinc = nivel === 'retiro'
        ? ur.filter((v) => v.usuario_id === p.id && v.modulo === a.modulo).map((v) => nomeRet(v.retiro_id))
        : uf.filter((v) => v.usuario_id === p.id && v.modulo === a.modulo).map((v) => nomeFaz(v.fazenda_id));
      return `${mod?.nome}: ${papelInfo(a.modulo, a.papel)?.l || a.papel}${vinc.length ? ` (${vinc.join(', ')})` : ''}${a.ativo === false ? ' — suspenso' : ''}`;
    });
    return lista.join(' · ') || 'Sem acesso a módulos';
  };

  const podeEditar = (p) => {
    if (ehAdmin) return true;
    if (p.administrador) return false;
    return !acessosDe(p.id).some((a) => ehGestorDe(a.modulo) && papelInfo(a.modulo, a.papel)?.gestor);
  };

  const lista = perfis
    .filter((p) => ehAdmin || p.id !== perfil.id)
    .sort((a, b) => Number(b.administrador) - Number(a.administrador) || ordenarNome(a, b));

  function novo() {
    setForm({
      acao: 'criar', id: null, nome: '', email: '', senha: '', ativo: true, administrador: false,
      modulos: Object.fromEntries(modulosEditaveis.map((m) => [m.id, acessoVazio()])),
    });
  }

  function editar(p) {
    const modulos = {};
    for (const m of modulosEditaveis) {
      const a = acessosDe(p.id).find((x) => x.modulo === m.id);
      const fsEscopo = new Set(escopo[m.id].fazendas.map((f) => f.id));
      const rsEscopo = new Set(escopo[m.id].retiros.map((r) => r.id));
      modulos[m.id] = a ? {
        papel: a.papel, ativo: a.ativo !== false,
        fazendas: uf.filter((v) => v.usuario_id === p.id && v.modulo === m.id && fsEscopo.has(v.fazenda_id)).map((v) => v.fazenda_id),
        retiros: ur.filter((v) => v.usuario_id === p.id && v.modulo === m.id && rsEscopo.has(v.retiro_id)).map((v) => v.retiro_id),
        permissoes: { ...permissoesPadrao(m.id, a.papel), ...(a.permissoes || {}) },
      } : acessoVazio();
    }
    setForm({
      acao: 'editar', id: p.id, nome: p.nome, email: p.email, senha: '', ativo: p.ativo !== false,
      administrador: Boolean(p.administrador), modulos,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const set = (k, v) => setForm((s) => ({ ...s, [k]: v }));
  const setMod = (mod, k, v) => setForm((s) => ({ ...s, modulos: { ...s.modulos, [mod]: { ...s.modulos[mod], [k]: v } } }));
  const alternarMod = (mod, campo, id) => {
    const atual = form.modulos[mod][campo];
    setMod(mod, campo, atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id]);
  };
  const trocarPapel = (mod, papel) => setForm((s) => ({
    ...s,
    modulos: { ...s.modulos, [mod]: { ...s.modulos[mod], papel, fazendas: [], retiros: [], permissoes: permissoesPadrao(mod, papel) } },
  }));

  async function gravar(e) {
    e.preventDefault();
    if (!online) return toast('É preciso estar conectado para gerenciar usuários.', 'erro');
    if (!form.nome.trim() || !form.email.trim()) return toast('Informe nome e e-mail.', 'erro');
    if (form.acao === 'criar' && form.senha.length < 6) return toast('A senha deve ter ao menos 6 caracteres.', 'erro');
    for (const m of modulosEditaveis) {
      const a = form.modulos[m.id];
      if (!a.papel) continue;
      const nivel = papelInfo(m.id, a.papel)?.nivel;
      if (nivel === 'fazenda' && !a.fazendas.length) return toast(`${m.nome}: vincule ao menos uma fazenda.`, 'erro');
      if (nivel === 'retiro' && !a.retiros.length) return toast(`${m.nome}: vincule ao menos um retiro.`, 'erro');
    }
    if (!form.administrador && !modulosEditaveis.some((m) => form.modulos[m.id].papel) && form.acao === 'criar') {
      return toast('Libere ao menos um módulo para o usuário.', 'erro');
    }
    setSalvando(true);
    try {
      const body = {
        ...form,
        modulos: Object.fromEntries(Object.entries(form.modulos).map(([k, a]) => [k, { ...a, papel: a.papel || null }])),
      };
      const { data, error } = await supabase.functions.invoke('gerenciar-usuario', { body });
      if (error) {
        let msg = error.message;
        try { msg = (await error.context.json()).erro || msg; } catch { /* sem corpo */ }
        throw new Error(msg);
      }
      if (data?.erro) throw new Error(data.erro);
      toast(form.acao === 'criar' ? 'Usuário criado.' : 'Usuário atualizado.');
      setForm(null);
      await sincronizar(true);
    } catch (err) {
      toast(err.message, 'erro');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="pagina">
      <Cabecalho icone={Users} titulo="Usuários"
        desc={ehAdmin
          ? 'Cada usuário recebe acesso por módulo, com um papel e as fazendas ou retiros em que pode atuar.'
          : 'Usuários dos módulos que você gerencia, nas suas fazendas.'}>
        {!form && <button className="btn" onClick={novo}><Plus size={18} /> Novo usuário</button>}
      </Cabecalho>

      {!online && <div className="aviso"><WifiOff size={18} /> Sem internet: o cadastro de usuários precisa de conexão.</div>}

      {form && (
        <form className="painel" onSubmit={gravar}>
          <h3 className="painel-tit">{form.acao === 'criar' ? 'Novo usuário' : `Editar ${form.nome}`}</h3>
          <div className="grid">
            <Campo label="Nome" obrigatorio><input value={form.nome} onChange={(e) => set('nome', e.target.value)} /></Campo>
            <Campo label="E-mail" obrigatorio><input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} /></Campo>
            <Campo label={form.acao === 'criar' ? 'Senha' : 'Nova senha'} obrigatorio={form.acao === 'criar'}
              dica={form.acao === 'editar' ? 'Deixe em branco para manter' : 'Mínimo 6 caracteres'}>
              <input type="text" autoComplete="new-password" value={form.senha} onChange={(e) => set('senha', e.target.value)} />
            </Campo>
          </div>

          {ehAdmin && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
              <label className={`check ${form.administrador ? 'marcado' : ''}`}>
                <input type="checkbox" checked={form.administrador} disabled={form.id === perfil.id}
                  onChange={(e) => set('administrador', e.target.checked)} />
                <ShieldCheck size={16} /> Administrador da plataforma (acesso total)
              </label>
              {form.acao === 'editar' && form.id !== perfil.id && (
                <label className={`check ${form.ativo ? 'marcado' : ''}`}>
                  <input type="checkbox" checked={form.ativo} onChange={(e) => set('ativo', e.target.checked)} /> Usuário ativo
                </label>
              )}
            </div>
          )}

          {!form.administrador && modulosEditaveis.map((m) => {
            const a = form.modulos[m.id];
            const papeis = m.papeis.filter((p) => ehAdmin || !p.gestor);
            const nivel = papelInfo(m.id, a.papel)?.nivel;
            const perms = PERMISSOES[m.id]?.[a.papel] || [];
            const gruposRet = escopo[m.id].fazendas
              .map((f) => ({ f, rs: escopo[m.id].retiros.filter((r) => r.fazenda_id === f.id) }))
              .filter((g) => g.rs.length);
            return (
              <div className="bloco-modulo" key={m.id}>
                <div className="bloco-modulo-cab">
                  <b>{m.nome}</b>
                  {!m.disponivel && <span className="pill amarelo">em breve</span>}
                  <select value={a.papel} onChange={(e) => trocarPapel(m.id, e.target.value)}>
                    <option value="">Sem acesso</option>
                    {papeis.map((p) => <option key={p.v} value={p.v}>{p.l}</option>)}
                  </select>
                  {a.papel && form.acao === 'editar' && (
                    <label className="check" style={{ padding: '6px 10px' }}>
                      <input type="checkbox" checked={a.ativo} onChange={(e) => setMod(m.id, 'ativo', e.target.checked)} /> Acesso ativo
                    </label>
                  )}
                </div>

                {nivel === 'fazenda' && (
                  <>
                    <div className="rotulo">Fazendas</div>
                    {!escopo[m.id].fazendas.length ? <p className="painel-sub" style={{ margin: 0 }}>Nenhuma fazenda disponível.</p> : (
                      <div className="checks">
                        {escopo[m.id].fazendas.map((f) => (
                          <label key={f.id} className={`check ${a.fazendas.includes(f.id) ? 'marcado' : ''}`}>
                            <input type="checkbox" checked={a.fazendas.includes(f.id)} onChange={() => alternarMod(m.id, 'fazendas', f.id)} /> {f.nome}
                          </label>
                        ))}
                      </div>
                    )}
                  </>
                )}

                {nivel === 'retiro' && (
                  <>
                    <div className="rotulo">Retiros</div>
                    {!gruposRet.length ? <p className="painel-sub" style={{ margin: 0 }}>Nenhum retiro disponível.</p>
                      : gruposRet.map(({ f, rs }) => (
                        <div className="grupo-retiros" key={f.id}>
                          <h4>{f.nome}</h4>
                          <div className="checks">
                            {rs.map((r) => (
                              <label key={r.id} className={`check ${a.retiros.includes(r.id) ? 'marcado' : ''}`}>
                                <input type="checkbox" checked={a.retiros.includes(r.id)} onChange={() => alternarMod(m.id, 'retiros', r.id)} /> {r.nome}
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                  </>
                )}

                {perms.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <div className="rotulo">Permissões</div>
                    <div className="checks">
                      {perms.map((p) => (
                        <label key={p.chave} className={`check ${a.permissoes[p.chave] ? 'marcado' : ''}`}>
                          <input type="checkbox" checked={!!a.permissoes[p.chave]}
                            onChange={(e) => setMod(m.id, 'permissoes', { ...a.permissoes, [p.chave]: e.target.checked })} /> {p.label}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          <div className="acoes-form">
            <button className="btn" disabled={salvando || !online}>{salvando ? 'Salvando…' : 'Salvar'}</button>
            <button type="button" className="btn sec" onClick={() => setForm(null)}>Cancelar</button>
          </div>
        </form>
      )}

      <div className="secao-tit">Usuários cadastrados</div>
      {!lista.length ? (
        <div className="tabela-wrap"><Vazio icone={Users}>Nenhum usuário.</Vazio></div>
      ) : (
        <div className="tabela-wrap">
          <table className="tabela">
            <thead><tr><th>Nome</th><th>E-mail</th><th>Acessos</th><th>Status</th><th /></tr></thead>
            <tbody>
              {lista.map((p) => (
                <tr key={p.id}>
                  <td><b>{p.nome}</b>{p.id === perfil.id && <span className="pill azul" style={{ marginLeft: 8 }}>Você</span>}</td>
                  <td>{p.email}</td>
                  <td style={{ color: 'var(--suave)', maxWidth: 460 }}>{descAcessos(p)}</td>
                  <td>{p.ativo !== false ? <span className="pill verde">Ativo</span> : <span className="pill cinza">Inativo</span>}</td>
                  <td className="acoes">{podeEditar(p) && <button className="link-btn" onClick={() => editar(p)}>Editar</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

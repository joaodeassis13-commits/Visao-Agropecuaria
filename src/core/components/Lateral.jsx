import { Building2, LogOut, RefreshCw, Users, Wifi, WifiOff } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { moduloPorId, papelInfo } from '../modulos';
import { fmtDataHora, iniciais } from '../lib/util';

export function MarcaVA({ modulo }) {
  return <div className="logo-txt"><span className="va">VA</span>{moduloPorId(modulo)?.marca || ''}</div>;
}

/** itens do menu: do módulo ativo + administração */
export function useItensMenu(menus, podeMov) {
  const { modulo, ehGestor, ehAdmin, gerenciaUsuarios } = useApp();
  const ctx = { ehGestor, podeMov };
  const doModulo = (menus[modulo] || []).filter((i) => !i.visivel || i.visivel(ctx));
  const admin = [
    ehAdmin && { id: 'fazendas', label: 'Fazendas', icone: Building2, admin: true },
    gerenciaUsuarios && { id: 'usuarios', label: 'Usuários', icone: Users, admin: true },
  ].filter(Boolean);
  return { doModulo, admin };
}

export default function Lateral({ aberta, onFechar, itens }) {
  const {
    perfil, nav, setNav, modulo, setModulo, modulosDoUsuario, papel, ehAdmin,
    fazendaId, setFazendaId, fazendasDisponiveis, online, sincronizando, ultimaSync, erroSync,
    pendentes, sincronizar, sair,
  } = useApp();

  const ir = (id) => { setNav({ pagina: id }); onFechar?.(); };
  const paginaAtual = nav.pagina || itens.doModulo[0]?.id;
  const descPapel = ehAdmin ? 'Administrador' : (papelInfo(modulo, papel(modulo))?.l || '');

  const Item = ({ it }) => (
    <button className={`menu-item ${paginaAtual === it.id ? 'ativo' : ''}`} onClick={() => ir(it.id)}>
      <it.icone size={20} /> {it.label}
      {it.Badge ? <it.Badge /> : null}
    </button>
  );

  return (
    <aside className={`lateral ${aberta ? 'aberta' : ''}`}>
      <div className="logo">
        <img src="/icon.svg" alt="" />
        <MarcaVA modulo={modulo} />
      </div>

      {modulosDoUsuario.length > 1 && (
        <div className="seletor-modulo">
          {modulosDoUsuario.map((m) => (
            <button key={m.id} className={modulo === m.id ? 'ativo' : ''} onClick={() => { setModulo(m.id); onFechar?.(); }}>
              {m.nome}
            </button>
          ))}
        </div>
      )}

      <nav className="menu">
        {itens.doModulo.map((it) => <Item key={it.id} it={it} />)}
        {itens.admin.length > 0 && (
          <>
            <div className="menu-sep" />
            <div className="menu-grupo">Administração</div>
            {itens.admin.map((it) => <Item key={it.id} it={it} />)}
          </>
        )}
      </nav>

      <div className="lateral-rodape">
        <div>
          <div className="lat-label">Fazenda ativa</div>
          <select className="lat-select" value={fazendaId || ''} onChange={(e) => setFazendaId(e.target.value)}>
            {!fazendasDisponiveis.length && <option value="">Nenhuma fazenda</option>}
            {fazendasDisponiveis.map((f) => (
              <option key={f.id} value={f.id}>{f.nome}{!f.habilitada ? ' (desabilitada)' : ''}</option>
            ))}
          </select>
        </div>

        <div className="caixa-sync">
          <div className={`sync-status ${online ? '' : 'offline'}`}>
            {online ? <Wifi size={16} /> : <WifiOff size={16} />}
            {online ? 'Conectado' : 'Sem internet — trabalhando offline'}
          </div>
          <button className="sync-btn" disabled={!online || sincronizando} onClick={() => sincronizar(false)}>
            <RefreshCw size={15} className={sincronizando ? 'spin' : ''} />
            {sincronizando ? 'Sincronizando…' : 'Sincronizar agora'}
          </button>
          <div className="sync-info">
            {pendentes > 0
              ? <><b style={{ color: '#fff' }}>{pendentes}</b> lançamento(s) aguardando envio<br /></>
              : 'Tudo enviado · '}
            última sincronização: {ultimaSync ? fmtDataHora(ultimaSync) : 'nunca'}
            {erroSync && <div className="sync-erro">{erroSync}</div>}
          </div>
          <div className="sync-info">versão {__VERSAO__}</div>
        </div>

        <div className="usuario">
          <div className="avatar">{iniciais(perfil?.nome)}</div>
          <div>
            <div className="usuario-nome">{perfil?.nome}</div>
            <div className="usuario-tipo">{descPapel}</div>
          </div>
          <button className="btn-sair" title="Sair" onClick={sair}><LogOut size={19} /></button>
        </div>
      </div>
    </aside>
  );
}

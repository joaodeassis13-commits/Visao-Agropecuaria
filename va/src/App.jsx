import { useState } from 'react';
import { AlertCircle, CheckCircle2, Menu, Wifi, WifiOff } from 'lucide-react';
import { useApp } from './core/context/AppContext';
import { supabaseConfigurado } from './core/lib/supabase';
import Lateral, { MarcaVA, useItensMenu } from './core/components/Lateral';
import Login from './core/pages/Login';
import Fazendas from './core/pages/Fazendas';
import Usuarios from './core/pages/Usuarios';
import EmBreve from './core/pages/EmBreve';
import { MENUS } from './modulos';
import { usePodeMov } from './modulos/pec/lib/permissoes';

const PAGINAS_ADMIN = { fazendas: Fazendas, usuarios: Usuarios };

function Toasts() {
  const { toasts } = useApp();
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.tipo === 'erro' ? 'erro' : ''}`}>
          {t.tipo === 'erro' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />} {t.msg}
        </div>
      ))}
    </div>
  );
}

function Aviso({ titulo, children }) {
  return (
    <div className="login"><div className="login-caixa">
      <h2 style={{ marginTop: 0 }}>{titulo}</h2>
      {children}
    </div></div>
  );
}

export default function App() {
  const { session, perfil, logado, sair } = useApp();

  if (!supabaseConfigurado) {
    return (
      <Aviso titulo="Configuração pendente">
        <p>Crie o arquivo <code>.env</code> (ou as variáveis na Vercel) com <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code>.</p>
      </Aviso>
    );
  }
  if (session === undefined) return <div className="carregando">Carregando…</div>;
  if (!logado) return <><Login /><Toasts /></>;
  if (!perfil) return <div className="carregando">Carregando perfil…</div>;
  if (perfil.semPerfil || perfil.ativo === false) {
    return (
      <Aviso titulo="Acesso não liberado">
        <p>Seu usuário ainda não tem acesso à plataforma. Peça ao administrador para liberar.</p>
        <button className="btn" onClick={sair}>Sair</button>
      </Aviso>
    );
  }
  return <Plataforma />;
}

function Plataforma() {
  const { nav, modulo, modulosDoUsuario, online, pendentes, sair } = useApp();
  const podeMov = usePodeMov();
  const itens = useItensMenu(MENUS, podeMov);
  const [menuAberto, setMenuAberto] = useState(false);

  if (!modulosDoUsuario.length) {
    return (
      <Aviso titulo="Nenhum módulo liberado">
        <p>Seu usuário ainda não tem acesso a nenhum módulo. Peça ao administrador ou ao analista para liberar.</p>
        <button className="btn" onClick={sair}>Sair</button>
      </Aviso>
    );
  }

  const admin = itens.admin.find((i) => i.id === nav.pagina);
  const doModulo = itens.doModulo.find((i) => i.id === nav.pagina) || itens.doModulo[0];
  let conteudo;
  if (admin) {
    const P = PAGINAS_ADMIN[admin.id];
    conteudo = <P key={admin.id} />;
  } else if (doModulo) {
    conteudo = <doModulo.Pagina key={`${modulo}-${doModulo.id}`} />;
  } else {
    conteudo = <EmBreve key={modulo} />;
  }

  return (
    <div className="app">
      <Lateral aberta={menuAberto} onFechar={() => setMenuAberto(false)} itens={itens} />
      <div className={`veu ${menuAberto ? 'aberto' : ''}`} onClick={() => setMenuAberto(false)} />
      <main className="principal">
        <div className="topo-mobile">
          <button onClick={() => setMenuAberto(true)} aria-label="Menu"><Menu size={24} /></button>
          <MarcaVA modulo={modulo} />
          <div className="status-mini">
            {online ? <Wifi size={15} /> : <WifiOff size={15} />}
            {pendentes > 0 ? `${pendentes} a enviar` : online ? 'Conectado' : 'Offline'}
          </div>
        </div>
        {conteudo}
      </main>
      <Toasts />
    </div>
  );
}

import { Construction, Inbox, Lock } from 'lucide-react';

export function Campo({ label, obrigatorio, dica, className = '', children }) {
  return (
    <div className={`campo ${className}`}>
      {label && <label>{label}{obrigatorio && <span className="req">*</span>}</label>}
      {children}
      {dica && <div className="dica">{dica}</div>}
    </div>
  );
}

export function Cabecalho({ icone: Icone, titulo, desc, children }) {
  return (
    <div className="cab">
      {Icone && <div className="cab-icone"><Icone size={22} /></div>}
      <div>
        <h1>{titulo}</h1>
        {desc && <p>{desc}</p>}
      </div>
      {children && <div className="cab-acoes">{children}</div>}
    </div>
  );
}

export function Abas({ abas, ativa, onChange }) {
  return (
    <div className="abas">
      {abas.map((a) => (
        <button key={a.id} className={`aba ${ativa === a.id ? 'ativa' : ''}`} onClick={() => onChange(a.id)}>
          {a.label}
          {a.badge ? <span className="badge" style={{ marginLeft: 8 }}>{a.badge}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function Segmentado({ opcoes, valor, onChange }) {
  return (
    <div className="segmentado">
      {opcoes.map((o) => (
        <button type="button" key={o.v} className={valor === o.v ? 'ativo' : ''} onClick={() => onChange(o.v)}>{o.l}</button>
      ))}
    </div>
  );
}

export function Vazio({ icone: Icone = Inbox, children }) {
  return <div className="vazio"><Icone size={34} /><div>{children}</div></div>;
}

export function SemAcesso() {
  return (
    <div className="pagina">
      <div className="painel"><Vazio icone={Lock}>Você não tem acesso a esta área.</Vazio></div>
    </div>
  );
}

export function EmConstrucao({ icone: Icone = Construction, titulo, children }) {
  return (
    <div className="painel construcao">
      <div className="ic"><Icone size={26} /></div>
      <div>
        <h3>{titulo}</h3>
        <p>{children}</p>
        <div style={{ marginTop: 12 }}><span className="pill amarelo"><Construction size={13} /> Em construção</span></div>
      </div>
    </div>
  );
}

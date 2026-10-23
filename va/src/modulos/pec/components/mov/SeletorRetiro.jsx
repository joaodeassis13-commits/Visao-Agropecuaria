import { Home } from 'lucide-react';

export default function SeletorRetiro({ retiros, valor, onChange }) {
  if (!retiros.length) return null;
  if (retiros.length === 1) {
    return <div className="chips"><span className="chip"><Home size={15} /> {retiros[0].nome}</span></div>;
  }
  return (
    <div className="chips">
      {retiros.map((r) => (
        <button type="button" key={r.id} className={`chip ${valor === r.id ? 'ativo' : ''}`} onClick={() => onChange(r.id)}>
          <Home size={15} /> {r.nome}
        </button>
      ))}
    </div>
  );
}

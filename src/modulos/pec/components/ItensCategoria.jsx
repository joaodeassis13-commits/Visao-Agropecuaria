import { Plus, Trash2 } from 'lucide-react';
import { Campo } from '../../../core/components/ui';

export const itemVazio = () => ({ categoria_id: '', quantidade: '' });

/**
 * Lista de categoria x quantidade com botão "Outra categoria".
 * disponivel: { categoriaId: qtd } — mostra o saldo ao lado do nome.
 */
export default function ItensCategoria({
  value, onChange, categorias, multiplo = true, disponivel = null, bloqueado = false,
  rotuloCategoria = 'Categoria', rotuloQtd = 'Quantidade',
}) {
  const alterar = (i, campo, v) => onChange(value.map((it, j) => (j === i ? { ...it, [campo]: v } : it)));
  const total = value.reduce((s, i) => s + (Number(i.quantidade) || 0), 0);

  return (
    <div className="itens">
      {value.map((it, i) => (
        <div className="item-linha" key={i}>
          <Campo label={rotuloCategoria} obrigatorio>
            <select value={it.categoria_id} disabled={bloqueado} onChange={(e) => alterar(i, 'categoria_id', e.target.value)}>
              <option value="">Selecione</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}{disponivel ? ` — ${disponivel[c.id] || 0} no piquete` : ''}
                </option>
              ))}
            </select>
          </Campo>
          <Campo label={rotuloQtd} obrigatorio>
            <input type="number" min="1" step="1" inputMode="numeric" placeholder="Ex: 10" value={it.quantidade}
              disabled={bloqueado} onChange={(e) => alterar(i, 'quantidade', e.target.value)} />
          </Campo>
          {multiplo && value.length > 1 && !bloqueado ? (
            <button type="button" className="btn-icone" title="Remover" onClick={() => onChange(value.filter((_, j) => j !== i))}>
              <Trash2 size={17} />
            </button>
          ) : <span />}
        </div>
      ))}
      {multiplo && (
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          {!bloqueado && (
            <button type="button" className="btn sec peq" onClick={() => onChange([...value, itemVazio()])}>
              <Plus size={16} /> Outra categoria
            </button>
          )}
          {value.length > 1 && <span className="total-itens">Total: <b>{total}</b> cabeças</span>}
        </div>
      )}
    </div>
  );
}

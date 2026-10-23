import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Check, CloudOff, Info, Send, X } from 'lucide-react';
import { useApp } from '../../../../core/context/AppContext';
import { useDadosPec } from '../../hooks/useDadosPec';
import { db, uuid } from '../../../../core/lib/db';
import { estoqueDosPiquetes } from '../../lib/estoque';
import { fmtData, hoje, txt } from '../../../../core/lib/util';
import { Campo, Vazio } from '../../../../core/components/ui';
import ItensCategoria, { itemVazio } from '../ItensCategoria';
import { resumoItens } from './Historico';

export const STATUS_TRANSF = {
  pendente: { l: 'Aguardando aceite', c: 'amarelo' },
  aceita: { l: 'Aceita', c: 'verde' },
  recusada: { l: 'Recusada', c: 'vermelho' },
  cancelada: { l: 'Cancelada', c: 'cinza' },
};

/** Ações de aceitar/recusar/cancelar, reaproveitadas na aba Pendências */
export function useAcoesTransferencia() {
  const { perfil, salvar, toast } = useApp();
  const responder = async (t, status) => {
    const msg = {
      aceita: 'Aceitar esta transferência? Serão geradas as sugestões de saída e de entrada dos animais.',
      recusada: 'Recusar esta transferência?',
      cancelada: 'Cancelar esta transferência?',
    }[status];
    if (!window.confirm(msg)) return;
    const extra = status === 'cancelada' ? {} : { respondido_por: perfil.id, respondido_em: new Date().toISOString() };
    await salvar('pec_transferencias', { ...t, status, ...extra }, 'update');
    toast(status === 'aceita'
      ? `Transferência aceita.${navigator.onLine ? '' : ' As sugestões aparecem quando houver internet.'}`
      : `Transferência ${status}.`);
  };
  return responder;
}

export default function Transferencias() {
  const { perfil, fazendaId, salvar, toast, ehGestor } = useApp();
  const dados = useDadosPec();
  const responder = useAcoesTransferencia();
  const [f, setF] = useState({ data: hoje(), origem: '', destino: '', itens: [itemVazio()], observacoes: '' });
  const [salvando, setSalvando] = useState(false);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  const transferencias = useLiveQuery(
    () => (fazendaId ? db.pec_transferencias.where('fazenda_id').equals(fazendaId).toArray() : []), [fazendaId], [],
  );
  const fila = useLiveQuery(() => db.outbox.where('tabela').equals('pec_transferencias').toArray(), [], []);
  const pendIds = new Set(fila.map((x) => x.payload.id));

  useEffect(() => {
    if (!f.origem && dados.retirosPermitidos.length) set('origem', dados.retirosPermitidos[0].id);
  }, [dados.retirosPermitidos, f.origem]);

  const disponivel = useMemo(() => {
    if (!f.origem) return null;
    const ids = dados.piquetesTodos.filter((p) => p.retiro_id === f.origem).map((p) => p.id);
    return estoqueDosPiquetes(dados.estoque, ids);
  }, [f.origem, dados.estoque, dados.piquetesTodos]);

  const idsPermitidos = new Set(dados.retirosPermitidos.map((r) => r.id));

  async function enviar(e) {
    e.preventDefault();
    const its = f.itens.filter((i) => i.categoria_id || i.quantidade);
    if (!f.data) return toast('Informe a data.', 'erro');
    if (!f.origem || !f.destino) return toast('Selecione os retiros de origem e destino.', 'erro');
    if (f.origem === f.destino) return toast('O retiro de destino deve ser diferente da origem.', 'erro');
    if (!its.length) return toast('Informe a categoria e a quantidade.', 'erro');
    for (const i of its) {
      if (!i.categoria_id || !(Number(i.quantidade) > 0)) return toast('Preencha categoria e quantidade.', 'erro');
      const d = disponivel?.[i.categoria_id] || 0;
      if (Number(i.quantidade) > d) return toast(`O retiro de origem tem só ${d} animal(is) em "${dados.nomeCategoria(i.categoria_id)}".`, 'erro');
    }
    setSalvando(true);
    try {
      await salvar('pec_transferencias', {
        id: uuid(), fazenda_id: fazendaId, retiro_origem_id: f.origem, retiro_destino_id: f.destino, data: f.data,
        itens: its.map((i) => ({ categoria_id: i.categoria_id, quantidade: Number(i.quantidade) })),
        observacoes: txt(f.observacoes), status: 'pendente', solicitado_por: perfil.id, created_at: new Date().toISOString(),
      });
      toast('Transferência enviada para aceite do retiro de destino.');
      setF((s) => ({ ...s, itens: [itemVazio()], observacoes: '', destino: '' }));
    } catch (err) {
      toast(err.message, 'erro');
    } finally {
      setSalvando(false);
    }
  }

  const lista = [...transferencias]
    .filter((t) => idsPermitidos.has(t.retiro_origem_id) || idsPermitidos.has(t.retiro_destino_id))
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .slice(0, 100);

  if (!dados.retirosPermitidos.length) {
    return <div className="painel"><Vazio>Você não tem retiros liberados nesta fazenda.</Vazio></div>;
  }
  if (dados.retiros.length < 2) {
    return <div className="painel"><Vazio>Esta fazenda tem só um retiro — não há para onde transferir.</Vazio></div>;
  }

  return (
    <>
      <form className="painel" onSubmit={enviar}>
        <h3 className="painel-tit">Sugerir transferência</h3>
        <div className="grid">
          <Campo label="Data" obrigatorio>
            <input type="date" value={f.data} onChange={(e) => set('data', e.target.value)} />
          </Campo>
          <Campo label="Retiro de origem" obrigatorio>
            <select value={f.origem} onChange={(e) => setF((s) => ({ ...s, origem: e.target.value, itens: [itemVazio()] }))}>
              {dados.retirosPermitidos.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
            </select>
          </Campo>
          <Campo label="Retiro de destino" obrigatorio>
            <select value={f.destino} onChange={(e) => set('destino', e.target.value)}>
              <option value="">Selecione</option>
              {dados.retiros.filter((r) => r.id !== f.origem).map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
            </select>
          </Campo>
        </div>
        <div style={{ marginTop: 22 }}>
          <ItensCategoria value={f.itens} onChange={(v) => set('itens', v)}
            categorias={dados.categorias.filter((c) => (disponivel?.[c.id] || 0) > 0 || f.itens.some((i) => i.categoria_id === c.id))}
            disponivel={disponivel} />
        </div>
        <div className="grid" style={{ marginTop: 22 }}>
          <Campo label="Observações" className="span2">
            <input placeholder="Opcional" value={f.observacoes} onChange={(e) => set('observacoes', e.target.value)} />
          </Campo>
        </div>
        <div className="aviso info"><Info size={18} />
          A transferência só é efetivada após o aceite de quem cuida do retiro de destino. Depois do aceite, aparecem nas Pendências
          a sugestão de saída (retiro de origem) e a de entrada (retiro de destino).
        </div>
        <div className="acoes-form">
          <button className="btn" disabled={salvando}><Send size={17} /> {salvando ? 'Enviando…' : 'Enviar para aceite'}</button>
        </div>
      </form>

      <div className="secao-tit">Transferências</div>
      {!lista.length ? (
        <div className="tabela-wrap"><Vazio>Nenhuma transferência ainda.</Vazio></div>
      ) : (
        <div className="tabela-wrap">
          <table className="tabela">
            <thead>
              <tr><th>Data</th><th>Origem</th><th>Destino</th><th>Animais</th><th>Status</th><th /></tr>
            </thead>
            <tbody>
              {lista.map((t) => {
                const st = STATUS_TRANSF[t.status] || STATUS_TRANSF.pendente;
                const podeResponder = t.status === 'pendente' && idsPermitidos.has(t.retiro_destino_id)
                  && (t.solicitado_por !== perfil.id || ehGestor);
                const podeCancelar = t.status === 'pendente' && (t.solicitado_por === perfil.id || ehGestor);
                return (
                  <tr key={t.id}>
                    <td>{fmtData(t.data)}</td>
                    <td>{dados.nomeRetiro(t.retiro_origem_id)}</td>
                    <td>{dados.nomeRetiro(t.retiro_destino_id)}</td>
                    <td>{resumoItens(t.itens, dados.nomeCategoria)}{t.observacoes ? <div style={{ color: 'var(--suave)', fontSize: 13 }}>{t.observacoes}</div> : null}</td>
                    <td>
                      <span className={`pill ${st.c}`}>{st.l}</span>
                      {pendIds.has(t.id) && <span className="pill amarelo" style={{ marginLeft: 6 }}><CloudOff size={13} /></span>}
                    </td>
                    <td className="acoes">
                      {podeResponder && <>
                        <button className="link-btn" onClick={() => responder(t, 'aceita')}><Check size={15} /> Aceitar</button>
                        <button className="link-btn perigo" onClick={() => responder(t, 'recusada')}><X size={15} /> Recusar</button>
                      </>}
                      {podeCancelar && !podeResponder && <button className="link-btn perigo" onClick={() => responder(t, 'cancelada')}>Cancelar</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

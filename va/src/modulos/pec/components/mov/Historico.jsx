import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, CloudOff, Link2 } from 'lucide-react';
import { useApp } from '../../../../core/context/AppContext';
import { db } from '../../../../core/lib/db';
import { COMERCIAIS, comercialDoMotivo, MOVS } from '../../lib/constants';
import { idsVinculados } from '../../lib/estoque';
import { fmtData, fmtMoeda, fmtNum } from '../../../../core/lib/util';
import { Vazio } from '../../../../core/components/ui';

export function resumoItens(itens, nomeCategoria) {
  return (itens || []).map((i) => `${i.quantidade} ${nomeCategoria(i.categoria_id)}`).join(' · ');
}

function detalhes(m, d) {
  const p = [];
  switch (m.tipo) {
    case 'nascimento':
      p.push(m.sexo === 'M' ? 'Machos' : m.sexo === 'F' ? 'Fêmeas' : '');
      if (m.raca) p.push(m.raca);
      if (m.carimbo) p.push(`Carimbo ${m.carimbo}`);
      if (m.tratamentos) p.push(`Trat.: ${m.tratamentos}`);
      break;
    case 'morte': p.push(m.causa); break;
    case 'entrada': if (m.motivo) p.push(m.motivo); if (m.origem) p.push(`Origem: ${m.origem}`); break;
    case 'saida': if (m.motivo) p.push(m.motivo); if (m.destino) p.push(`Destino: ${m.destino}`); break;
    case 'mudanca_piquete': p.push(`→ ${d.nomePiquete(m.piquete_destino_id)}`, m.modo === 'total' ? 'Total' : 'Parcial'); break;
    case 'compra':
    case 'venda':
    case 'abate':
      if (m.raca) p.push(m.raca);
      if (m.peso_medio) p.push(`${fmtNum(m.peso_medio, 1)} kg`);
      if (m.tipo === 'abate' && m.rendimento_carcaca) p.push(`Rend. ${fmtNum(m.rendimento_carcaca, 1)}%`);
      if (m.tipo === 'abate' && m.peso_carcaca) p.push(`Carcaça ${fmtNum(m.peso_carcaca, 1)} kg`);
      if (m.origem) p.push(`Origem: ${m.origem}`);
      if (m.destino) p.push(`Destino: ${m.destino}`);
      if (m.valor_total) p.push(fmtMoeda(m.valor_total));
      if (m.vinculos?.length) p.push(`${m.vinculos.length} lançamento(s) de campo vinculado(s)`);
      break;
    case 'mudanca_categoria': p.push(`→ ${d.nomeCategoria(m.categoria_destino_id)}`); break;
    case 'ajuste': p.push(m.tipo_ajuste === 'entrada' ? 'Ajuste de entrada' : 'Ajuste de saída'); break;
    default:
  }
  if (m.observacoes) p.push(m.observacoes);
  return p.filter(Boolean).join(' · ');
}

export default function Historico({ tipo, dados }) {
  const { perfil, salvar, toast, ehGestor } = useApp();
  const fila = useLiveQuery(() => db.outbox.where('tabela').equals('pec_movimentacoes').toArray(), [], []);
  const perfis = useLiveQuery(() => db.perfis.toArray(), [], []);
  const pend = new Map(fila.map((x) => [x.payload.id, x]));
  const idsRet = new Set(dados.retirosPermitidos.map((r) => r.id));
  const vinculados = idsVinculados(dados.movs);
  const ehComercial = Boolean(COMERCIAIS[tipo]);

  // situação do vínculo comercial de uma entrada/saída
  const situacao = (m) => {
    const com = comercialDoMotivo(m.tipo, m.motivo);
    if (!com) return null;
    const nome = MOVS.find((x) => x.tipo === com).curto.toLowerCase();
    return vinculados.has(m.id)
      ? <span className="pill verde"><Link2 size={12} /> {nome} registrada</span>
      : <span className="pill amarelo">aguardando {nome}</span>;
  };

  const lista = dados.movs
    .filter((m) => m.tipo === tipo && !m.excluido && (ehComercial || idsRet.has(m.retiro_id)))
    .sort((a, b) => b.data.localeCompare(a.data) || String(b.created_at).localeCompare(String(a.created_at)))
    .slice(0, 100);

  async function excluir(m) {
    const msg = ehComercial
      ? 'Excluir este registro? As entradas/saídas vinculadas voltam a aguardar registro.'
      : vinculados.has(m.id)
        ? 'Este lançamento está vinculado a um registro comercial. Excluir mesmo assim? O estoque do piquete será recalculado.'
        : 'Excluir este lançamento? O estoque do piquete será recalculado.';
    if (!window.confirm(msg)) return;
    await salvar('pec_movimentacoes', { ...m, excluido: true }, 'update');
    toast('Lançamento excluído.');
  }

  const nomeUsuario = (id) => (id === perfil.id ? 'Você' : perfis.find((p) => p.id === id)?.nome || '—');

  return (
    <>
      <div className="secao-tit">Histórico de registros</div>
      {!lista.length ? (
        <div className="tabela-wrap"><Vazio>Nenhum lançamento ainda.</Vazio></div>
      ) : (
        <div className="tabela-wrap">
          <table className="tabela">
            <thead>
              <tr>
                <th>Data</th>{!ehComercial && <><th>Retiro</th><th>Piquete</th></>}<th>Animais</th><th>Detalhes</th><th>Por</th><th />
              </tr>
            </thead>
            <tbody>
              {lista.map((m) => {
                const p = pend.get(m.id);
                return (
                  <tr key={m.id}>
                    <td>{fmtData(m.data)}</td>
                    {!ehComercial && <><td>{dados.nomeRetiro(m.retiro_id)}</td><td>{dados.nomePiquete(m.piquete_id)}</td></>}
                    <td>{resumoItens(m.itens, dados.nomeCategoria)}</td>
                    <td style={{ color: 'var(--suave)' }}>
                      {detalhes(m, dados)}
                      {situacao(m) && <div style={{ marginTop: 4 }}>{situacao(m)}</div>}
                    </td>
                    <td>{nomeUsuario(m.usuario_id)}</td>
                    <td className="acoes">
                      {p && (p.erro
                        ? <span className="pill vermelho" title={p.erro}><AlertTriangle size={13} /> Recusado</span>
                        : <span className="pill amarelo" title="Aguardando internet"><CloudOff size={13} /> Pendente</span>)}
                      {(ehGestor || m.usuario_id === perfil.id) && (
                        <button className="link-btn perigo" onClick={() => excluir(m)}>Excluir</button>
                      )}
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

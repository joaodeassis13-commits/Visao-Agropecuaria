import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeftRight, Bell, Check, Link2, LogIn, LogOut, X } from 'lucide-react';
import { useApp } from '../../../core/context/AppContext';
import { useDadosPec } from '../hooks/useDadosPec';
import { db } from '../../../core/lib/db';
import { fmtData } from '../../../core/lib/util';
import { comercialDoMotivo, MOTIVO_TRANSFERENCIA, MOVS } from '../lib/constants';
import { idsVinculados } from '../lib/estoque';
import { usePodeMov } from '../lib/permissoes';
import { Cabecalho, Vazio } from '../../../core/components/ui';
import { resumoItens } from '../components/mov/Historico';
import { useAcoesTransferencia } from '../components/mov/Transferencias';

/** contador do menu: transferências a aceitar + sugestões + registros comerciais pendentes */
export function BadgePendenciasPec() {
  const { perfil, fazendaId, papel, ehGestor } = useApp();
  const n = useLiveQuery(async () => {
    if (!perfil || !fazendaId) return 0;
    const retiros = await db.retiros.where('fazenda_id').equals(fazendaId).toArray();
    let meus = retiros.map((r) => r.id);
    if (papel('pec') === 'capataz') {
      const v = await db.usuario_retiros.where('usuario_id').equals(perfil.id).toArray();
      const ids = new Set(v.filter((x) => x.modulo === 'pec').map((x) => x.retiro_id));
      meus = meus.filter((id) => ids.has(id));
    }
    const set = new Set(meus);
    const transf = await db.pec_transferencias.where('status').equals('pendente').toArray();
    const sug = await db.pec_sugestoes.where('status').equals('pendente').toArray();
    let comerciais = 0;
    if (ehGestor) {
      const movs = await db.pec_movimentacoes.where('fazenda_id').equals(fazendaId).toArray();
      const vinc = idsVinculados(movs);
      comerciais = movs.filter((m) => !m.excluido && comercialDoMotivo(m.tipo, m.motivo) && !vinc.has(m.id)).length;
    }
    return transf.filter((t) => t.fazenda_id === fazendaId && set.has(t.retiro_destino_id) && t.solicitado_por !== perfil.id).length
      + sug.filter((s) => s.fazenda_id === fazendaId && set.has(s.retiro_id)).length + comerciais;
  }, [perfil?.id, fazendaId, ehGestor, papel], 0);
  return n ? <span className="badge">{n}</span> : null;
}

export default function Pendencias() {
  const { perfil, fazendaId, setNav, salvar, toast, ehGestor } = useApp();
  const podeMov = usePodeMov();
  const dados = useDadosPec();
  const responder = useAcoesTransferencia();
  const ids = new Set(dados.retirosPermitidos.map((r) => r.id));

  const transf = useLiveQuery(() => db.pec_transferencias.where('status').equals('pendente').toArray(), [], []);
  const sugestoes = useLiveQuery(() => db.pec_sugestoes.where('status').equals('pendente').toArray(), [], []);

  const aguardandoMeuAceite = transf.filter((t) => t.fazenda_id === fazendaId && ids.has(t.retiro_destino_id)
    && (t.solicitado_por !== perfil.id || ehGestor));
  const minhasEnviadas = transf.filter((t) => t.fazenda_id === fazendaId && t.solicitado_por === perfil.id && !aguardandoMeuAceite.includes(t));
  const sugs = sugestoes.filter((s) => s.fazenda_id === fazendaId && ids.has(s.retiro_id))
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));

  function lancar(s) {
    if (!podeMov(s.tipo)) return toast('Seu usuário não tem permissão para este lançamento. Fale com o analista.', 'erro');
    setNav({
      pagina: 'movimentacoes', tab: s.tipo,
      prefill: {
        sugestao_id: s.id, transferencia_id: s.transferencia_id, retiro_id: s.retiro_id, itens: s.itens, motivo: MOTIVO_TRANSFERENCIA,
        origem: s.tipo === 'entrada' ? s.origem_destino : '', destino: s.tipo === 'saida' ? s.origem_destino : '',
      },
    });
  }

  // Entradas por compra e saídas por venda/abate ainda sem registro comercial (só para analista/admin)
  const vinculados = idsVinculados(dados.movs);
  const semRegistro = ehGestor
    ? dados.movs.filter((m) => !m.excluido && comercialDoMotivo(m.tipo, m.motivo) && !vinculados.has(m.id))
      .sort((a, b) => a.data.localeCompare(b.data))
    : [];

  function registrarComercial(m) {
    const tipo = comercialDoMotivo(m.tipo, m.motivo);
    setNav({ pagina: 'movimentacoes', tab: tipo, prefill: {
      vinculos: [m.id], itens: m.itens,
      origem: m.tipo === 'entrada' ? m.origem || '' : '', destino: m.tipo === 'saida' ? m.destino || '' : '',
    } });
  }

  async function descartar(s) {
    if (!window.confirm('Descartar esta sugestão? Os animais não serão movimentados por ela.')) return;
    await salvar('pec_sugestoes', { ...s, status: 'descartada' }, 'update');
  }

  return (
    <div className="pagina">
      <Cabecalho icone={Bell} titulo="Pendências"
        desc="Transferências aguardando o seu aceite, lançamentos sugeridos e entradas/saídas que ainda precisam do registro comercial." />

      <div className="secao-tit"><ArrowLeftRight size={17} /> Transferências aguardando aceite</div>
      {!aguardandoMeuAceite.length ? (
        <div className="tabela-wrap"><Vazio>Nada aguardando o seu aceite.</Vazio></div>
      ) : (
        <div className="lista-pend">
          {aguardandoMeuAceite.map((t) => (
            <div className="pend-card" key={t.id}>
              <div className="info">
                <div className="titulo">{dados.nomeRetiro(t.retiro_origem_id)} → {dados.nomeRetiro(t.retiro_destino_id)}</div>
                <div className="det">{fmtData(t.data)} · {resumoItens(t.itens, dados.nomeCategoria)}{t.observacoes ? ` · ${t.observacoes}` : ''}</div>
              </div>
              <button className="btn peq" onClick={() => responder(t, 'aceita')}><Check size={16} /> Aceitar</button>
              <button className="btn perigo peq" onClick={() => responder(t, 'recusada')}><X size={16} /> Recusar</button>
            </div>
          ))}
        </div>
      )}

      <div className="secao-tit">Lançamentos sugeridos</div>
      {!sugs.length ? (
        <div className="tabela-wrap"><Vazio>Nenhuma sugestão pendente.</Vazio></div>
      ) : (
        <div className="lista-pend">
          {sugs.map((s) => (
            <div className="pend-card" key={s.id}>
              <div className="info">
                <div className="titulo" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {s.tipo === 'saida' ? <LogOut size={17} /> : <LogIn size={17} />}
                  {s.tipo === 'saida' ? 'Saída' : 'Entrada'} de animais — {dados.nomeRetiro(s.retiro_id)}
                </div>
                <div className="det">{fmtData(s.data)} · {s.origem_destino} · {resumoItens(s.itens, dados.nomeCategoria)}</div>
              </div>
              <button className="btn peq" onClick={() => lancar(s)}>Lançar {s.tipo === 'saida' ? 'saída' : 'entrada'}</button>
              {ehGestor && <button className="btn sec peq" onClick={() => descartar(s)}>Descartar</button>}
            </div>
          ))}
        </div>
      )}

      {ehGestor && (
        <>
          <div className="secao-tit"><Link2 size={17} /> Aguardando registro de compra, venda ou abate</div>
          {!semRegistro.length ? (
            <div className="tabela-wrap"><Vazio>Todas as entradas e saídas comerciais já foram registradas.</Vazio></div>
          ) : (
            <div className="lista-pend">
              {semRegistro.map((m) => {
                const com = MOVS.find((x) => x.tipo === comercialDoMotivo(m.tipo, m.motivo));
                return (
                  <div className="pend-card" key={m.id}>
                    <div className="info">
                      <div className="titulo" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        {m.tipo === 'saida' ? <LogOut size={17} /> : <LogIn size={17} />}
                        {m.tipo === 'saida' ? 'Saída' : 'Entrada'} por {m.motivo.toLowerCase()} — {dados.nomeRetiro(m.retiro_id)} / {dados.nomePiquete(m.piquete_id)}
                      </div>
                      <div className="det">
                        {fmtData(m.data)} · {resumoItens(m.itens, dados.nomeCategoria)}
                        {m.origem ? ` · Origem: ${m.origem}` : ''}{m.destino ? ` · Destino: ${m.destino}` : ''}
                      </div>
                    </div>
                    <button className="btn peq" onClick={() => registrarComercial(m)}>Registrar {com.curto.toLowerCase()}</button>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {minhasEnviadas.length > 0 && (
        <>
          <div className="secao-tit">Enviadas por você (aguardando o destino)</div>
          <div className="lista-pend">
            {minhasEnviadas.map((t) => (
              <div className="pend-card" key={t.id}>
                <div className="info">
                  <div className="titulo">{dados.nomeRetiro(t.retiro_origem_id)} → {dados.nomeRetiro(t.retiro_destino_id)}</div>
                  <div className="det">{fmtData(t.data)} · {resumoItens(t.itens, dados.nomeCategoria)}</div>
                </div>
                <span className="pill amarelo">Aguardando aceite</span>
                <button className="btn sec peq" onClick={() => responder(t, 'cancelada')}>Cancelar</button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

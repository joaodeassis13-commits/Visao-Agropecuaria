import { useEffect, useMemo, useState } from 'react';
import { Info, Link2, Plus } from 'lucide-react';
import { useApp } from '../../../../core/context/AppContext';
import { useDadosPec } from '../../hooks/useDadosPec';
import { db, uuid } from '../../../../core/lib/db';
import {
  CAUSAS_MORTE, COMERCIAIS, MOTIVOS_ENTRADA, MOTIVOS_SAIDA, MOVS, RACAS,
} from '../../lib/constants';
import { DECREMENTAM, estoqueDoPiquete, idsVinculados } from '../../lib/estoque';
import { fmtData, hoje, num, txt } from '../../../../core/lib/util';
import { Campo, Segmentado, Vazio } from '../../../../core/components/ui';
import ItensCategoria, { itemVazio } from '../ItensCategoria';
import SeletorRetiro from './SeletorRetiro';
import Historico, { resumoItens } from './Historico';

const MULTIPLAS = ['entrada', 'saida', 'mudanca_piquete', 'compra', 'venda', 'abate'];
const FINANCEIRAS = ['compra', 'venda', 'abate'];

/** soma as categorias de vários lançamentos */
function somarItens(movs) {
  const acc = {};
  for (const m of movs) for (const i of m.itens || []) acc[i.categoria_id] = (acc[i.categoria_id] || 0) + Number(i.quantidade);
  return Object.entries(acc).map(([categoria_id, q]) => ({ categoria_id, quantidade: String(q) }));
}

function inicial(prefill) {
  return {
    data: hoje(),
    retiro_id: prefill?.retiro_id || '',
    piquete_id: '',
    piquete_destino_id: '',
    modo: 'parcial',
    itens: prefill?.itens?.length
      ? prefill.itens.map((i) => ({ categoria_id: i.categoria_id, quantidade: String(i.quantidade) }))
      : [itemVazio()],
    quantidade: '', sexo: '', raca: '', carimbo: '', tratamentos: '', causa: '',
    origem: prefill?.origem || '', destino: prefill?.destino || '',
    motivo: prefill?.motivo || '',
    vinculos: prefill?.vinculos || [],
    peso_medio: '', rendimento_carcaca: '', peso_carcaca: '', valor_cabeca: '', valor_total: '',
    tipo_ajuste: 'entrada', categoria_destino_id: '',
    observacoes: prefill?.observacoes || '',
    sugestao_id: prefill?.sugestao_id || null,
    transferencia_id: prefill?.transferencia_id || null,
  };
}

export default function MovForm({ tipo, prefill }) {
  const { perfil, fazendaId, salvar, toast, setNav } = useApp();
  const dados = useDadosPec();
  const cfg = MOVS.find((m) => m.tipo === tipo);
  const [f, setF] = useState(() => inicial(prefill));
  const [salvando, setSalvando] = useState(false);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  // retiro padrão
  useEffect(() => {
    if (!dados.retirosPermitidos.length) return;
    if (!dados.retirosPermitidos.some((r) => r.id === f.retiro_id)) set('retiro_id', dados.retirosPermitidos[0].id);
  }, [dados.retirosPermitidos, f.retiro_id]);

  const piquetesRetiro = dados.piquetes.filter((p) => p.retiro_id === f.retiro_id);
  const saldoPiquete = useMemo(() => estoqueDoPiquete(dados.estoque, f.piquete_id), [dados.estoque, f.piquete_id]);
  const disponivel = f.piquete_id ? Object.fromEntries(saldoPiquete.map((x) => [x.categoria_id, x.quantidade])) : null;
  const totalNoPiquete = saldoPiquete.reduce((s, x) => s + x.quantidade, 0);

  // Mudança de piquete total: preenche com todo o lote do piquete
  const chaveSaldo = saldoPiquete.map((x) => `${x.categoria_id}:${x.quantidade}`).join(',');
  useEffect(() => {
    if (tipo !== 'mudanca_piquete' || f.modo !== 'total') return;
    const its = saldoPiquete.map((x) => ({ categoria_id: x.categoria_id, quantidade: String(x.quantidade) }));
    setF((s) => ({ ...s, itens: its.length ? its : [itemVazio()] }));
  }, [tipo, f.modo, f.piquete_id, chaveSaldo]); // eslint-disable-line react-hooks/exhaustive-deps

  const qtdTotal = tipo === 'nascimento'
    ? Number(f.quantidade) || 0
    : f.itens.reduce((s, i) => s + (Number(i.quantidade) || 0), 0);

  // valor total = quantidade x valor por cabeça
  useEffect(() => {
    if (!FINANCEIRAS.includes(tipo)) return;
    const v = num(f.valor_cabeca);
    if (v != null && qtdTotal) set('valor_total', (v * qtdTotal).toFixed(2));
  }, [f.valor_cabeca, qtdTotal, tipo]);

  // peso de carcaça = peso médio x rendimento
  useEffect(() => {
    if (tipo !== 'abate') return;
    const p = num(f.peso_medio), r = num(f.rendimento_carcaca);
    if (p != null && r != null) set('peso_carcaca', ((p * r) / 100).toFixed(1));
  }, [f.peso_medio, f.rendimento_carcaca, tipo]);

  const categoriaBezerro = dados.categorias.find((c) => c.codigo === 'bezerro');
  const comercial = COMERCIAIS[tipo] || null;

  // Entradas/saídas de campo com o motivo correspondente e ainda sem registro comercial
  const candidatos = useMemo(() => {
    if (!comercial) return [];
    const usados = idsVinculados(dados.movs);
    return dados.movs
      .filter((m) => m.tipo === comercial.tipoCampo && m.motivo === comercial.motivo && !m.excluido
        && (!usados.has(m.id) || f.vinculos.includes(m.id)))
      .sort((a, b) => b.data.localeCompare(a.data));
  }, [comercial, dados.movs, f.vinculos]);

  function alternarVinculo(m) {
    setF((s) => {
      const vinculos = s.vinculos.includes(m.id) ? s.vinculos.filter((x) => x !== m.id) : [...s.vinculos, m.id];
      const sel = dados.movs.filter((x) => vinculos.includes(x.id));
      const itens = sel.length ? somarItens(sel) : [itemVazio()];
      const campoTexto = comercial.tipoCampo === 'entrada' ? 'origem' : 'destino';
      const texto = s[campoTexto] || sel.map((x) => x[campoTexto]).find(Boolean) || '';
      const maisRecente = sel.map((x) => x.data).sort().pop();
      return { ...s, vinculos, itens, [campoTexto]: texto, data: maisRecente || s.data };
    });
  }

  function validar() {
    if (!f.data) return 'Informe a data.';
    if (!comercial && !f.piquete_id) return 'Selecione o piquete.';
    if ((tipo === 'entrada' || tipo === 'saida') && !f.motivo) return 'Informe o motivo.';
    if (tipo === 'nascimento') {
      if (!(Number(f.quantidade) > 0)) return 'Informe a quantidade.';
      if (!f.sexo) return 'Informe o sexo.';
      if (!categoriaBezerro) return 'A categoria de bezerros (as) não foi encontrada. Sincronize e tente de novo.';
      return null;
    }
    const its = f.itens.filter((i) => i.categoria_id || i.quantidade);
    if (!its.length) return 'Informe a categoria e a quantidade.';
    for (const i of its) {
      if (!i.categoria_id) return 'Selecione a categoria.';
      if (!(Number(i.quantidade) > 0) || !Number.isInteger(Number(i.quantidade))) return 'Quantidade inválida.';
    }
    const ids = its.map((i) => i.categoria_id);
    if (new Set(ids).size !== ids.length) return 'Há categorias repetidas — some as quantidades numa linha só.';
    if (tipo === 'morte' && !f.causa) return 'Informe a causa da morte.';
    if (tipo === 'mudanca_piquete') {
      if (!f.piquete_destino_id) return 'Selecione o piquete de destino.';
      if (f.piquete_destino_id === f.piquete_id) return 'O destino deve ser diferente do piquete de origem.';
    }
    if (tipo === 'mudanca_categoria') {
      if (!f.categoria_destino_id) return 'Selecione a categoria de destino.';
      if (f.categoria_destino_id === its[0].categoria_id) return 'A categoria de destino deve ser diferente da origem.';
    }
    const decrementa = DECREMENTAM.includes(tipo) || (tipo === 'ajuste' && f.tipo_ajuste === 'saida');
    if (decrementa) {
      for (const i of its) {
        const d = disponivel?.[i.categoria_id] || 0;
        if (Number(i.quantidade) > d) return `O piquete tem só ${d} animal(is) em "${dados.nomeCategoria(i.categoria_id)}".`;
      }
    }
    return null;
  }

  async function enviar(e) {
    e.preventDefault();
    const erro = validar();
    if (erro) { toast(erro, 'erro'); return; }
    setSalvando(true);
    try {
      const piq = dados.piquetes.find((p) => p.id === f.piquete_id);
      const itens = tipo === 'nascimento'
        ? [{ categoria_id: categoriaBezerro.id, quantidade: Number(f.quantidade) }]
        : f.itens.filter((i) => i.categoria_id).map((i) => ({ categoria_id: i.categoria_id, quantidade: Number(i.quantidade) }));
      const row = {
        id: uuid(), fazenda_id: fazendaId, retiro_id: piq?.retiro_id ?? null, piquete_id: piq?.id ?? null, tipo, data: f.data, itens,
        motivo: tipo === 'entrada' || tipo === 'saida' ? f.motivo : null,
        vinculos: comercial ? f.vinculos : [],
        piquete_destino_id: tipo === 'mudanca_piquete' ? f.piquete_destino_id : null,
        categoria_destino_id: tipo === 'mudanca_categoria' ? f.categoria_destino_id : null,
        modo: tipo === 'mudanca_piquete' ? f.modo : null,
        sexo: tipo === 'nascimento' ? f.sexo : null,
        raca: txt(f.raca), carimbo: txt(f.carimbo), tratamentos: txt(f.tratamentos),
        causa: tipo === 'morte' ? f.causa : null,
        origem: txt(f.origem), destino: txt(f.destino),
        peso_medio: num(f.peso_medio), rendimento_carcaca: num(f.rendimento_carcaca), peso_carcaca: num(f.peso_carcaca),
        valor_cabeca: num(f.valor_cabeca), valor_total: num(f.valor_total),
        tipo_ajuste: tipo === 'ajuste' ? f.tipo_ajuste : null,
        observacoes: txt(f.observacoes),
        sugestao_id: f.sugestao_id, transferencia_id: f.transferencia_id,
        excluido: false, usuario_id: perfil.id, created_at: new Date().toISOString(),
      };
      await salvar('pec_movimentacoes', row);
      if (f.sugestao_id) {
        await db.pec_sugestoes.update(f.sugestao_id, { status: 'concluida', movimentacao_id: row.id });
        setNav({ pagina: 'movimentacoes', tab: tipo });
      }
      toast(`${cfg.curto} registrado(a)${navigator.onLine ? '' : ' — será enviado quando houver internet'}.`);
      setF((s) => ({ ...inicial(null), data: s.data, retiro_id: s.retiro_id, piquete_id: tipo === 'mudanca_piquete' ? '' : s.piquete_id }));
      if (prefill?.vinculos) setNav({ pagina: 'movimentacoes', tab: tipo });
    } catch (err) {
      toast(err.message, 'erro');
    } finally {
      setSalvando(false);
    }
  }

  if (!comercial && !dados.retirosPermitidos.length) {
    return <div className="painel"><Vazio>Você não tem retiros liberados nesta fazenda.</Vazio></div>;
  }

  const decrementa = DECREMENTAM.includes(tipo) || (tipo === 'ajuste' && f.tipo_ajuste === 'saida');
  const categoriasItens = decrementa && disponivel
    ? dados.categorias.filter((c) => disponivel[c.id] > 0 || f.itens.some((i) => i.categoria_id === c.id))
    : dados.categorias;

  return (
    <>
      {prefill?.sugestao_id && (
        <div className="aviso info"><Info size={18} />
          Lançamento gerado a partir de uma transferência aceita. Confira as quantidades e selecione o piquete.
        </div>
      )}

      {!comercial && (
        <SeletorRetiro retiros={dados.retirosPermitidos} valor={f.retiro_id}
          onChange={(id) => setF((s) => ({ ...s, retiro_id: id, piquete_id: '', piquete_destino_id: '' }))} />
      )}

      <form className="painel" onSubmit={enviar}>
        <h3 className="painel-tit">Novo lançamento</h3>

        <div className="grid">
          <Campo label="Data" obrigatorio>
            <input type="date" value={f.data} max={hoje()} onChange={(e) => set('data', e.target.value)} />
          </Campo>

          {tipo === 'mudanca_piquete' && (
            <Campo label="Tipo de mudança">
              <Segmentado opcoes={[{ v: 'parcial', l: 'Parcial' }, { v: 'total', l: 'Total' }]} valor={f.modo} onChange={(v) => set('modo', v)} />
            </Campo>
          )}

          {!comercial && (
            <Campo label={tipo === 'mudanca_piquete' ? 'Piquete de origem' : 'Piquete'} obrigatorio
              dica={f.piquete_id ? `${totalNoPiquete} animal(is) neste piquete` : (piquetesRetiro.length ? null : 'Nenhum piquete cadastrado neste retiro')}>
              <select value={f.piquete_id} onChange={(e) => set('piquete_id', e.target.value)}>
                <option value="">Selecione</option>
                {piquetesRetiro.map((p) => <option key={p.id} value={p.id}>{dados.rotuloPiquete(p)}</option>)}
              </select>
            </Campo>
          )}

          {(tipo === 'entrada' || tipo === 'saida') && (
            <Campo label="Motivo" obrigatorio>
              <select value={f.motivo} onChange={(e) => set('motivo', e.target.value)}>
                <option value="">Selecione</option>
                {(tipo === 'entrada' ? MOTIVOS_ENTRADA : MOTIVOS_SAIDA).map((m) => <option key={m}>{m}</option>)}
              </select>
            </Campo>
          )}

          {tipo === 'mudanca_piquete' && (
            <Campo label="Piquete de destino" obrigatorio>
              <select value={f.piquete_destino_id} onChange={(e) => set('piquete_destino_id', e.target.value)}>
                <option value="">Selecione</option>
                {piquetesRetiro.filter((p) => p.id !== f.piquete_id).map((p) => <option key={p.id} value={p.id}>{dados.rotuloPiquete(p)}</option>)}
              </select>
            </Campo>
          )}

          {tipo === 'nascimento' && (
            <>
              <Campo label="Quantidade" obrigatorio>
                <input type="number" min="1" inputMode="numeric" placeholder="Ex: 3" value={f.quantidade} onChange={(e) => set('quantidade', e.target.value)} />
              </Campo>
              <Campo label="Sexo" obrigatorio>
                <Segmentado opcoes={[{ v: 'M', l: 'Macho' }, { v: 'F', l: 'Fêmea' }]} valor={f.sexo} onChange={(v) => set('sexo', v)} />
              </Campo>
              <Campo label="Raça">
                <input list="lista-racas" placeholder="Selecione ou digite a raça" value={f.raca} onChange={(e) => set('raca', e.target.value)} />
              </Campo>
              <Campo label="Carimbo">
                <input placeholder="Ex: 6" value={f.carimbo} onChange={(e) => set('carimbo', e.target.value)} />
              </Campo>
              <Campo label="Tratamentos sanitários" className="span2">
                <input placeholder="Ex: cura de umbigo, vermífugo" value={f.tratamentos} onChange={(e) => set('tratamentos', e.target.value)} />
              </Campo>
            </>
          )}
        </div>

        {comercial && (
          <div style={{ marginTop: 22 }}>
            <div className="rotulo" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Link2 size={15} /> {comercial.nomeCampo === 'entradas' ? 'Entradas' : 'Saídas'} de campo com motivo "{comercial.motivo}"
            </div>
            {!candidatos.length ? (
              <p className="painel-sub" style={{ margin: 0 }}>
                Nenhuma {comercial.nomeCampo === 'entradas' ? 'entrada' : 'saída'} aguardando registro. Você pode registrar mesmo assim
                informando categorias e quantidades abaixo.
              </p>
            ) : (
              <div className="checks">
                {candidatos.map((m) => (
                  <label key={m.id} className={`check ${f.vinculos.includes(m.id) ? 'marcado' : ''}`}>
                    <input type="checkbox" checked={f.vinculos.includes(m.id)} onChange={() => alternarVinculo(m)} />
                    <span>
                      <b>{fmtData(m.data)}</b> · {dados.nomeRetiro(m.retiro_id)} / {dados.nomePiquete(m.piquete_id)}<br />
                      <span style={{ color: 'var(--suave)', fontSize: 13 }}>{resumoItens(m.itens, dados.nomeCategoria)}</span>
                    </span>
                  </label>
                ))}
              </div>
            )}
            {f.vinculos.length > 0 && (
              <div className="dica" style={{ fontSize: 13, color: 'var(--suave)', marginTop: 8 }}>
                Categorias e quantidades preenchidas pelos lançamentos vinculados (pode ajustar).
              </div>
            )}
          </div>
        )}

        {tipo !== 'nascimento' && (
          <div style={{ marginTop: 22 }}>
            {tipo === 'mudanca_piquete' && f.modo === 'total' && (
              <div className="aviso info" style={{ marginTop: 0, marginBottom: 14 }}><Info size={18} />
                {f.piquete_id
                  ? (totalNoPiquete ? `Todo o lote do piquete (${totalNoPiquete} cabeças) será movido.` : 'Não há animais neste piquete.')
                  : 'Selecione o piquete de origem para carregar o lote.'}
              </div>
            )}
            <ItensCategoria
              value={f.itens}
              onChange={(v) => set('itens', v)}
              categorias={categoriasItens}
              multiplo={MULTIPLAS.includes(tipo)}
              disponivel={decrementa ? disponivel : null}
              bloqueado={tipo === 'mudanca_piquete' && f.modo === 'total'}
              rotuloCategoria={tipo === 'mudanca_categoria' ? 'Categoria de origem' : 'Categoria'}
            />
          </div>
        )}

        <div className="grid" style={{ marginTop: 22 }}>
          {tipo === 'morte' && (
            <Campo label="Causa" obrigatorio>
              <select value={f.causa} onChange={(e) => set('causa', e.target.value)}>
                <option value="">Selecione</option>
                {CAUSAS_MORTE.map((c) => <option key={c}>{c}</option>)}
              </select>
            </Campo>
          )}

          {tipo === 'mudanca_categoria' && (
            <Campo label="Categoria de destino" obrigatorio>
              <select value={f.categoria_destino_id} onChange={(e) => set('categoria_destino_id', e.target.value)}>
                <option value="">Selecione</option>
                {dados.categorias.filter((c) => c.id !== f.itens[0]?.categoria_id).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </Campo>
          )}

          {tipo === 'ajuste' && (
            <Campo label="Tipo de ajuste" obrigatorio>
              <Segmentado opcoes={[{ v: 'entrada', l: 'Entrada' }, { v: 'saida', l: 'Saída' }]} valor={f.tipo_ajuste} onChange={(v) => set('tipo_ajuste', v)} />
            </Campo>
          )}

          {FINANCEIRAS.includes(tipo) && (
            <>
              <Campo label="Raça">
                <input list="lista-racas" placeholder="Selecione ou digite a raça" value={f.raca} onChange={(e) => set('raca', e.target.value)} />
              </Campo>
              <Campo label="Peso médio (kg)">
                <input inputMode="decimal" placeholder="Ex: 420" value={f.peso_medio} onChange={(e) => set('peso_medio', e.target.value)} />
              </Campo>
            </>
          )}

          {tipo === 'abate' && (
            <>
              <Campo label="Rendimento de carcaça (%)">
                <input inputMode="decimal" placeholder="Ex: 54" value={f.rendimento_carcaca} onChange={(e) => set('rendimento_carcaca', e.target.value)} />
              </Campo>
              <Campo label="Peso de carcaça (kg)" dica="Calculado pelo peso médio × rendimento (pode editar)">
                <input inputMode="decimal" value={f.peso_carcaca} onChange={(e) => set('peso_carcaca', e.target.value)} />
              </Campo>
            </>
          )}

          {(tipo === 'entrada' || tipo === 'compra') && (
            <Campo label="Origem">
              <input placeholder="De onde vieram os animais" value={f.origem} onChange={(e) => set('origem', e.target.value)} />
            </Campo>
          )}

          {(tipo === 'saida' || tipo === 'venda' || tipo === 'abate') && (
            <Campo label="Destino">
              <input placeholder={tipo === 'abate' ? 'Frigorífico' : 'Para onde vão os animais'} value={f.destino} onChange={(e) => set('destino', e.target.value)} />
            </Campo>
          )}

          {FINANCEIRAS.includes(tipo) && (
            <>
              <Campo label="Valor por cabeça (R$)">
                <input inputMode="decimal" placeholder="Ex: 3200,00" value={f.valor_cabeca} onChange={(e) => set('valor_cabeca', e.target.value)} />
              </Campo>
              <Campo label="Valor total (R$)" dica="Quantidade × valor por cabeça (pode editar)">
                <input inputMode="decimal" value={f.valor_total} onChange={(e) => set('valor_total', e.target.value)} />
              </Campo>
            </>
          )}

          <Campo label="Observações" className={tipo === 'nascimento' ? 'span-all' : 'span2'}>
            <input placeholder="Opcional" value={f.observacoes} onChange={(e) => set('observacoes', e.target.value)} />
          </Campo>
        </div>

        <datalist id="lista-racas">{RACAS.map((r) => <option key={r} value={r} />)}</datalist>

        <div className="acoes-form">
          <button className="btn" disabled={salvando}><Plus size={18} /> {salvando ? 'Salvando…' : 'Registrar'}</button>
        </div>
      </form>

      <Historico tipo={tipo} dados={dados} />
    </>
  );
}

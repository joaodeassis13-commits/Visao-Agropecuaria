import { useMemo, useState } from 'react';
import { Combine, Info, Plus } from 'lucide-react';
import { useApp } from '../../../core/context/AppContext';
import { useDadosPec } from '../hooks/useDadosPec';
import { uuid } from '../../../core/lib/db';
import { fmtData, fmtNum, hoje, ordenarNome, txt } from '../../../core/lib/util';
import { Cabecalho, Campo, SemAcesso, Vazio } from '../../../core/components/ui';
import { estoqueDoPiquete } from '../lib/estoque';

/** junta as geometrias dos talhões num MultiPolygon */
function unirGeometrias(areas) {
  const polys = [];
  for (const a of areas) {
    if (!a.geometria) continue;
    if (a.geometria.type === 'Polygon') polys.push(a.geometria.coordinates);
    else if (a.geometria.type === 'MultiPolygon') polys.push(...a.geometria.coordinates);
  }
  return polys.length ? { type: 'MultiPolygon', coordinates: polys } : null;
}

export default function Agrupamentos() {
  const { fazendaId, salvar, toast, ehGestor } = useApp();
  const dados = useDadosPec();
  const [form, setForm] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const set = (k, v) => setForm((s) => ({ ...s, [k]: v }));

  const grupos = useMemo(() => dados.piquetesTodos
    .filter((a) => a.tipo === 'agrupamento')
    .sort((a, b) => (a.ativo === b.ativo ? String(b.data_inicio).localeCompare(String(a.data_inicio)) : a.ativo ? -1 : 1)),
  [dados.piquetesTodos]);
  const emUso = useMemo(() => new Set(grupos.filter((g) => g.ativo).flatMap((g) => g.membros || [])), [grupos]);
  const talhoes = useMemo(() => dados.piquetesTodos
    .filter((a) => a.tipo === 'area' && a.departamento === 'agricultura' && a.ativo !== false)
    .sort(ordenarNome), [dados.piquetesTodos]);

  if (!ehGestor) return <SemAcesso />;

  const nomeArea = (id) => dados.piquetesTodos.find((a) => a.id === id)?.nome || '?';
  const animais = (g) => estoqueDoPiquete(dados.estoque, g.id).reduce((s, x) => s + x.quantidade, 0);

  function novo() {
    setForm({ nome: '', retiro_id: dados.retirosPermitidos[0]?.id || '', data_inicio: hoje(), especie: '', membros: [] });
  }
  const alternar = (id) => set('membros', form.membros.includes(id) ? form.membros.filter((x) => x !== id) : [...form.membros, id]);
  const selecionados = form ? talhoes.filter((t) => form.membros.includes(t.id)) : [];
  const areaSel = selecionados.reduce((s, t) => s + (Number(t.area_ha) || 0), 0);

  async function gravar(e) {
    e.preventDefault();
    const nome = form.nome.trim();
    if (!nome) return toast('Dê um nome ao agrupamento.', 'erro');
    if (!form.retiro_id) return toast('Selecione o retiro da pecuária que vai usar a área.', 'erro');
    if (!form.membros.length) return toast('Selecione ao menos um talhão.', 'erro');
    if (grupos.some((g) => g.ativo && g.nome.toLowerCase() === nome.toLowerCase())) return toast('Já existe um agrupamento ativo com esse nome.', 'erro');
    if (form.membros.some((id) => emUso.has(id))) return toast('Há talhões que já estão em outro agrupamento ativo.', 'erro');
    setSalvando(true);
    try {
      await salvar('areas', {
        id: uuid(), fazenda_id: fazendaId, retiro_id: form.retiro_id, nome, departamento: 'pecuaria', tipo: 'agrupamento',
        membros: form.membros, especie_forrageira: txt(form.especie), area_ha: Math.round(areaSel * 10000) / 10000,
        geometria: unirGeometrias(selecionados), data_inicio: form.data_inicio, data_fim: null, ativo: true,
        created_at: new Date().toISOString(),
      });
      toast('Agrupamento criado — já aparece como piquete nas movimentações.');
      setForm(null);
    } catch (err) {
      toast(err.message, 'erro');
    } finally {
      setSalvando(false);
    }
  }

  async function encerrar(g) {
    const n = animais(g);
    if (n > 0) return toast(`Retire os ${n} animais do agrupamento antes de encerrar (mudança de piquete ou saída).`, 'erro');
    if (!window.confirm(`Encerrar o agrupamento ${g.nome}? Os talhões voltam a ficar só com a agricultura.`)) return;
    await salvar('areas', { ...g, ativo: false, data_fim: hoje() }, 'update');
    toast('Agrupamento encerrado.');
  }

  const talhoesPorRetiro = dados.retiros
    .map((r) => ({ r, ts: talhoes.filter((t) => t.retiro_id === r.id) }))
    .filter((x) => x.ts.length);

  return (
    <div className="pagina">
      <Cabecalho icone={Combine} titulo="Agrupar talhões"
        desc="Na entressafra, com integração lavoura-pecuária, agrupe talhões da agricultura para usá-los como um piquete nos lançamentos da pecuária.">
        {!form && <button className="btn" onClick={novo}><Plus size={18} /> Novo agrupamento</button>}
      </Cabecalho>

      {form && (
        <form className="painel" onSubmit={gravar}>
          <h3 className="painel-tit">Novo agrupamento</h3>
          <div className="grid g4">
            <Campo label="Nome" obrigatorio>
              <input autoFocus placeholder="Ex: ILP Talhões 1 a 4" value={form.nome} onChange={(e) => set('nome', e.target.value)} />
            </Campo>
            <Campo label="Retiro da pecuária" obrigatorio dica="Quem cuida dos animais nesta área">
              <select value={form.retiro_id} onChange={(e) => set('retiro_id', e.target.value)}>
                {dados.retirosPermitidos.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
              </select>
            </Campo>
            <Campo label="Início" obrigatorio>
              <input type="date" value={form.data_inicio} onChange={(e) => set('data_inicio', e.target.value)} />
            </Campo>
            <Campo label="Forrageira">
              <input placeholder="Ex: Braquiária consorciada" value={form.especie} onChange={(e) => set('especie', e.target.value)} />
            </Campo>
          </div>

          <div style={{ marginTop: 22 }}>
            <div className="rotulo">Talhões da agricultura<span style={{ color: 'var(--erro)' }}> *</span></div>
            {!talhoesPorRetiro.length ? (
              <p className="painel-sub" style={{ margin: 0 }}>Nenhum talhão de agricultura cadastrado nesta fazenda.</p>
            ) : talhoesPorRetiro.map(({ r, ts }) => (
              <div className="grupo-retiros" key={r.id}>
                <h4>{r.nome}</h4>
                <div className="checks">
                  {ts.map((t) => {
                    const ocupado = emUso.has(t.id);
                    return (
                      <label key={t.id} className={`check ${form.membros.includes(t.id) ? 'marcado' : ''}`} style={ocupado ? { opacity: 0.5, cursor: 'not-allowed' } : null}>
                        <input type="checkbox" disabled={ocupado} checked={form.membros.includes(t.id)} onChange={() => alternar(t.id)} />
                        <span>{t.nome} <span style={{ color: 'var(--suave)', fontSize: 13 }}>· {fmtNum(t.area_ha, 1)} ha{ocupado ? ' · em outro agrupamento' : ''}</span></span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
            {selecionados.length > 0 && <div className="total-itens">{selecionados.length} talhão(ões) · <b>{fmtNum(areaSel, 2)} ha</b></div>}
          </div>

          <div className="aviso info"><Info size={18} />
            O agrupamento passa a aparecer como piquete do retiro escolhido. Para encerrá-lo, os animais precisam sair antes.
          </div>
          <div className="acoes-form">
            <button className="btn" disabled={salvando}>{salvando ? 'Salvando…' : 'Criar agrupamento'}</button>
            <button type="button" className="btn sec" onClick={() => setForm(null)}>Cancelar</button>
          </div>
        </form>
      )}

      <div className="secao-tit">Agrupamentos</div>
      {!grupos.length ? (
        <div className="tabela-wrap"><Vazio icone={Combine}>Nenhum agrupamento ainda.</Vazio></div>
      ) : (
        <div className="tabela-wrap">
          <table className="tabela">
            <thead><tr><th>Agrupamento</th><th>Retiro</th><th>Talhões</th><th className="num">Área (ha)</th><th>Período</th><th className="num">Animais</th><th>Status</th><th /></tr></thead>
            <tbody>
              {grupos.map((g) => (
                <tr key={g.id} style={g.ativo ? null : { opacity: 0.6 }}>
                  <td><b>{g.nome}</b>{g.especie_forrageira ? <div style={{ color: 'var(--suave)', fontSize: 13 }}>{g.especie_forrageira}</div> : null}</td>
                  <td>{dados.nomeRetiro(g.retiro_id)}</td>
                  <td style={{ color: 'var(--suave)' }}>{(g.membros || []).map(nomeArea).join(', ')}</td>
                  <td className="num">{fmtNum(g.area_ha, 2)}</td>
                  <td>{fmtData(g.data_inicio)}{g.data_fim ? ` a ${fmtData(g.data_fim)}` : ' →'}</td>
                  <td className="num">{g.ativo ? animais(g) : '—'}</td>
                  <td>{g.ativo ? <span className="pill verde">Ativo</span> : <span className="pill cinza">Encerrado</span>}</td>
                  <td className="acoes">{g.ativo && <button className="link-btn perigo" onClick={() => encerrar(g)}>Encerrar</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

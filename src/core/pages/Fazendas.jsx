import { Fragment, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, Building2, Download, FileUp, Home, Plus, Power } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { db, uuid } from '../lib/db';
import { CICLOS, DEPARTAMENTOS, nomeDepartamento } from '../modulos';
import { baixarModeloAreas, lerKML, lerPlanilhaAreas } from '../lib/importacao';
import { fmtNum, normalizar, ordenarNome, txt } from '../lib/util';
import { Cabecalho, Campo, SemAcesso, Vazio } from '../components/ui';

const nomeCiclo = (v) => CICLOS.find((c) => c.v === v)?.l || '—';
const soma = (lista) => lista.reduce((s, p) => s + (Number(p.area_ha) || 0), 0);

export default function Fazendas() {
  const { ehAdmin, salvar, toast } = useApp();
  const fazendas = useLiveQuery(() => db.fazendas.toArray(), [], []);
  const retiros = useLiveQuery(() => db.retiros.toArray(), [], []);
  const areas = useLiveQuery(() => db.areas.toArray(), [], []);
  const [editando, setEditando] = useState(null); // null | 'nova' | id

  if (!ehAdmin) return <SemAcesso />;

  if (editando) {
    return <EditorFazenda fazenda={fazendas.find((f) => f.id === editando) || null}
      onSalva={(id) => setEditando(id)} onVoltar={() => setEditando(null)} />;
  }

  async function alternar(f) {
    const acao = f.habilitada ? 'Desabilitar' : 'Habilitar';
    if (!window.confirm(`${acao} a fazenda ${f.nome}?${f.habilitada ? ' Os usuários deixam de acessá-la em todos os módulos.' : ''}`)) return;
    await salvar('fazendas', { ...f, habilitada: !f.habilitada }, 'update');
    toast(`Fazenda ${f.habilitada ? 'desabilitada' : 'habilitada'}.`);
  }

  return (
    <div className="pagina">
      <Cabecalho icone={Building2} titulo="Fazendas"
        desc="Cadastro único de fazendas, retiros e áreas, usado por todos os módulos. Cada área é um piquete (pecuária) ou um talhão (agricultura).">
        <button className="btn" onClick={() => setEditando('nova')}><Plus size={18} /> Nova fazenda</button>
      </Cabecalho>

      {!fazendas.length ? (
        <div className="painel"><Vazio icone={Building2}>Nenhuma fazenda cadastrada ainda.</Vazio></div>
      ) : (
        <div className="cards">
          {[...fazendas].sort(ordenarNome).map((f) => {
            const rs = retiros.filter((r) => r.fazenda_id === f.id);
            const as = areas.filter((a) => a.fazenda_id === f.id && a.tipo !== 'agrupamento' && a.ativo !== false);
            const pec = as.filter((a) => a.departamento === 'pecuaria');
            const agri = as.filter((a) => a.departamento === 'agricultura');
            return (
              <div className="card" key={f.id}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <h3 style={{ flex: 1 }}>{f.nome}</h3>
                  <span className={`pill ${f.habilitada ? 'verde' : 'cinza'}`}>{f.habilitada ? 'Habilitada' : 'Desabilitada'}</span>
                </div>
                <div className="linha">{f.municipio || 'Município não informado'}{f.ciclo_pecuario ? ` · Pecuária: ${nomeCiclo(f.ciclo_pecuario)}` : ''}</div>
                <div className="linha">Proprietário: {f.proprietario || '—'} · Responsável: {f.responsavel || '—'}</div>
                <div className="metricas">
                  <div><b>{rs.length}</b><span>Retiros</span></div>
                  <div><b>{fmtNum(soma(pec), 0)}</b><span>ha pecuária</span></div>
                  <div><b>{fmtNum(soma(agri), 0)}</b><span>ha agricultura</span></div>
                </div>
                <div className="rodape">
                  <button className="btn sec peq" onClick={() => setEditando(f.id)}>Editar</button>
                  <button className={`btn peq ${f.habilitada ? 'perigo' : ''}`} onClick={() => alternar(f)}>
                    <Power size={15} /> {f.habilitada ? 'Desabilitar' : 'Habilitar'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EditorFazenda({ fazenda, onSalva, onVoltar }) {
  const { salvar, toast } = useApp();
  const [f, setF] = useState(() => ({
    nome: fazenda?.nome || '', proprietario: fazenda?.proprietario || '', responsavel: fazenda?.responsavel || '',
    ciclo_pecuario: fazenda?.ciclo_pecuario || '', municipio: fazenda?.municipio || '',
  }));
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const retiros = useLiveQuery(() => (fazenda ? db.retiros.where('fazenda_id').equals(fazenda.id).toArray() : []), [fazenda?.id], []);
  const areas = useLiveQuery(() => (fazenda ? db.areas.where('fazenda_id').equals(fazenda.id).toArray() : []), [fazenda?.id], []);
  const [importando, setImportando] = useState(null); // null | 'novo' | retiro
  const [aberto, setAberto] = useState(null);

  const emAgrupamento = useMemo(() => {
    const m = new Map();
    for (const g of areas) if (g.tipo === 'agrupamento' && g.ativo) for (const id of g.membros || []) m.set(id, g.nome);
    return m;
  }, [areas]);

  async function gravar(e) {
    e.preventDefault();
    if (!f.nome.trim()) return toast('Informe o nome da fazenda.', 'erro');
    const row = {
      ...(fazenda || { id: uuid(), habilitada: true, created_at: new Date().toISOString() }),
      nome: f.nome.trim(), proprietario: txt(f.proprietario), responsavel: txt(f.responsavel),
      ciclo_pecuario: f.ciclo_pecuario || null, municipio: txt(f.municipio),
    };
    await salvar('fazendas', row);
    toast(fazenda ? 'Fazenda atualizada.' : 'Fazenda criada. Agora cadastre os retiros e as áreas.');
    if (!fazenda) { onSalva(row.id); setImportando('novo'); }
  }

  async function mudarDepartamento(a, departamento) {
    if (emAgrupamento.has(a.id)) return toast(`Este talhão está no agrupamento "${emAgrupamento.get(a.id)}". Encerre o agrupamento antes.`, 'erro');
    if (!window.confirm(`Passar ${a.nome} para ${nomeDepartamento(departamento)}?`)) return;
    await salvar('areas', { ...a, departamento }, 'update');
  }

  return (
    <div className="pagina">
      <button className="link-btn" onClick={onVoltar} style={{ marginBottom: 14 }}><ArrowLeft size={16} /> Voltar às fazendas</button>
      <Cabecalho icone={Building2} titulo={fazenda ? fazenda.nome : 'Nova fazenda'}
        desc="Dados gerais, retiros e áreas (via KML + planilha com departamento e espécie forrageira)." />

      <form className="painel" onSubmit={gravar}>
        <h3 className="painel-tit">Dados da fazenda</h3>
        <div className="grid">
          <Campo label="Fazenda" obrigatorio><input value={f.nome} onChange={(e) => set('nome', e.target.value)} placeholder="Nome da fazenda" /></Campo>
          <Campo label="Proprietário"><input value={f.proprietario} onChange={(e) => set('proprietario', e.target.value)} /></Campo>
          <Campo label="Responsável"><input value={f.responsavel} onChange={(e) => set('responsavel', e.target.value)} /></Campo>
          <Campo label="Município"><input value={f.municipio} onChange={(e) => set('municipio', e.target.value)} placeholder="Ex: Querência - MT" /></Campo>
          <Campo label="Ciclo da pecuária" dica="Deixe em branco se a fazenda não tem pecuária">
            <select value={f.ciclo_pecuario} onChange={(e) => set('ciclo_pecuario', e.target.value)}>
              <option value="">—</option>
              {CICLOS.map((c) => <option key={c.v} value={c.v}>{c.l}</option>)}
            </select>
          </Campo>
        </div>
        <div className="acoes-form"><button className="btn">{fazenda ? 'Salvar alterações' : 'Criar fazenda'}</button></div>
      </form>

      {fazenda && (
        <>
          <div className="secao-tit" style={{ justifyContent: 'space-between' }}>
            <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}><Home size={17} /> Retiros e áreas</span>
            {!importando && <button className="btn peq" onClick={() => setImportando('novo')}><Plus size={16} /> Novo retiro</button>}
          </div>

          {importando && (
            <ImportarRetiro fazendaId={fazenda.id} retiro={importando === 'novo' ? null : importando}
              areasExistentes={importando === 'novo' ? [] : areas.filter((a) => a.retiro_id === importando.id && a.tipo === 'area')}
              nomesUsados={retiros.filter((r) => r.id !== importando?.id).map((r) => normalizar(r.nome))}
              emAgrupamento={emAgrupamento}
              onFim={() => setImportando(null)} />
          )}

          {!retiros.length && !importando ? (
            <div className="tabela-wrap"><Vazio icone={Home}>Nenhum retiro cadastrado.</Vazio></div>
          ) : (
            <div className="tabela-wrap" style={{ marginTop: 14 }}>
              <table className="tabela">
                <thead><tr><th>Retiro</th><th className="num">Piquetes</th><th className="num">ha pecuária</th><th className="num">Talhões</th><th className="num">ha agricultura</th><th /></tr></thead>
                <tbody>
                  {[...retiros].sort(ordenarNome).map((r) => {
                    const as = areas.filter((a) => a.retiro_id === r.id && a.tipo === 'area' && a.ativo !== false).sort(ordenarNome);
                    const pec = as.filter((a) => a.departamento === 'pecuaria');
                    const agri = as.filter((a) => a.departamento === 'agricultura');
                    return (
                      <Fragment key={r.id}>
                        <tr>
                          <td><b>{r.nome}</b></td>
                          <td className="num">{pec.length}</td>
                          <td className="num">{fmtNum(soma(pec), 2)}</td>
                          <td className="num">{agri.length}</td>
                          <td className="num">{fmtNum(soma(agri), 2)}</td>
                          <td className="acoes">
                            <button className="link-btn" onClick={() => setAberto(aberto === r.id ? null : r.id)}>{aberto === r.id ? 'Ocultar' : 'Ver áreas'}</button>
                            <button className="link-btn" onClick={() => setImportando(r)}>Reimportar</button>
                          </td>
                        </tr>
                        {aberto === r.id && (
                          <tr>
                            <td colSpan={6} style={{ background: '#fafaf8' }}>
                              <table className="tabela">
                                <thead><tr><th>Área</th><th>Departamento</th><th>Espécie forrageira</th><th className="num">Área (ha)</th></tr></thead>
                                <tbody>
                                  {as.map((a) => (
                                    <tr key={a.id}>
                                      <td>{a.nome}{emAgrupamento.has(a.id) && <span className="pill azul" style={{ marginLeft: 8 }}>ILP: {emAgrupamento.get(a.id)}</span>}</td>
                                      <td>
                                        <select className="input" style={{ padding: '6px 10px', fontSize: 14, width: 'auto' }}
                                          value={a.departamento} onChange={(e) => mudarDepartamento(a, e.target.value)}>
                                          {DEPARTAMENTOS.map((d) => <option key={d.v} value={d.v}>{d.l}</option>)}
                                        </select>
                                      </td>
                                      <td>{a.departamento === 'pecuaria' ? (a.especie_forrageira || <span className="pill amarelo">não informada</span>) : '—'}</td>
                                      <td className="num">{fmtNum(a.area_ha, 2)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ImportarRetiro({ fazendaId, retiro, areasExistentes, nomesUsados, emAgrupamento, onFim }) {
  const { salvar, toast } = useApp();
  const [nome, setNome] = useState(retiro?.nome || '');
  const [deptPadrao, setDeptPadrao] = useState('pecuaria');
  const [kml, setKml] = useState(null);         // [{nome, geometria, area_ha}]
  const [planilha, setPlanilha] = useState(null); // [{nome, departamento, especie}]
  const [ajustes, setAjustes] = useState({});     // nome normalizado -> departamento escolhido na prévia
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  async function lerArquivoKml(arq) {
    setErro('');
    if (!arq) return setKml(null);
    try {
      if (/\.kmz$/i.test(arq.name)) throw new Error('Arquivo .kmz não suportado — exporte como .kml no Google Earth.');
      setKml(lerKML(await arq.text()));
    } catch (e) { setKml(null); setErro(e.message); }
  }
  async function lerArquivoPlanilha(arq) {
    setErro('');
    if (!arq) return setPlanilha(null);
    try {
      const linhas = await lerPlanilhaAreas(arq);
      if (!linhas.length) throw new Error('A planilha não tem linhas de áreas.');
      setPlanilha(linhas);
    } catch (e) { setPlanilha(null); setErro(e.message); }
  }

  const porNomePlanilha = new Map((planilha || []).map((e) => [normalizar(e.nome), e]));
  const porNomeExistente = new Map(areasExistentes.map((a) => [normalizar(a.nome), a]));
  const previa = (kml || []).map((p) => {
    const k = normalizar(p.nome);
    const pl = porNomePlanilha.get(k);
    const ex = porNomeExistente.get(k);
    const departamento = ajustes[k] || pl?.departamento || ex?.departamento || deptPadrao;
    return { ...p, k, departamento, especie: pl?.especie || (planilha ? '' : ex?.especie_forrageira || ''), naPlanilha: Boolean(pl) };
  });
  const nomesKml = new Set(previa.map((p) => p.k));
  const soNaPlanilha = (planilha || []).filter((e) => !nomesKml.has(normalizar(e.nome)));
  const semEspecie = previa.filter((p) => p.departamento === 'pecuaria' && !p.especie).length;
  const somentePlanilha = retiro && !kml && planilha;

  async function gravar() {
    const n = nome.trim();
    if (!n) return toast('Informe o nome do retiro.', 'erro');
    if (nomesUsados.includes(normalizar(n))) return toast('Já existe um retiro com esse nome nesta fazenda.', 'erro');
    if (!retiro && !kml) return toast('Importe o arquivo .kml com as áreas do retiro.', 'erro');
    const sumindo = kml ? areasExistentes.filter((a) => !nomesKml.has(normalizar(a.nome)) && a.ativo !== false) : [];
    const bloqueada = sumindo.find((a) => emAgrupamento.has(a.id));
    if (bloqueada) return toast(`${bloqueada.nome} está num agrupamento ativo e não pode sair do cadastro.`, 'erro');
    if (kml && semEspecie && !window.confirm(`${semEspecie} piquete(s) ficarão sem espécie forrageira. Continuar?`)) return;

    setSalvando(true);
    try {
      const r = retiro ? { ...retiro, nome: n } : { id: uuid(), fazenda_id: fazendaId, nome: n, created_at: new Date().toISOString() };
      await salvar('retiros', r);

      let rows = [];
      if (kml) {
        rows = previa.map((p) => {
          const ex = porNomeExistente.get(p.k);
          return {
            ...(ex || { id: uuid(), tipo: 'area', membros: [], created_at: new Date().toISOString() }),
            retiro_id: r.id, fazenda_id: fazendaId, nome: p.nome, geometria: p.geometria, area_ha: p.area_ha,
            departamento: p.departamento, especie_forrageira: p.departamento === 'pecuaria' ? (p.especie || null) : null, ativo: true,
          };
        });
        // áreas que sumiram do KML ficam inativas (preserva o histórico)
        for (const ex of sumindo) rows.push({ ...ex, ativo: false });
      } else if (somentePlanilha) {
        rows = areasExistentes.map((a) => {
          const pl = porNomePlanilha.get(normalizar(a.nome));
          if (!pl) return null;
          const departamento = pl.departamento || a.departamento;
          return { ...a, departamento, especie_forrageira: departamento === 'pecuaria' ? (pl.especie || null) : null };
        }).filter(Boolean);
      }
      if (rows.length) await salvar('areas', rows);
      toast(retiro ? 'Retiro atualizado.' : `Retiro ${n} criado com ${previa.length} área(s).`);
      onFim();
    } catch (e) {
      toast(e.message, 'erro');
    } finally {
      setSalvando(false);
    }
  }

  const nPec = previa.filter((p) => p.departamento === 'pecuaria');
  const nAgri = previa.filter((p) => p.departamento === 'agricultura');

  return (
    <div className="painel">
      <h3 className="painel-tit"><FileUp size={17} /> {retiro ? `Reimportar retiro ${retiro.nome}` : 'Novo retiro'}</h3>
      {retiro && <p className="painel-sub">Áreas com o mesmo nome são atualizadas; as que não estiverem no novo KML ficam inativas (o histórico é mantido).</p>}
      <div className="grid g4">
        <Campo label="Nome do retiro" obrigatorio><input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Retiro Sede" /></Campo>
        <Campo label="Arquivo KML das áreas" obrigatorio={!retiro} dica="Um polígono por área; o nome do polígono é o nome da área.">
          <input type="file" accept=".kml,application/vnd.google-earth.kml+xml" onChange={(e) => lerArquivoKml(e.target.files[0])} />
        </Campo>
        <Campo label="Planilha das áreas" dica="Colunas: Área, Departamento e Espécie forrageira.">
          <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => lerArquivoPlanilha(e.target.files[0])} />
        </Campo>
        <Campo label="Departamento padrão" dica="Para áreas sem departamento na planilha">
          <select value={deptPadrao} onChange={(e) => setDeptPadrao(e.target.value)}>
            {DEPARTAMENTOS.map((d) => <option key={d.v} value={d.v}>{d.l}</option>)}
          </select>
        </Campo>
      </div>
      <div className="acoes-form" style={{ marginTop: 14 }}>
        <button type="button" className="btn sec peq" onClick={baixarModeloAreas}><Download size={16} /> Baixar modelo da planilha</button>
      </div>

      {erro && <div className="aviso erro">{erro}</div>}

      {kml && (
        <>
          <div className="secao-tit" style={{ marginTop: 22 }}>
            Prévia — {nPec.length} piquete(s) · {fmtNum(soma(nPec), 2)} ha pecuária · {nAgri.length} talhão(ões) · {fmtNum(soma(nAgri), 2)} ha agricultura
          </div>
          {planilha && previa.some((p) => !p.naPlanilha) && <div className="aviso">{previa.filter((p) => !p.naPlanilha).length} área(s) do KML não estão na planilha (usam o departamento padrão).</div>}
          {soNaPlanilha.length > 0 && <div className="aviso">Na planilha mas não no KML: {soNaPlanilha.map((e) => e.nome).join(', ')}</div>}
          <div className="tabela-wrap" style={{ marginTop: 12, maxHeight: 380, overflowY: 'auto' }}>
            <table className="tabela">
              <thead><tr><th>Área</th><th className="num">ha</th><th>Departamento</th><th>Espécie forrageira</th></tr></thead>
              <tbody>
                {previa.map((p) => (
                  <tr key={p.k}>
                    <td>{p.nome}</td>
                    <td className="num">{fmtNum(p.area_ha, 2)}</td>
                    <td>
                      <select className="input" style={{ padding: '6px 10px', fontSize: 14, width: 'auto' }}
                        value={p.departamento} onChange={(e) => setAjustes((a) => ({ ...a, [p.k]: e.target.value }))}>
                        {DEPARTAMENTOS.map((d) => <option key={d.v} value={d.v}>{d.l}</option>)}
                      </select>
                    </td>
                    <td>{p.departamento === 'pecuaria' ? (p.especie || <span className="pill amarelo">não informada</span>) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {somentePlanilha && <div className="aviso info">Sem novo KML: só o departamento e a espécie das áreas existentes serão atualizados.</div>}

      <div className="acoes-form">
        <button className="btn" disabled={salvando} onClick={gravar}>{salvando ? 'Salvando…' : retiro ? 'Salvar retiro' : 'Criar retiro'}</button>
        <button className="btn sec" onClick={onFim}>Cancelar</button>
      </div>
    </div>
  );
}

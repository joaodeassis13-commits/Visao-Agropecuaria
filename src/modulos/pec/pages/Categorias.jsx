import { useState } from 'react';
import { Lock, Plus, Tags } from 'lucide-react';
import { useApp } from '../../../core/context/AppContext';
import { useDadosPec } from '../hooks/useDadosPec';
import { uuid } from '../../../core/lib/db';
import { SEXOS_CATEGORIA } from '../lib/constants';
import { estoqueDosPiquetes } from '../lib/estoque';
import { fmtNum, num } from '../../../core/lib/util';
import { Cabecalho, Campo } from '../../../core/components/ui';

const vazio = { id: null, nome: '', sexo: 'M', ua: '1', ativo: true };

export default function Categorias() {
  const { fazendaId, fazendaAtiva, salvar, toast, ehGestor } = useApp();
  const dados = useDadosPec();
  const [form, setForm] = useState(null);
  const set = (k, v) => setForm((s) => ({ ...s, [k]: v }));

  const lista = dados.categoriasTodas
    .filter((c) => !c.fazenda_id || c.fazenda_id === fazendaId)
    .sort((a, b) => (a.ordem ?? 999) - (b.ordem ?? 999) || a.nome.localeCompare(b.nome, 'pt-BR'));
  const totais = estoqueDosPiquetes(dados.estoque, dados.piquetesTodos.map((p) => p.id));

  async function gravar(e) {
    e.preventDefault();
    const nome = form.nome.trim();
    if (!nome) return toast('Informe o nome da categoria.', 'erro');
    if (lista.some((c) => c.nome.toLowerCase() === nome.toLowerCase() && c.id !== form.id)) return toast('Já existe uma categoria com esse nome.', 'erro');
    const ua = num(form.ua);
    if (ua == null || ua <= 0) return toast('Informe a equivalência em UA.', 'erro');
    const atual = lista.find((c) => c.id === form.id);
    await salvar('pec_categorias', {
      ...(atual || { id: uuid(), fazenda_id: fazendaId, ordem: 100 + lista.length, codigo: null, created_at: new Date().toISOString() }),
      nome, sexo: form.sexo, ua, ativo: form.ativo,
    });
    toast(atual ? 'Categoria atualizada.' : 'Categoria criada.');
    setForm(null);
  }

  return (
    <div className="pagina">
      <Cabecalho icone={Tags} titulo="Categorias"
        desc={`Categorias animais usadas nas movimentações. As padrão valem para todas as fazendas; as criadas aqui valem só para ${fazendaAtiva?.nome || 'a fazenda ativa'}.`}>
        {ehGestor && !form && <button className="btn" onClick={() => setForm(vazio)}><Plus size={18} /> Nova categoria</button>}
      </Cabecalho>

      {form && (
        <form className="painel" onSubmit={gravar}>
          <h3 className="painel-tit">{form.id ? 'Editar categoria' : 'Nova categoria'}</h3>
          <div className="grid g4">
            <Campo label="Nome" obrigatorio className="span2">
              <input autoFocus placeholder="Ex: Novilhas de reposição" value={form.nome} onChange={(e) => set('nome', e.target.value)} />
            </Campo>
            <Campo label="Sexo">
              <select value={form.sexo} onChange={(e) => set('sexo', e.target.value)}>
                {SEXOS_CATEGORIA.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}
              </select>
            </Campo>
            <Campo label="Equivalência (UA/cab)" dica="Usada no cálculo de lotação">
              <input inputMode="decimal" value={form.ua} onChange={(e) => set('ua', e.target.value)} />
            </Campo>
          </div>
          {form.id && (
            <label className="check" style={{ marginTop: 16, display: 'inline-flex' }}>
              <input type="checkbox" checked={form.ativo} onChange={(e) => set('ativo', e.target.checked)} /> Categoria ativa
            </label>
          )}
          <div className="acoes-form">
            <button className="btn">Salvar</button>
            <button type="button" className="btn sec" onClick={() => setForm(null)}>Cancelar</button>
          </div>
        </form>
      )}

      <div className="secao-tit">Categorias da fazenda</div>
      <div className="tabela-wrap">
        <table className="tabela">
          <thead>
            <tr><th>Categoria</th><th>Sexo</th><th className="num">UA/cab</th><th className="num">Rebanho atual</th><th>Origem</th><th /></tr>
          </thead>
          <tbody>
            {lista.map((c) => (
              <tr key={c.id} style={c.ativo === false ? { opacity: 0.5 } : null}>
                <td><b>{c.nome}</b>{c.ativo === false && <span className="pill cinza" style={{ marginLeft: 8 }}>Inativa</span>}</td>
                <td>{SEXOS_CATEGORIA.find((s) => s.v === c.sexo)?.l || '—'}</td>
                <td className="num">{fmtNum(c.ua, 2)}</td>
                <td className="num">{fmtNum(totais[c.id] || 0)}</td>
                <td>{c.fazenda_id ? <span className="pill verde">Desta fazenda</span> : <span className="pill cinza"><Lock size={12} /> Padrão</span>}</td>
                <td className="acoes">
                  {ehGestor && c.fazenda_id && (
                    <button className="link-btn" onClick={() => setForm({ id: c.id, nome: c.nome, sexo: c.sexo || 'M', ua: String(c.ua ?? 1), ativo: c.ativo !== false })}>Editar</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

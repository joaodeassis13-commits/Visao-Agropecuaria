import { db } from './db';
import { supabase, ehErroDeRede } from './supabase';

// Tabelas pequenas: substituídas por completo a cada sincronização
const COMPLETAS = [
  'perfis', 'usuario_modulos', 'usuario_fazendas', 'usuario_retiros', 'fazendas', 'retiros',
  'pec_categorias',
];
// Tabelas que crescem: baixadas de forma incremental pelo updated_at
const INCREMENTAIS = ['areas', 'pec_movimentacoes', 'pec_transferencias', 'pec_sugestoes'];

const chaveDe = (_tabela, row) => row.id;

/**
 * Grava localmente e coloca na fila de envio. Funciona offline.
 * op 'upsert' para registros novos; 'update' para alterar um registro que já existe
 * (ex.: aceitar transferência, excluir lançamento) — assim só a regra de UPDATE do RLS é avaliada.
 */
export async function salvarLocal(tabela, rows, op = 'upsert') {
  const lista = Array.isArray(rows) ? rows : [rows];
  const agora = new Date().toISOString();
  const prontos = lista.map((r) => ({ ...r, updated_at: agora }));
  await db.transaction('rw', db.table(tabela), db.outbox, async () => {
    await db.table(tabela).bulkPut(prontos);
    await db.outbox.bulkAdd(prontos.map((payload) => ({ tabela, op, payload, criado_em: Date.now(), tentativas: 0 })));
  });
  return Array.isArray(rows) ? prontos : prontos[0];
}

/** Envia a fila para o Supabase, na ordem em que foi gravada. Retorna nº de itens recusados. */
export async function enviarPendentes() {
  const fila = await db.outbox.orderBy('seq').toArray();
  let recusados = 0;
  for (const item of fila) {
    if ((item.tentativas || 0) >= 3) { recusados++; continue; }
    const { error } = item.op === 'update'
      ? await supabase.from(item.tabela).update(item.payload).eq('id', item.payload.id)
      : await supabase.from(item.tabela).upsert(item.payload);
    if (error) {
      if (ehErroDeRede(error)) throw error;
      await db.outbox.update(item.seq, { erro: error.message, tentativas: (item.tentativas || 0) + 1 });
      recusados++;
      continue;
    }
    await db.outbox.delete(item.seq);
  }
  return recusados;
}

async function buscarTudo(montarConsulta) {
  const tamanho = 1000;
  let de = 0;
  const todas = [];
  for (;;) {
    const { data, error } = await montarConsulta().range(de, de + tamanho - 1);
    if (error) throw error;
    todas.push(...data);
    if (data.length < tamanho) break;
    de += tamanho;
  }
  return todas;
}

/** Baixa do Supabase tudo o que o usuário pode ver (o RLS já filtra). */
export async function baixarDados() {
  const fila = await db.outbox.toArray();
  const pendentesPorTabela = {};
  for (const f of fila) (pendentesPorTabela[f.tabela] ||= []).push(f.payload);

  for (const tabela of COMPLETAS) {
    const rows = await buscarTudo(() => supabase.from(tabela).select('*'));
    await db.transaction('rw', db.table(tabela), async () => {
      await db.table(tabela).clear();
      await db.table(tabela).bulkPut(rows);
      // mantém o que ainda não subiu
      if (pendentesPorTabela[tabela]) await db.table(tabela).bulkPut(pendentesPorTabela[tabela]);
    });
  }

  for (const tabela of INCREMENTAIS) {
    const chave = `sync_${tabela}`;
    const meta = await db.meta.get(chave);
    // 5 min de sobreposição para não perder registros gravados durante a leitura
    const desde = meta?.valor ? new Date(new Date(meta.valor).getTime() - 5 * 60 * 1000).toISOString() : null;
    const rows = await buscarTudo(() => {
      let q = supabase.from(tabela).select('*').order('updated_at').order('id');
      if (desde) q = q.gt('updated_at', desde);
      return q;
    });
    if (!rows.length) continue;
    const idsPendentes = new Set((pendentesPorTabela[tabela] || []).map((p) => chaveDe(tabela, p)));
    await db.table(tabela).bulkPut(rows.filter((r) => !idsPendentes.has(r.id)));
    const maior = rows.reduce((m, r) => (r.updated_at > m ? r.updated_at : m), meta?.valor || '');
    await db.meta.put({ chave, valor: maior });
  }
}

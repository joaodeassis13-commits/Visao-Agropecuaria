import Dexie from 'dexie';

// Banco local (IndexedDB): espelho dos dados do Supabase + fila de envio (outbox)
export const db = new Dexie('va');

db.version(1).stores({
  // núcleo
  perfis: 'id',
  usuario_modulos: '[usuario_id+modulo], usuario_id, modulo',
  usuario_fazendas: '[usuario_id+modulo+fazenda_id], usuario_id, fazenda_id',
  usuario_retiros: '[usuario_id+modulo+retiro_id], usuario_id, retiro_id',
  fazendas: 'id',
  retiros: 'id, fazenda_id',
  areas: 'id, retiro_id, fazenda_id',
  // pecuária
  pec_categorias: 'id, fazenda_id',
  pec_movimentacoes: 'id, fazenda_id, retiro_id, tipo, data',
  pec_transferencias: 'id, fazenda_id, status',
  pec_sugestoes: 'id, fazenda_id, retiro_id, status',
  // controle
  outbox: '++seq, tabela',
  meta: 'chave',
});

export const uuid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  }));

export async function limparBanco() {
  await Promise.all(db.tables.map((t) => t.clear()));
}

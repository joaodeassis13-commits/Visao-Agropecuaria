// Cálculo do estoque de animais por piquete e categoria, a partir das movimentações.
// Compras, vendas e abates são registros comerciais: quem mexe no estoque são as entradas e saídas.
const SINAL = {
  nascimento: 1, entrada: 1,
  morte: -1, saida: -1, mudanca_piquete: -1, mudanca_categoria: -1,
};

export const DECREMENTAM = ['morte', 'saida', 'mudanca_piquete', 'mudanca_categoria'];

/** ids das entradas/saídas que já estão vinculadas a algum registro comercial */
export function idsVinculados(movs) {
  const set = new Set();
  for (const m of movs) if (!m.excluido && Array.isArray(m.vinculos)) m.vinculos.forEach((id) => set.add(id));
  return set;
}

export function efeitos(m) {
  if (m.excluido) return [];
  const sinal = m.tipo === 'ajuste' ? (m.tipo_ajuste === 'entrada' ? 1 : -1) : (SINAL[m.tipo] ?? 0);
  const out = [];
  for (const i of m.itens || []) {
    const q = Number(i.quantidade) || 0;
    if (!q || !i.categoria_id) continue;
    if (sinal) out.push({ piquete_id: m.piquete_id, categoria_id: i.categoria_id, qtd: sinal * q });
    if (m.tipo === 'mudanca_piquete' && m.piquete_destino_id)
      out.push({ piquete_id: m.piquete_destino_id, categoria_id: i.categoria_id, qtd: q });
    if (m.tipo === 'mudanca_categoria' && m.categoria_destino_id)
      out.push({ piquete_id: m.piquete_id, categoria_id: m.categoria_destino_id, qtd: q });
  }
  return out;
}

/** Map "piqueteId|categoriaId" -> quantidade */
export function calcularEstoque(movs) {
  const mapa = new Map();
  for (const m of movs) {
    for (const e of efeitos(m)) {
      const k = `${e.piquete_id}|${e.categoria_id}`;
      mapa.set(k, (mapa.get(k) || 0) + e.qtd);
    }
  }
  return mapa;
}

/** [{categoria_id, quantidade}] com saldo positivo no piquete */
export function estoqueDoPiquete(estoque, piqueteId) {
  const r = [];
  if (!piqueteId) return r;
  for (const [k, q] of estoque) {
    const [p, c] = k.split('|');
    if (p === piqueteId && q > 0) r.push({ categoria_id: c, quantidade: q });
  }
  return r;
}

/** { categoriaId: quantidade } somando vários piquetes */
export function estoqueDosPiquetes(estoque, piqueteIds) {
  const set = new Set(piqueteIds);
  const acc = {};
  for (const [k, q] of estoque) {
    const [p, c] = k.split('|');
    if (set.has(p)) acc[c] = (acc[c] || 0) + q;
  }
  return acc;
}

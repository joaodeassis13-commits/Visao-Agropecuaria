export const hoje = () => new Date().toLocaleDateString('en-CA');

export const fmtData = (iso) => {
  if (!iso) return '—';
  const [a, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
};

export const fmtDataHora = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

export const num = (v) => {
  if (v === '' || v == null) return null;
  const s = String(v).trim();
  const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);
  return Number.isFinite(n) ? n : null;
};

export const txt = (v) => {
  const s = (v ?? '').toString().trim();
  return s || null;
};

export const fmtNum = (v, casas = 0) =>
  v == null || v === '' ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });

export const fmtMoeda = (v) =>
  v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const normalizar = (s) =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

export const ordenarNome = (a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR', { numeric: true });

export const iniciais = (nome) =>
  String(nome || '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();

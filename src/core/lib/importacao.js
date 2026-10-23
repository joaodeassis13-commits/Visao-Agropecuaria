import { area } from '@turf/area';
import * as XLSX from 'xlsx';
import { normalizar } from './util';

function filhoTexto(el, tag) {
  for (const c of el.children) if (c.localName === tag) return c.textContent;
  return null;
}

function lerAnel(el) {
  const c = el.getElementsByTagName('coordinates')[0];
  if (!c) return null;
  const pts = c.textContent.trim().split(/\s+/)
    .map((s) => s.split(',').map(Number))
    .filter((p) => p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]))
    .map((p) => [p[0], p[1]]);
  if (pts.length < 3) return null;
  const a = pts[0], b = pts[pts.length - 1];
  if (a[0] !== b[0] || a[1] !== b[1]) pts.push([a[0], a[1]]);
  return pts;
}

function lerPoligono(pol) {
  const ext = pol.getElementsByTagName('outerBoundaryIs')[0];
  const anel = ext && lerAnel(ext);
  if (!anel) return null;
  const internos = [...pol.getElementsByTagName('innerBoundaryIs')].map(lerAnel).filter(Boolean);
  return [anel, ...internos];
}

/** Lê um .kml e devolve [{ nome, geometria (GeoJSON), area_ha }] */
export function lerKML(texto) {
  const xml = new DOMParser().parseFromString(texto, 'text/xml');
  if (xml.getElementsByTagName('parsererror').length) throw new Error('Arquivo KML inválido.');
  const usados = new Map();
  const saida = [];
  for (const pm of xml.getElementsByTagName('Placemark')) {
    const polys = [...pm.getElementsByTagName('Polygon')].map(lerPoligono).filter(Boolean);
    if (!polys.length) continue;
    let nome = (filhoTexto(pm, 'name') || '').trim() || `Piquete ${saida.length + 1}`;
    const n = normalizar(nome);
    if (usados.has(n)) { usados.set(n, usados.get(n) + 1); nome = `${nome} (${usados.get(n)})`; } else usados.set(n, 1);
    const geometria = polys.length === 1 ? { type: 'Polygon', coordinates: polys[0] } : { type: 'MultiPolygon', coordinates: polys };
    saida.push({ nome, geometria, area_ha: Math.round((area(geometria) / 10000) * 10000) / 10000 });
  }
  if (!saida.length) throw new Error('Nenhum polígono encontrado no KML.');
  return saida;
}

export function lerDepartamento(v) {
  const n = normalizar(v);
  if (!n) return null;
  if (/agri|lavoura|talh|soja|milho|cultura/.test(n)) return 'agricultura';
  if (/pec|pasto|pastagem|piquete|gado/.test(n)) return 'pecuaria';
  return null;
}

/**
 * Lê a planilha de áreas (xlsx/xls/csv).
 * Colunas: Área (piquete/talhão), Departamento (Pecuária/Agricultura) e Espécie forrageira.
 * Devolve [{ nome, departamento|null, especie }]
 */
export async function lerPlanilhaAreas(arquivo) {
  const wb = XLSX.read(await arquivo.arrayBuffer());
  const ws = wb.Sheets[wb.SheetNames[0]];
  const linhas = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const ehNome = (c) => { const n = normalizar(c); return /piquete|talhao|^area$|^area |nome/.test(n) && !/\(ha\)|hectare/.test(n); };
  const h = linhas.findIndex((l) => l.some(ehNome));
  let ip = 0, idp = -1, ie = 1;
  if (h >= 0) {
    ip = linhas[h].findIndex(ehNome);
    idp = linhas[h].findIndex((c) => normalizar(c).includes('depart'));
    ie = linhas[h].findIndex((c) => { const n = normalizar(c); return n.includes('especie') || n.includes('forrage') || n.includes('capim'); });
  }
  return linhas.slice(h + 1)
    .map((l) => ({
      nome: String(l[ip] ?? '').trim(),
      departamento: idp >= 0 ? lerDepartamento(l[idp]) : null,
      especie: ie >= 0 ? String(l[ie] ?? '').trim() : '',
    }))
    .filter((r) => r.nome);
}

export function baixarModeloAreas() {
  const ws = XLSX.utils.aoa_to_sheet([
    ['Área', 'Departamento', 'Espécie forrageira'],
    ['Piquete 01', 'Pecuária', 'Brachiaria brizantha cv. Marandu'],
    ['Piquete 02', 'Pecuária', 'Panicum maximum cv. Mombaça'],
    ['Talhão 01', 'Agricultura', ''],
  ]);
  ws['!cols'] = [{ wch: 18 }, { wch: 16 }, { wch: 38 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Áreas');
  XLSX.writeFile(wb, 'modelo_areas.xlsx');
}

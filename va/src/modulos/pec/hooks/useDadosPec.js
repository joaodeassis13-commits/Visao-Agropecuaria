import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../core/lib/db';
import { useApp } from '../../../core/context/AppContext';
import { calcularEstoque } from '../lib/estoque';
import { ordenarNome } from '../../../core/lib/util';

/**
 * Dados da pecuária na fazenda ativa, filtrados pelo acesso do usuário.
 * "piquetes" = áreas do departamento pecuária ativas (inclui agrupamentos de talhões em ILP).
 */
export function useDadosPec() {
  const { fazendaId, perfil, papel } = useApp();
  const ehCapataz = papel('pec') === 'capataz';
  const retiros = useLiveQuery(() => (fazendaId ? db.retiros.where('fazenda_id').equals(fazendaId).toArray() : []), [fazendaId], []);
  const vinculos = useLiveQuery(() => (perfil ? db.usuario_retiros.where('usuario_id').equals(perfil.id).toArray() : []), [perfil?.id], []);
  const piquetesTodos = useLiveQuery(() => (fazendaId ? db.areas.where('fazenda_id').equals(fazendaId).toArray() : []), [fazendaId], []);
  const categoriasTodas = useLiveQuery(() => db.pec_categorias.toArray(), [], []);
  const movs = useLiveQuery(() => (fazendaId ? db.pec_movimentacoes.where('fazenda_id').equals(fazendaId).toArray() : []), [fazendaId], []);

  return useMemo(() => {
    const retirosOrd = [...retiros].sort(ordenarNome);
    const retirosPermitidos = ehCapataz
      ? retirosOrd.filter((r) => vinculos.some((v) => v.modulo === 'pec' && v.retiro_id === r.id))
      : retirosOrd;
    const idsPerm = new Set(retirosPermitidos.map((r) => r.id));
    const piquetes = piquetesTodos
      .filter((p) => p.departamento === 'pecuaria' && p.ativo !== false && idsPerm.has(p.retiro_id))
      .sort((a, b) => (a.tipo === b.tipo ? ordenarNome(a, b) : a.tipo === 'agrupamento' ? 1 : -1));
    const rotuloPiquete = (p) => (p.tipo === 'agrupamento' ? `${p.nome} (talhões agrupados)` : p.nome);
    const categorias = categoriasTodas
      .filter((c) => c.ativo !== false && (!c.fazenda_id || c.fazenda_id === fazendaId))
      .sort((a, b) => (a.ordem ?? 999) - (b.ordem ?? 999) || a.nome.localeCompare(b.nome, 'pt-BR'));
    const estoque = calcularEstoque(movs);
    const nomeCategoria = (id) => categoriasTodas.find((c) => c.id === id)?.nome || '—';
    const nomePiquete = (id) => piquetesTodos.find((p) => p.id === id)?.nome || '—';
    const nomeRetiro = (id) => retiros.find((r) => r.id === id)?.nome || '—';
    return {
      retiros: retirosOrd, retirosPermitidos, piquetes, piquetesTodos, categorias, categoriasTodas,
      estoque, movs, nomeCategoria, nomePiquete, nomeRetiro, rotuloPiquete,
    };
  }, [retiros, vinculos, piquetesTodos, categoriasTodas, movs, ehCapataz, fazendaId]);
}

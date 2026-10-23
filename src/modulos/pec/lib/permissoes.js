import { useCallback } from 'react';
import { useApp } from '../../../core/context/AppContext';
import { MOVS } from './constants';

/** O que o usuário pode lançar na pecuária (admin/analista: tudo; capataz: conforme permissões) */
export function usePodeMov() {
  const { perfil, papel, ehAdmin } = useApp();
  return useCallback((tipo) => {
    if (ehAdmin || papel('pec') === 'analista') return true;
    if (papel('pec') !== 'capataz') return false;
    const perm = perfil?.acessos?.pec?.permissoes || {};
    if (tipo === 'pastagens') return perm.pastagens !== false;
    const m = MOVS.find((x) => x.tipo === tipo);
    return Boolean(m?.capataz) && perm[tipo] !== false;
  }, [perfil, papel, ehAdmin]);
}

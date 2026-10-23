import { ArrowLeftRight, Bell, Combine, Map, Sprout, Tags } from 'lucide-react';
import Movimentacoes from './pec/pages/Movimentacoes';
import Pendencias, { BadgePendenciasPec } from './pec/pages/Pendencias';
import Pastagens from './pec/pages/Pastagens';
import Agrupamentos from './pec/pages/Agrupamentos';
import Mapas from './pec/pages/Mapas';
import Categorias from './pec/pages/Categorias';

/**
 * Menu de cada módulo. "visivel(ctx)" recebe { ehGestor, podeMov }.
 * Módulos sem itens mostram a tela "Em breve".
 */
export const MENUS = {
  pec: [
    { id: 'movimentacoes', label: 'Movimentações', icone: ArrowLeftRight, Pagina: Movimentacoes },
    { id: 'pendencias', label: 'Pendências', icone: Bell, Pagina: Pendencias, Badge: BadgePendenciasPec },
    { id: 'pastagens', label: 'Manejo de pastagens', icone: Sprout, Pagina: Pastagens, visivel: (c) => c.podeMov('pastagens') },
    { id: 'agrupamentos', label: 'Agrupar talhões', icone: Combine, Pagina: Agrupamentos, visivel: (c) => c.ehGestor },
    { id: 'mapas', label: 'Mapas', icone: Map, Pagina: Mapas },
    { id: 'categorias', label: 'Categorias', icone: Tags, Pagina: Categorias },
  ],
  agri: [],
  estoque: [],
  financeiro: [],
};

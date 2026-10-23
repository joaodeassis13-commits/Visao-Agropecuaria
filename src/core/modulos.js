// Catálogo de módulos da plataforma VA.
// Manter os papéis/níveis iguais aos da função supabase/functions/gerenciar-usuario.
export const MODULOS = [
  {
    id: 'pec', nome: 'Pecuária', marca: 'pec', disponivel: true,
    papeis: [
      { v: 'analista', l: 'Analista', nivel: 'fazenda', gestor: true },
      { v: 'capataz', l: 'Capataz', nivel: 'retiro' },
    ],
  },
  {
    id: 'agri', nome: 'Agricultura', marca: 'agri', disponivel: false,
    papeis: [
      { v: 'analista', l: 'Analista', nivel: 'fazenda', gestor: true },
      { v: 'operador', l: 'Operador', nivel: 'retiro' },
    ],
  },
  {
    id: 'estoque', nome: 'Estoque', marca: 'est', disponivel: false,
    papeis: [
      { v: 'analista', l: 'Analista', nivel: 'fazenda', gestor: true },
      { v: 'almoxarife', l: 'Almoxarife', nivel: 'fazenda' },
    ],
  },
  {
    id: 'financeiro', nome: 'Financeiro', marca: 'fin', disponivel: false,
    papeis: [
      { v: 'analista', l: 'Analista', nivel: 'fazenda', gestor: true },
      { v: 'operador', l: 'Operador', nivel: 'fazenda' },
    ],
  },
];

export const moduloPorId = (id) => MODULOS.find((m) => m.id === id);
export const papelInfo = (modulo, papel) => moduloPorId(modulo)?.papeis.find((p) => p.v === papel);

export const DEPARTAMENTOS = [
  { v: 'pecuaria', l: 'Pecuária', area: 'Piquete' },
  { v: 'agricultura', l: 'Agricultura', area: 'Talhão' },
];
export const nomeDepartamento = (v) => DEPARTAMENTOS.find((d) => d.v === v)?.l || '—';

export const CICLOS = [
  { v: 'cria', l: 'Cria' },
  { v: 'recria', l: 'Recria' },
  { v: 'engorda', l: 'Engorda' },
  { v: 'ciclo_completo', l: 'Ciclo completo' },
];

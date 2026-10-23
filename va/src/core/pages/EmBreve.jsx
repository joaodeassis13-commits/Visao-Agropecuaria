import { Construction } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { moduloPorId } from '../modulos';
import { Cabecalho, EmConstrucao } from '../components/ui';

const DESCRICOES = {
  agri: 'Operações agrícolas por talhão e safra: planejamento, plantio, aplicações e colheita.',
  estoque: 'Estoque de insumos por depósito, com entradas, saídas e sugestões de baixa vindas dos outros módulos.',
  financeiro: 'Contas a pagar e a receber, plano de contas e centros de custo por fazenda, atividade, safra e área.',
};

export default function EmBreve() {
  const { modulo } = useApp();
  const m = moduloPorId(modulo);
  return (
    <div className="pagina">
      <Cabecalho icone={Construction} titulo={m?.nome || 'Módulo'} desc={DESCRICOES[modulo]} />
      <EmConstrucao titulo={`Módulo ${m?.nome} em construção`}>
        Este módulo já faz parte da plataforma — os acessos de usuários podem ser preparados — e as telas serão construídas nas próximas etapas.
      </EmConstrucao>
    </div>
  );
}

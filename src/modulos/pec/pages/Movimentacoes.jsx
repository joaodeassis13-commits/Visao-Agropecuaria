import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftRight, BadgeDollarSign, Baby, Beef, HeartCrack, LogIn, LogOut, MoveRight, Repeat,
  ShoppingCart, SlidersHorizontal,
} from 'lucide-react';
import { useApp } from '../../../core/context/AppContext';
import { MOVS } from '../lib/constants';
import { usePodeMov } from '../lib/permissoes';
import { Abas, Cabecalho, Vazio } from '../../../core/components/ui';
import MovForm from '../components/mov/MovForm';
import Transferencias from '../components/mov/Transferencias';

export const ICONES_MOV = {
  nascimento: Baby, morte: HeartCrack, entrada: LogIn, saida: LogOut, mudanca_piquete: MoveRight,
  transferencia: ArrowLeftRight, compra: ShoppingCart, venda: BadgeDollarSign, abate: Beef,
  mudanca_categoria: Repeat, ajuste: SlidersHorizontal,
};

export default function Movimentacoes() {
  const { nav, fazendaAtiva } = useApp();
  const podeMov = usePodeMov();
  const abas = useMemo(() => MOVS.filter((m) => podeMov(m.tipo)), [podeMov]);
  const [aba, setAba] = useState(() => (nav.tab && abas.some((a) => a.tipo === nav.tab) ? nav.tab : abas[0]?.tipo));

  useEffect(() => {
    if (nav.tab && abas.some((a) => a.tipo === nav.tab)) setAba(nav.tab);
  }, [nav.ts]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!abas.length) {
    return <div className="pagina"><div className="painel"><Vazio>Nenhuma movimentação liberada para o seu usuário.</Vazio></div></div>;
  }

  const cfg = MOVS.find((m) => m.tipo === aba) || abas[0];
  const prefill = nav.tab === cfg.tipo ? nav.prefill : null;

  return (
    <>
      <Abas abas={abas.map((a) => ({ id: a.tipo, label: a.aba }))} ativa={cfg.tipo} onChange={setAba} />
      <div className="pagina">
        <Cabecalho icone={ICONES_MOV[cfg.tipo]} titulo={cfg.titulo} desc={cfg.desc} />
        {!fazendaAtiva ? (
          <div className="painel"><Vazio>Nenhuma fazenda selecionada.</Vazio></div>
        ) : cfg.tipo === 'transferencia' ? (
          <Transferencias />
        ) : (
          <MovForm key={`${cfg.tipo}-${prefill?.sugestao_id || prefill?.vinculos?.join(',') || ''}-${fazendaAtiva.id}`} tipo={cfg.tipo} prefill={prefill} />
        )}
      </div>
    </>
  );
}

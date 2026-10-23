import { useState } from 'react';
import { Calculator, ClipboardCheck, PenLine, Sprout, TrendingUp } from 'lucide-react';
import { usePodeMov } from '../lib/permissoes';
import { Abas, Cabecalho, EmConstrucao, SemAcesso } from '../../../core/components/ui';

const ABAS = [
  { id: 'calibrar', label: 'Calibrar calculadora', icone: Calculator, titulo: 'Calibrar calculadora de massa de forragem',
    desc: 'Aqui ficará a calibração da calculadora de massa de forragem (kg MS/ha) por espécie forrageira, a partir das amostras de campo.' },
  { id: 'validar', label: 'Validar lotação prevista', icone: ClipboardCheck, titulo: 'Validar sugestões de lotação prevista',
    desc: 'Aqui o analista vai revisar e validar a lotação prevista (UA/ha) sugerida para cada piquete na semana.' },
  { id: 'indicadores', label: 'Informar indicadores', icone: PenLine, titulo: 'Informar indicadores manualmente',
    desc: 'Lançamento manual de massa de forragem, altura do pasto e lotação prevista por piquete.' },
  { id: 'ajustes', label: 'Sugestões de ajuste', icone: TrendingUp, titulo: 'Sugestões de ajuste de lotação',
    desc: 'Comparando lotação prevista e atual, o sistema vai sugerir onde tirar ou colocar animais.' },
];

export default function Pastagens() {
  const podeMov = usePodeMov();
  const [aba, setAba] = useState('calibrar');
  if (!podeMov('pastagens')) return <SemAcesso />;
  const a = ABAS.find((x) => x.id === aba);
  return (
    <>
      <Abas abas={ABAS} ativa={aba} onChange={setAba} />
      <div className="pagina">
        <Cabecalho icone={Sprout} titulo="Manejo de pastagens"
          desc="Indicadores de massa, altura e lotação por piquete — base para os mapas de pastagem." />
        <EmConstrucao icone={a.icone} titulo={a.titulo}>{a.desc}</EmConstrucao>
      </div>
    </>
  );
}

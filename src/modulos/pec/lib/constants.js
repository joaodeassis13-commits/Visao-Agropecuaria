export const CAUSAS_MORTE = [
  'Aborto', 'Acidente', 'Cobra', 'Desconhecida', 'Diarreia', 'Distocia', 'Fraqueza', 'Hipertermia',
  'Intoxicação', 'Magreza', 'Natimorto', 'Onça', 'Parto', 'Raio', 'Tristezinha', 'Urubu',
];

export const RACAS = [
  'Nelore', 'Angus', 'Brangus', 'Cruzado', 'Senepol', 'Tabapuã', 'Guzerá', 'Gir', 'Girolando',
  'Hereford', 'Braford', 'Canchim', 'Caracu', 'Mestiço',
];

// capataz: true = movimentação que pode ser liberada ao capataz
export const MOVS = [
  { tipo: 'nascimento', aba: 'Nascimentos', titulo: 'Nascimentos', curto: 'Nascimento', capataz: true,
    desc: 'Registre os nascimentos do piquete. Os bezerros entram automaticamente na categoria de bezerros (as) até 9 meses.' },
  { tipo: 'morte', aba: 'Mortes', titulo: 'Mortes', curto: 'Morte', capataz: true,
    desc: 'Registre as mortes por piquete e categoria, com a causa.' },
  { tipo: 'entrada', aba: 'Entradas', titulo: 'Entrada de animais', curto: 'Entrada', capataz: true,
    desc: 'Animais que chegam ao piquete vindos de fora. Informe uma ou mais categorias e o motivo — entradas por compra ficam aguardando o registro da compra pelo analista.' },
  { tipo: 'saida', aba: 'Saídas', titulo: 'Saída de animais', curto: 'Saída', capataz: true,
    desc: 'Animais que deixam o piquete com destino externo. Informe uma ou mais categorias e o motivo — saídas por venda ou abate ficam aguardando o registro comercial pelo analista.' },
  { tipo: 'mudanca_piquete', aba: 'Mudança de piquete', titulo: 'Mudança de piquete', curto: 'Mudança de piquete', capataz: true,
    desc: 'Movimente animais entre piquetes do mesmo retiro. No modo total, todo o lote do piquete é preenchido automaticamente.' },
  { tipo: 'transferencia', aba: 'Transferências', titulo: 'Transferência entre retiros', curto: 'Transferência', capataz: true,
    desc: 'Sugira uma transferência para outro retiro. Ela só é efetivada após o aceite do responsável pelo retiro de destino.' },
  { tipo: 'compra', aba: 'Compras', titulo: 'Compras', curto: 'Compra', capataz: false,
    desc: 'Registro comercial da compra, vinculado às entradas de animais com motivo "Compra". Não altera o estoque — quem movimenta os animais é a entrada. Exclusivo do analista.' },
  { tipo: 'venda', aba: 'Vendas', titulo: 'Vendas de gado em pé', curto: 'Venda', capataz: false,
    desc: 'Registro comercial da venda, vinculado às saídas de animais com motivo "Venda". Não altera o estoque — quem retira os animais é a saída. Exclusivo do analista.' },
  { tipo: 'abate', aba: 'Abates', titulo: 'Abates', curto: 'Abate', capataz: false,
    desc: 'Registro comercial do abate, vinculado às saídas de animais com motivo "Abate". Não altera o estoque — quem retira os animais é a saída. Exclusivo do analista.' },
  { tipo: 'mudanca_categoria', aba: 'Mudança de categoria', titulo: 'Mudança de categoria', curto: 'Mudança de categoria', capataz: false,
    desc: 'Reclassifique animais de uma categoria para outra. Lançamento exclusivo do analista.' },
  { tipo: 'ajuste', aba: 'Ajustes', titulo: 'Ajustes de estoque', curto: 'Ajuste', capataz: false,
    desc: 'Corrija diferenças de contagem com ajustes de entrada ou saída. Lançamento exclusivo do analista.' },
];

// Motivos de entrada e saída de animais
export const MOTIVOS_ENTRADA = ['Compra', 'Transferência entre retiros', 'Retorno de empréstimo', 'Recebimento de terceiros', 'Outro'];
export const MOTIVOS_SAIDA = ['Venda', 'Abate', 'Transferência entre retiros', 'Empréstimo', 'Consumo interno', 'Doação', 'Outro'];
export const MOTIVO_TRANSFERENCIA = 'Transferência entre retiros';

// Registros comerciais (sem piquete, não mexem no estoque) e o lançamento de campo a que se vinculam
export const COMERCIAIS = {
  compra: { tipoCampo: 'entrada', motivo: 'Compra', nomeCampo: 'entradas' },
  venda: { tipoCampo: 'saida', motivo: 'Venda', nomeCampo: 'saídas' },
  abate: { tipoCampo: 'saida', motivo: 'Abate', nomeCampo: 'saídas' },
};
export const comercialDoMotivo = (tipoCampo, motivo) =>
  Object.keys(COMERCIAIS).find((k) => COMERCIAIS[k].tipoCampo === tipoCampo && COMERCIAIS[k].motivo === motivo) || null;

export const PERMISSOES_CAPATAZ = [
  ...MOVS.filter((m) => m.capataz).map((m) => ({ chave: m.tipo, label: m.titulo })),
  { chave: 'pastagens', label: 'Manejo de pastagens' },
];

export const SEXOS_CATEGORIA = [
  { v: 'M', l: 'Macho' },
  { v: 'F', l: 'Fêmea' },
  { v: 'misto', l: 'Misto' },
];

export const MAPAS = [
  { id: 'massa', label: 'Massa de forragem', unidade: 'kg MS/ha',
    desc: 'Massa de forragem piquete a piquete, com faixas de legenda que variam conforme a espécie forrageira.' },
  { id: 'rebanho', label: 'Distribuição do rebanho', unidade: 'cabeças',
    desc: 'Quantidade de animais por piquete.' },
  { id: 'lotacao_prevista', label: 'Lotação prevista', unidade: 'UA/ha',
    desc: 'Taxa de lotação prevista informada semanalmente pelo analista.' },
  { id: 'lotacao_atual', label: 'Lotação atual', unidade: 'UA/ha',
    desc: 'Lotação atual calculada pelos animais presentes e área de cada piquete.' },
  { id: 'status', label: 'Status de lotação', unidade: '',
    desc: 'Comparação entre lotação prevista e atual: Abaixo, Adequado ou Acima.' },
  { id: 'manutencao', label: 'Manutenção de pastagens', unidade: '',
    desc: 'Operações feitas pela agricultura (VAagri) nas áreas de pecuária no período — adubação, calagem, reforma etc. Somente visualização.' },
];

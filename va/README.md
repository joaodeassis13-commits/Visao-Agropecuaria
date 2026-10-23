# Plataforma VA — Gestão Agropecuária

App único com seletor de módulos (Vite + React + Supabase + Dexie/IndexedDB, PWA offline).

| Módulo | Marca | Situação |
|---|---|---|
| Pecuária | VApec | pronto (movimentações, pendências, agrupar talhões, mapas, categorias) |
| Agricultura | VAagri | em breve |
| Estoque | VAest | em breve |
| Financeiro | VAfin | em breve |

O VArepro continua como sistema isolado. No futuro ele poderá gerar **sugestões** de baixa no Estoque (nunca baixa direta).

## Arquitetura
- **Núcleo** (compartilhado por todos os módulos)
  - `perfis`: usuários; `administrador = true` dá acesso total.
  - `usuario_modulos`: papel do usuário em cada módulo (ex.: analista na Pecuária, operador na Agricultura).
  - `usuario_fazendas` / `usuario_retiros`: vínculos por módulo (o nível depende do papel).
  - `fazendas` → `retiros` → `areas`: cadastro único. Cada área é **piquete (pecuária)** ou **talhão (agricultura)**.
  - Áreas do tipo `agrupamento`: talhões agrupados na entressafra (ILP) para uso da pecuária.
- **Módulos**: tabelas com prefixo (`pec_*`, depois `agri_*`, `est_*`, `fin_*`).
  - Um módulo nunca grava direto nas tabelas do outro: gera sugestões/pré-lançamentos para o módulo de destino confirmar.
- **Front**
  - `src/core`: login, sincronização offline, layout, Fazendas e Usuários.
  - `src/modulos/<módulo>`: telas de cada módulo.
  - `src/modulos/index.jsx`: menu de cada módulo.
  - `src/core/modulos.js`: catálogo de módulos e papéis.

## Papéis por módulo
| Módulo | Gestor (vínculo por fazenda) | Operacional |
|---|---|---|
| Pecuária | Analista | Capataz (por retiro, com permissões por movimentação) |
| Agricultura | Analista | Operador (por retiro) |
| Estoque | Analista | Almoxarife (por fazenda) |
| Financeiro | Analista | Operador (por fazenda) |

- O administrador cadastra fazendas e analistas.
- O analista de um módulo cadastra os usuários operacionais daquele módulo nas fazendas dele.
- Um mesmo usuário pode ter papéis diferentes em módulos diferentes.

## Instalação
1. **Supabase**: use um projeto **novo**. O schema anterior do VApec mudou de estrutura (`piquetes` → `areas`, tabelas `pec_*`).
   - SQL Editor → execute `supabase/schema.sql`.
   - Authentication → Users → *Add user* (marque *Auto Confirm*).
   - Execute o bloco "PRIMEIRO ADMINISTRADOR" do final do schema com o seu e-mail.
2. **Edge Function**: `supabase functions deploy gerenciar-usuario` (ou crie pelo painel e cole o `index.ts`).
3. **App**: `.env` com `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`, depois `npm install` e `npm run dev`. Na Vercel, as mesmas variáveis; saída `dist`.

## Integração lavoura-pecuária (ILP)
Em **Pecuária → Agrupar talhões**, o analista:
1. Escolhe talhões da agricultura.
2. Indica o retiro da pecuária que vai usá-los e a data de início.

O agrupamento passa a aparecer como piquete nas movimentações e nos mapas. Para **encerrar**, os animais precisam sair antes. Os talhões voltam a ser só da agricultura e o histórico fica guardado.

## Offline
Todo lançamento grava primeiro no aparelho e entra numa fila. Com internet, a fila sobe na ordem e os dados são baixados de novo:
- automaticamente ao reconectar;
- a cada 2 minutos;
- pelo botão "Sincronizar".

O primeiro login precisa de internet. Cadastro de usuários é sempre online.

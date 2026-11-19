# Plano de Implementação — `ts-model-checker`

> **Status:** Planejamento temporário aguardando validação.  
> **Objetivo:** Construir uma biblioteca modular em TypeScript de *Model Checking* formal (estilo TLA+) com núcleo puro desacoplado, suporte a Web Workers e interface visual *no-code/low-code* baseada em blocos e fluxos para que pessoas sem conhecimento aprofundado em código possam modelar, verificar e depurar sistemas concorrentes.

---

## 1. Princípios Arquiteturais e Requisitos

1. **Separação Estrita (Core vs. Worker vs. UI):**
   - `@ts-model-checker/core` não pode ter nenhuma dependência de DOM, React ou APIs exclusivas de Node.js. Deve rodar de forma idêntica no navegador, em Web Workers e em pipelines de CI/CD (Node/Vitest/Jest).
2. **Segurança e Determinismo:**
   - Zero `eval()` ou `new Function()`. Todas as expressões são representadas por uma AST fechada (`ExprNode`) interpretada por um avaliador puro e imutável.
   - Serialização canônica determinística (`canonicalHash`) garantindo que objetos/conjuntos equivalentes gerem sempre o mesmo identificador de estado.
3. **Semântica Formal Fiel ao TLA+:**
   - **`Init`:** Conjunto de estados iniciais (explícitos ou expandidos a partir de domínios finitos).
   - **`Next`:** Disjunção de ações atômicas (`ActionBox`), onde cada ação possui **Guarda** (pré-condição booleana) e **Efeitos** (avaliação simultânea contra o estado atual, com `UNCHANGED` implícito para variáveis não alteradas).
   - **Safety (`□P`):** Invariantes verificados em todo estado alcançável (incluindo os iniciais).
   - **Deadlock:** Estado não-terminal sem nenhuma ação habilitada.
   - **Liveness (`◇P` e `P ~> Q`):** Verificação sobre o grafo completo de estados alcançáveis via Componentes Fortemente Conexos (algoritmo de Tarjan) sob hipótese de *Weak Fairness*, retornando contraexemplos em formato **Lasso** (`prefix` + `cycle`).
4. **Acessibilidade Visual (UX):**
   - Edição estruturada por blocos (dropdowns de variáveis, operadores com rótulo em linguagem natural + símbolo formal), eliminando erros de sintaxe.
   - *Trace Player* ("Time-Travel") mostrando o passo a passo da falha diretamente sobre o grafo visual e destacando o *diff* das variáveis em cada transição.

---

## 2. Estrutura do Monorepo (`pnpm workspaces`)

```text
ts-model-checker/
├── package.json                     # Scripts globais (build, test, typecheck, lint, dev)
├── pnpm-workspace.yaml              # Workspaces: packages/* e apps/*
├── tsconfig.base.json               # Configuração TypeScript estrita compartilhada
├── docs/
│   └── PLAN.md                      # Este planejamento
│
├── packages/
│   ├── core/                        # @ts-model-checker/core (Núcleo formal puro)
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── tsup.config.ts
│   │   ├── src/
│   │   │   ├── ast/
│   │   │   │   ├── types.ts         # Tipos da AST, IR (VisualSpecIR), estados e resultados
│   │   │   │   └── validator.ts     # Validação estática (tipos, escopo, vars não inicializadas)
│   │   │   ├── engine/
│   │   │   │   ├── canonicalHash.ts # Hash canônico determinístico para StateValue
│   │   │   │   ├── evaluator.ts     # Avaliador puro de ExprNode (sem eval)
│   │   │   │   ├── compiler.ts      # Compila VisualSpecIR -> SpecModel executável
│   │   │   │   ├── modelChecker.ts  # Explorador BFS, Safety, Deadlock, StateGraph
│   │   │   │   ├── livenessChecker.ts # Tarjan SCC para ◇P e P ~> Q (contraexemplo Lasso)
│   │   │   │   └── traceValidator.ts  # Validação de logs reais contra VisualSpecIR
│   │   │   ├── transpiler/
│   │   │   │   └── tlaGenerator.ts  # Gerador de arquivos .tla e .cfg compatíveis com TLC
│   │   │   ├── presets/
│   │   │   │   ├── concurrentTransfer.ts
│   │   │   │   ├── mutex.ts
│   │   │   │   ├── twoPhaseCommit.ts
│   │   │   │   └── index.ts
│   │   │   └── index.ts
│   │   └── tests/
│   │       ├── evaluator.test.ts
│   │       ├── validator.test.ts
│   │       ├── modelChecker.test.ts
│   │       ├── livenessChecker.test.ts
│   │       ├── traceValidator.test.ts
│   │       ├── tlaGenerator.test.ts
│   │       └── properties.test.ts   # Property-based testing (fast-check)
│   │
│   ├── worker/                      # @ts-model-checker/worker (Isolamento em Web Worker)
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── tsup.config.ts
│   │   └── src/
│   │       ├── protocol.ts          # Tipos de mensagens (Request, Progress, Result, Cancel)
│   │       ├── check.worker.ts      # Entrypoint do Web Worker
│   │       ├── client.ts            # Cliente Promise + AbortSignal + fallback síncrono
│   │       └── index.ts
│   │
│   └── react/                       # @ts-model-checker/react (Componentes visuais)
│       ├── package.json
│       ├── tsconfig.json
│       ├── tsup.config.ts
│       └── src/
│           ├── styles/
│           │   └── theme.css        # CSS escopado (prefixo .tsmc-*) sem exigir Tailwind do host
│           ├── components/
│           │   ├── FormalCanvas.tsx # Canvas principal (React Flow) + toolbar + layout
│           │   ├── InitNode.tsx     # Nó especial de definição de variáveis e valores iniciais
│           │   ├── ActionNode.tsx   # Nó de ação com resumo de Guarda e Efeitos
│           │   ├── ActionEditorModal.tsx # Drawer/modal de edição da ação selecionada
│           │   ├── ExprBuilder.tsx  # Construtor visual estruturado de expressões (sem código)
│           │   ├── PropertiesPanel.tsx # Painel de Invariantes, Liveness e Estado Terminal
│           │   ├── TracePlayer.tsx  # Player Time-Travel + tabela de diff + visualização Lasso
│           │   └── TlaExportModal.tsx # Preview e download de .tla e .cfg
│           ├── hooks/
│           │   └── useModelChecker.ts # Hook React integrando worker + estado de execução
│           └── index.ts
│
└── apps/
    └── playground/                  # Aplicação demo (Vite + React) para uso e validação
        ├── package.json
        ├── vite.config.ts
        ├── index.html
        └── src/
            ├── App.tsx              # Seletor de presets, canvas, painel lateral e player
            └── main.tsx
```

---

## 3. Especificação Técnica Detalhada

### 3.1. AST e Representação Intermediária (`packages/core/src/ast/types.ts`)

- **Tipos de Valores (`StateValue`):**
  - `Primitive`: `string | number | boolean | null`
  - `readonly StateValue[]` (representa conjuntos finitos ou listas/sequências)
  - `{ readonly [key: string]: StateValue }` (registros / structs)
- **Declaração de Variáveis (`VarDecl`):**
  - `name: string`
  - `type: "number" | "string" | "boolean" | "set" | "record"`
  - `description?: string` (para exibição amigável na UI)
- **Expressões (`ExprNode`):**
  - `Literal`: `{ kind: "Literal", value: Primitive }`
  - `Var`: `{ kind: "Var", name: string }`
  - `SetLiteral`: `{ kind: "SetLiteral", elements: readonly ExprNode[] }`
  - `RecordLiteral`: `{ kind: "RecordLiteral", fields: Readonly<Record<string, ExprNode>> }`
  - `FieldAccess`: `{ kind: "FieldAccess", target: ExprNode, field: string }`
  - `Range`: `{ kind: "Range", start: ExprNode, end: ExprNode }` (gera conjunto `[start..end]`)
  - `UnaryOp`: `op: "!" | "-" | "CARDINALITY" | "IS_EMPTY"`
  - `BinaryOp`: `op: "+" | "-" | "*" | "/" | "%" | "==" | "!=" | "<" | "<=" | ">" | ">=" | "&&" | "||" | "=>" | "IN" | "NOT_IN" | "UNION" | "INTERSECT" | "DIFF" | "SUBSET_EQ"`
  - `IfThenElse`: `{ kind: "IfThenElse", condition: ExprNode, thenBranch: ExprNode, elseBranch: ExprNode }`
  - `Quantifier`: `{ kind: "Quantifier", quantifier: "FORALL" | "EXISTS", boundVar: string, domain: ExprNode, predicate: ExprNode }`
- **Especificação Visual (`VisualSpecIR`):**
  - `schemaVersion: 1`
  - `moduleName: string`
  - `variables: readonly VarDecl[]`
  - `initialStates: readonly State[]`
  - `actions: readonly VisualActionIR[]` (inclui `position?: { x: number; y: number }` opcional para persistir layout do canvas)
  - `invariants: readonly VisualInvariantIR[]`
  - `livenessProperties: readonly VisualLivenessIR[]` (suporta `kind: "EVENTUALLY"` (`◇P`) e `kind: "LEADS_TO"` (`P ~> Q`))
  - `terminalCondition?: ExprNode`

### 3.2. Validação Estática (`packages/core/src/ast/validator.ts`)

Antes de rodar o *model checker*, `validateSpec(spec: VisualSpecIR)` retorna uma lista estruturada de `ValidationIssue` (`severity: "error" | "warning"`, `location`, `message`):
- Verificar que `moduleName` é um identificador TLA+ válido (`/^[A-Za-z_][A-Za-z0-9_]*$/`).
- Verificar que há pelo menos 1 estado inicial em `initialStates` e que todos possuem exatamente as variáveis declaradas em `variables` (ou inferir se `variables` estiver vazio).
- Verificar variáveis referenciadas em `guard`, `effects`, `invariants`, `livenessProperties` e `terminalCondition`:
  - Variáveis livres não declaradas (respeitando `boundVar` dentro de `Quantifier`).
  - `targetVar` de `EffectAssignment` existe na especificação e não há atribuição duplicada para a mesma variável na mesma ação.
- Inferência/checagem leve de tipos em operações aritméticas (`+`, `-`, `*`, `/`, `%`, `<`, `<=`, `>`, `>=`) e lógicas (`&&`, `||`, `!`).
- *Warnings* úteis para UX: ação sem efeitos (no-op), especificação sem invariantes, nomes de ações duplicados.

### 3.3. Motor de Model Checking & Liveness

- **`modelChecker.ts`:**
  - Exploração **BFS** garantindo contraexemplos de comprimento mínimo.
  - Suporte a `options`:
    - `maxStates?: number` (padrão `50_000`)
    - `checkDeadlocks?: boolean` (padrão `true`)
    - `checkLiveness?: boolean` (padrão `true` quando houver `livenessProperties`)
    - `onProgress?: (stats: { statesExplored: number; queueSize: number }) => void` (a cada N estados, para feedback em tempo real no Worker/UI)
  - Se `livenessProperties.length > 0` e `checkLiveness` estiver ativo, constrói o `StateGraph` completo (nós + arestas rotuladas com `actionName`) durante a BFS para alimentar o `livenessChecker.ts`.
  - Ordem de retorno de resultados:
    1. Erro de validação estática (se inválido).
    2. `INVARIANT_VIOLATED` (assim que encontrado na BFS).
    3. `DEADLOCK` (assim que um estado não-terminal sem ações habilitadas for visitado).
    4. `LIMIT_REACHED` (se atingir `maxStates` antes de esgotar o grafo).
    5. `LIVENESS_VIOLATED` (verificado após explorar todo o espaço de estados finito, retornando `prefix` + `cycle` em formato Lasso).
    6. `PASSED` (com métricas `statesExplored`, `transitionsEvaluated`, `durationMs`).

- **`livenessChecker.ts`:**
  - Para `EVENTUALLY (◇P)`: isola subgrafo `badHashes` onde `¬P` vale, roda Tarjan SCC. Qualquer SCC com tamanho > 1, auto-loop, ou nó sem transições de saída viola `◇P`.
  - Para `LEADS_TO (P ~> Q)`: para cada estado onde `P && !Q` vale, verifica se existe caminho que permaneça em `¬Q` e atinja um SCC violador em `¬Q` (ou estado sem saída em `¬Q`).
  - Reconstrói o caminho mínimo `Init -> ... -> entrada do ciclo` (`prefix`) e o ciclo (`cycle`).

### 3.4. Transpilador TLA+ (`packages/core/src/transpiler/tlaGenerator.ts`)

- Converte `VisualSpecIR` para `{ tlaFileContent: string; cfgFileContent: string }`.
- Mapeia operadores da AST para TLA+ (`==` -> `=`, `!=` -> `#`, `&&` -> `/\`, `||` -> `\/`, `=>` -> `=>`, `IN` -> `\in`, `UNION` -> `\cup`, `INTERSECT` -> `\cap`, `DIFF` -> `\`, `SUBSET_EQ` -> `\subseteq`, `CARDINALITY` -> `Cardinality(...)`, `FORALL` -> `\A x \in S : P`, `EXISTS` -> `\E x \in S : P`, `Range` -> `a..b`).
- Calcula automaticamente `UNCHANGED <<v1, v2>>` (ou `UNCHANGED v1`) para cada ação.
- Gera `Spec == Init /\ [][Next]_vars /\ WF_vars(Next)` e mapeia invariantes e propriedades no `.cfg`.

### 3.5. Trace Validator (`packages/core/src/engine/traceValidator.ts`)

- Recebe `(spec: VisualSpecIR, trace: readonly State[])`.
- Valida se `trace[0]` corresponde a um dos `initialStates` válidos.
- Para cada transição `trace[i] -> trace[i+1]`:
  - Verifica invariantes em `trace[i]`.
  - Procura alguma ação cuja `guard(trace[i]) === true` e `applyAction(trace[i], action)` produza estado com mesmo `canonicalHash` de `trace[i+1]` (ou aceita *stuttering* se `trace[i] == trace[i+1]`, configurável).
  - Retorna `{ valid: true, matchedActions: string[] }` ou `{ valid: false, failedAtStep: number, reason: string }`.

### 3.6. Interface Visual (`packages/react`)

- **Estilização:** CSS puro escopado (`.tsmc-*`) com variáveis CSS customizáveis (`--tsmc-bg`, `--tsmc-accent`, etc.) importado pelo pacote, garantindo que funcione em qualquer projeto React sem exigir configuração de Tailwind no consumidor.
- **Fluxo do Usuário Não-Técnico:**
  1. **Nó Inicial (`Init`):** Tabela visual simples para adicionar variáveis (ex: `saldo`, `status`) com tipo e valor inicial.
  2. **Caixas de Ação (`ActionNode`):** No canvas React Flow, cada ação é um card claro mostrando: *"Quando [Guarda]"* e *"Então [Efeitos]"*. Clicar abre o `ActionEditorModal` com o `ExprBuilder`.
  3. **Construtor de Expressões (`ExprBuilder`):** Monta expressões clicando em blocos (Variável, Valor, Operação, Conjunto, "Para todo / Existe") sem digitar sintaxe.
  4. **Painel de Propriedades (`PropertiesPanel`):** Templates prontos em português:
     - *"Nunca permitir que [variável] seja [condição]"* (`□P`)
     - *"Garantir que eventualmente [condição]"* (`◇P`)
     - *"Sempre que [P], eventualmente [Q]"* (`P ~> Q`)
  5. **Botão "Verificar Modelo":** Roda no Web Worker sem travar a tela, exibindo contagem de estados em tempo real.
  6. **Player de Contraexemplo (`TracePlayer`):** Se houver bug, entra em modo replay:
     - Barra de controle (`|<`, `<`, `Play/Pause`, `>`, `>|`).
     - No canvas, o nó da ação executada no passo atual fica destacado.
     - Tabela de estado mostra valor anterior → valor novo com badge de mudança (*diff*).
     - Se for erro de Liveness, exibe visualmente onde começa o **ciclo infinito (Loop)**.

---

## 4. Plano de Execução em Fases

### Fase 1: Setup do Monorepo & Núcleo AST/Validador/Avaliador
- [x] Configurar `pnpm-workspace.yaml`, `package.json` raiz, `tsconfig.base.json`.
- [x] Criar `packages/core` com `types.ts`, `canonicalHash.ts`, `validator.ts`, `evaluator.ts`, `compiler.ts`.
- [x] Escrever testes unitários para `canonicalHash`, `validator` e `evaluator`.
- [x] **Critério de aceite:** `pnpm --filter @ts-model-checker/core test` passando e `tsc --noEmit` limpo.

### Fase 2: Motor BFS, Liveness (Tarjan SCC) & Trace Validator
- [x] Implementar `modelChecker.ts` (BFS, Safety, Deadlock, StateGraph, progresso).
- [x] Implementar `livenessChecker.ts` (Tarjan SCC para `◇P` e `P ~> Q` com Lasso).
- [x] Implementar `traceValidator.ts`.
- [x] Criar presets (`concurrentTransfer`, `mutex`, `twoPhaseCommit`).
- [x] **Critério de aceite:** Todos os presets verificados com contraexemplos mínimos exatos e testes de propriedade (`fast-check`) passando.

### Fase 3: Transpilador TLA+
- [x] Implementar `tlaGenerator.ts` com cobertura completa de todos os nós da AST.
- [x] Testar geração de `.tla` e `.cfg` para os presets.
- [x] **Critério de aceite:** Saída TLA+ sintaticamente válida e testes unitários cobrindo todos os operadores.

### Fase 4: Pacote `@ts-model-checker/worker`
- [ ] Implementar protocolo de mensagens, `check.worker.ts` e `client.ts` (com fallback caso `Worker` não esteja disponível no ambiente).
- [ ] **Critério de aceite:** Build ESM/CJS limpo e testes de integração do cliente.

### Fase 5: Pacote `@ts-model-checker/react`
- [x] Configurar `@xyflow/react` e `lucide-react` em `packages/react`.
- [x] Implementar `FormalCanvas`, `InitNode`, `ActionNode`, `ActionEditorModal`, `ExprBuilder`, `PropertiesPanel`, `TracePlayer`, `TlaExportModal` e `useModelChecker`.
- [x] **Critério de aceite:** Build do pacote React sem erros de tipagem e componentes renderizando sem dependências externas de CSS.

### Fase 6: `apps/playground` & Validação End-to-End
- [x] Criar app Vite + React em `apps/playground` consumindo `@ts-model-checker/core`, `@ts-model-checker/worker` e `@ts-model-checker/react`.
- [x] Incluir seletor de modelos de exemplo (com versões "com bug" e "corrigida" para demonstração imediata).
- [x] Rodar `pnpm build`, `pnpm typecheck`, `pnpm test` em todo o monorepo.

---

## 5. Decisões Técnicas (Validadas)

- [x] **Gerenciador e Build:** `pnpm` workspaces + `tsup` (para gerar builds ESM/CJS + `.d.ts` dos pacotes) + `vitest` + `fast-check`.
- [x] **Canvas Visual:** `@xyflow/react` (React Flow v12) + `lucide-react` para ícones.
- [x] **Estilização da UI:** CSS modular/escopado puro (`.tsmc-*`) dentro de `@ts-model-checker/react`, evitando impor Tailwind aos usuários da biblioteca; no `apps/playground` podemos usar o mesmo tema ou CSS limpo.
- [x] **Escopo do Playground:** Além dos pacotes da lib (`core`, `worker`, `react`), incluir `apps/playground` no monorepo para podermos rodar e validar visualmente a UI no navegador.

---

## 6. Segurança
- [x] **Executar testes de segurança defensiva**: Utilizar a skill "/security-audit" para verificar possíveis pontos de vulnerabilidade e corrigi-los com o **Full audit mode**
- [x] **Testes**: Utilizar a skill "/quality-test" para incluir testes robustos sobre o código do ts-model-checker.

---

## 7. Agentes
- [x] **Criar skill** em ts-model-checker/skills/ts-model-checker/SKILL.md para que agentes de IA saibam como usar o ts-model-checker.
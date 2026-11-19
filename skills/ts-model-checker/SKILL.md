---
name: ts-model-checker
description: Use when modeling, formally verifying, trace-validating, or transpiling concurrent systems to TLA+ with the ts-model-checker library (@ts-model-checker/core, @ts-model-checker/worker, @ts-model-checker/react).
---

# `ts-model-checker` — Visual TLA+-Style Formal Model Checker

`ts-model-checker` is a pure TypeScript formal verification library inspired by **TLA+**, featuring an eval-free AST evaluator, explicit-state BFS model checker (Safety & Deadlock), Tarjan SCC temporal Liveness checker (`◇P` and `P ~> Q` with Lasso counterexamples), real-log Trace Validator, TLA+ (`.tla` / `.cfg`) transpiler, Web Worker wrapper, and no-code React Flow UI components.

---

## Packages & Installation

```bash
# Headless verification, CI tests, trace validation, and TLA+ export
pnpm add @ts-model-checker/core

# Browser UI + Web Worker execution
pnpm add @ts-model-checker/core @ts-model-checker/worker @ts-model-checker/react @xyflow/react lucide-react
```

---

## 1. Headless Verification (`@ts-model-checker/core`)

Define a `VisualSpecIR` JSON specification and run `verifySpec(spec, options)`:

```ts
import { verifySpec, type VisualSpecIR } from "@ts-model-checker/core";

const spec: VisualSpecIR = {
  schemaVersion: 1,
  moduleName: "Counter",
  variables: [{ name: "count", type: "number" }],
  initialStates: [{ count: 0 }],
  actions: [
    {
      id: "inc",
      name: "Increment",
      guard: {
        kind: "BinaryOp",
        op: "<",
        left: { kind: "Var", name: "count" },
        right: { kind: "Literal", value: 5 },
      },
      effects: [
        {
          targetVar: "count",
          expression: {
            kind: "BinaryOp",
            op: "+",
            left: { kind: "Var", name: "count" },
            right: { kind: "Literal", value: 1 },
          },
        },
      ],
    },
  ],
  invariants: [
    {
      id: "non_neg",
      description: "count >= 0",
      predicate: {
        kind: "BinaryOp",
        op: ">=",
        left: { kind: "Var", name: "count" },
        right: { kind: "Literal", value: 0 },
      },
    },
  ],
  livenessProperties: [],
  terminalCondition: {
    kind: "BinaryOp",
    op: "==",
    left: { kind: "Var", name: "count" },
    right: { kind: "Literal", value: 5 },
  },
};

const result = verifySpec(spec, { maxStates: 50_000 });
// result.status: "PASSED" | "INVARIANT_VIOLATED" | "DEADLOCK" | "LIVENESS_VIOLATED" | "VALIDATION_ERROR" | "LIMIT_REACHED" | "CANCELLED"
```

### Key Core Exports
- `verifySpec(spec, options?)`: Validates, compiles, and runs BFS + Tarjan Liveness.
- `validateSpec(spec)`: Static analysis returning `ValidationIssue[]`.
- `validateExecutionTrace(spec, states, options?)`: Verifies real service logs against `VisualSpecIR`.
- `transpileToTla(spec)`: Returns `{ tlaFileContent, cfgFileContent }` for TLC.
- `PRESET_CATALOG`: Ready-to-use specs (`concurrentTransferBuggySpec`, `concurrentTransferFixedSpec`, `mutexSpec`, `twoPhaseCommitSpec`).

---

## 2. Async Web Worker Execution (`@ts-model-checker/worker`)

```ts
import { runModelCheckAsync } from "@ts-model-checker/worker";

const controller = new AbortController();
const result = await runModelCheckAsync(spec, {
  createWorker: () =>
    new Worker(new URL("@ts-model-checker/worker/worker", import.meta.url), {
      type: "module",
    }),
  signal: controller.signal,
  onProgress: ({ statesExplored }) => console.log(statesExplored),
});
```

---

## 3. Visual React Components (`@ts-model-checker/react`)

Import styles once in your app entrypoint:
```ts
import "@xyflow/react/dist/style.css";
import "@ts-model-checker/react/styles.css";
```

Use `FormalCanvas`, `PropertiesPanel`, `TracePlayer`, `TlaExportModal`, and `useModelChecker`:
- `FormalCanvas`: Interactive React Flow editor for `Init` and `ActionBox` nodes.
- `ExprBuilder`: Structured no-code AST editor (no raw text syntax errors).
- `PropertiesPanel`: Manage Safety (`□P`) and Liveness (`◇P`, `P ~> Q`) rules.
- `TracePlayer`: Step-by-step counterexample debugger with variable diffs and Lasso loop markers.
- `TlaExportModal`: Preview and download `.tla` and `.cfg` files.

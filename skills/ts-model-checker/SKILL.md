---
name: ts-model-checker
description: Use when modeling, formally verifying, trace-validating, or transpiling concurrent systems to TLA+ with the ts-model-checker library (@ts-model-checker/core, @ts-model-checker/worker, @ts-model-checker/react).
---

# `ts-model-checker` — Visual TLA+-Style Formal Model Checker

`ts-model-checker` is a pure TypeScript formal verification library inspired by **TLA+**, featuring an eval-free AST evaluator, explicit-state BFS model checker (Safety & Deadlock), Tarjan SCC temporal Liveness checker (`◇P` and `P ~> Q` with Lasso counterexamples), real-log Trace Validator, TLA+ (`.tla` / `.cfg`) & JSON import/export, Web Worker wrapper, and no-code React Flow UI components.

---

## Packages & Installation (Any Repository)

`@ts-model-checker/*` is published on **npm**, so you can install and run it directly in **any** repository without being inside the `ts-model-checker` repo:

```bash
# Headless verification & CI tests
pnpm add -D @ts-model-checker/core

# Browser UI + Web Worker
pnpm add @ts-model-checker/core @ts-model-checker/worker @ts-model-checker/react @xyflow/react lucide-react
```

---

## Agent Workflow: Verifying a Target Project

When asked to formally verify a target codebase/project (e.g., `my-app`), follow this structured workflow (similar to `security-audit`):

### 1. Output Directory Structure (Git-Ignored)

Store all generated models and verification reports organized **per target project** inside `ts-model-checker/models/<project-name>/` (which is git-ignored so sensitive business logic or specs are never committed):

```text
ts-model-checker/models/
└── <project-name>/
    ├── REPORT.md                 # Consolidated English summary table (Module | Model | Result | Key Finding)
    ├── <ModelName>.formal.json   # Importable VisualSpecIR JSON (loads directly in UI)
    ├── <ModelName>.tla           # Transpiled TLA+ module
    ├── <ModelName>.cfg           # TLC configuration file
    └── <ModelName>.report.json   # VerificationResult output from verifySpec()
```

*(If running inside an external repo without access to `ts-model-checker/models/`, save to `<target-repo>/.tsmc-models/` and ensure `.tsmc-models/` is git-ignored.)*

### 2. Source-to-Formal-Model Steps

1. **Read Target Source Code:** Inspect server actions, database transactions, state machines, locks, queues, or workflows in the target repository. Identify:
   - State variables (`Init`)
   - Concurrent/sequential transitions (`ActionBox` guards + effects)
   - Critical invariants (`□P` — e.g., balance >= 0, stock conservation, mutual exclusion)
   - Liveness goals (`◇P` or `P ~> Q`) and intentional terminal states (`terminalCondition`).
2. **Build `VisualSpecIR`:** Author the closed-AST `VisualSpecIR` (`schemaVersion: 1`) representing the real code's transitions (including non-atomic read-then-write steps where race conditions can occur).
3. **Save Importable Artifacts:** Write `<ModelName>.formal.json`, `<ModelName>.tla`, `<ModelName>.cfg`, and `<ModelName>.report.json` into `ts-model-checker/models/<project-name>/`.
4. **Verify & Generate `REPORT.md` (English):** Run `verifySpec(spec)` on every model and write `ts-model-checker/models/<project-name>/REPORT.md` in **English** containing:
   - A summary table with columns: `| Module | Model | Result | Key Finding |`
   - For each `INVARIANT_VIOLATED`, `DEADLOCK`, or `LIVENESS_VIOLATED` result, the shortest counterexample trace mapped back to exact `file:line` references in the target codebase.
5. **Visual Inspection (Optional):** Open the playground (`pnpm dev`), click **Import**, and upload `<ModelName>.formal.json` to replay the counterexample visually.

---

## 1. Headless Verification (`@ts-model-checker/core`)

```ts
import { verifySpec, transpileToTla, parseTlaToSpec, parseJsonToSpec, type VisualSpecIR } from "@ts-model-checker/core";

const result = verifySpec(spec, { maxStates: 50_000 });
// result.status: "PASSED" | "INVARIANT_VIOLATED" | "DEADLOCK" | "LIVENESS_VIOLATED" | "VALIDATION_ERROR" | "LIMIT_REACHED" | "CANCELLED"
```

### Key Core Exports
- `verifySpec(spec, options?)`: Validates, compiles, and runs BFS + Tarjan Liveness.
- `validateSpec(spec)`: Static analysis returning `ValidationIssue[]`.
- `validateExecutionTrace(spec, states, options?)`: Verifies real service logs against `VisualSpecIR`.
- `transpileToTla(spec)`: Returns `{ tlaFileContent, cfgFileContent }` for TLC.
- `parseTlaToSpec(tlaContent, { cfgContent? })`: Imports `.tla`/`.cfg` into `VisualSpecIR`.
- `parseJsonToSpec(jsonContent)`: Validates and imports `VisualSpecIR` JSON.
- `createBlankSpec(moduleName?)`: Creates an empty starter `VisualSpecIR`.
- `PRESET_CATALOG`: Built-in examples (`concurrentTransferBuggySpec`, `concurrentTransferFixedSpec`, `mutexSpec`, `twoPhaseCommitSpec`).

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

Exports: `FormalCanvas`, `InitNode`, `ActionNode`, `ActionEditorModal`, `InitEditorModal`, `ExprBuilder`, `PropertiesPanel`, `TracePlayer`, `TlaExportModal`, `ImportModal`, `useModelChecker`.

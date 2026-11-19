# ts-model-checker

A TLA+-style formal model checker in TypeScript with an eval-free AST evaluator, BFS state-space explorer, Tarjan SCC liveness checker, TLA+ transpiler, and a visual no-code React UI.

## Packages

- `@ts-model-checker/core` — Pure formal engine (AST validator, evaluator, BFS model checker, liveness checker, trace validator, `.tla`/`.cfg` transpiler).
- `@ts-model-checker/worker` — Web Worker wrapper with progress updates and `AbortSignal` support.
- `@ts-model-checker/react` — Visual React Flow editor, structured expression builder, properties panel, and time-travel `TracePlayer`.

## Installation

```bash
# Headless verification & CI
pnpm add @ts-model-checker/core

# Visual editor + Web Worker
pnpm add @ts-model-checker/core @ts-model-checker/worker @ts-model-checker/react @xyflow/react lucide-react
```

## Quick Start

### 1. Headless Verification (`@ts-model-checker/core`)

```ts
import { verifySpec, transpileToTla, type VisualSpecIR } from "@ts-model-checker/core";

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
        right: { kind: "Literal", value: 3 },
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
      id: "non_negative",
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
    right: { kind: "Literal", value: 3 },
  },
};

const result = verifySpec(spec);
console.log(result.status); // "PASSED"

const { tlaFileContent, cfgFileContent } = transpileToTla(spec);
```

### 2. Visual Editor (`@ts-model-checker/react`)

```tsx
import { useState } from "react";
import "@xyflow/react/dist/style.css";
import "@ts-model-checker/react/styles.css";
import { createBlankSpec } from "@ts-model-checker/core";
import { FormalCanvas, PropertiesPanel, useModelChecker } from "@ts-model-checker/react";

export function ModelStudio() {
  const [spec, setSpec] = useState(() => createBlankSpec("MySystem"));
  const { verify, result } = useModelChecker();

  return (
    <div>
      <button onClick={() => verify(spec)}>Verify</button>
      <FormalCanvas spec={spec} onChange={setSpec} />
      <PropertiesPanel spec={spec} onChange={setSpec} />
      {result && <pre>{JSON.stringify(result, null, 2)}</pre>}
    </div>
  );
}
```

### 3. Run the Local Playground

```bash
pnpm install
pnpm dev
```

See [docs/tutorial.md](./docs/tutorial.md) for a step-by-step guide, built-in templates, and real-world use cases.

## Contributing

Contributions are welcome! Feel free to open issues or submit pull requests.

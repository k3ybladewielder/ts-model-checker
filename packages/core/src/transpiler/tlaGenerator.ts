import type {
  ExprNode,
  StateValue,
  VisualActionIR,
  VisualSpecIR,
} from "../ast/types";

const BINARY_OP_MAP: Record<string, string> = {
  "==": "=",
  "!=": "#",
  "&&": "/\\",
  "||": "\\/",
  "=>": "=>",
  "<": "<",
  "<=": "<=",
  ">": ">",
  ">=": ">=",
  "+": "+",
  "-": "-",
  "*": "*",
  "/": "\\div",
  "%": "%",
  IN: "\\in",
  NOT_IN: "\\notin",
  UNION: "\\cup",
  INTERSECT: "\\cap",
  DIFF: "\\",
  SUBSET_EQ: "\\subseteq",
};

function sanitizeIdent(raw: string): string {
  const cleaned = raw.replace(/[^A-Za-z0-9_]/g, "_");
  return /^[A-Za-z_]/.test(cleaned) ? cleaned : `_${cleaned}`;
}

/** Converts a JSON/JS StateValue literal into TLA+ syntax. */
export function literalToTla(value: StateValue): string {
  if (value === null) return '"NULL"';
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `{${value.map(literalToTla).join(", ")}}`;
  }
  const entries = Object.entries(value as Record<string, StateValue>).map(
    ([k, v]) => `${k} |-> ${literalToTla(v)}`
  );
  return `[${entries.join(", ")}]`;
}

/** Translates an AST ExprNode recursively into TLA+ syntax. */
export function exprToTla(node: ExprNode): string {
  switch (node.kind) {
    case "Literal":
      return literalToTla(node.value);

    case "Var":
      return node.name;

    case "SetLiteral":
      return `{${node.elements.map(exprToTla).join(", ")}}`;

    case "RecordLiteral": {
      const fields = Object.entries(node.fields)
        .map(([k, v]) => `${sanitizeIdent(k)} |-> ${exprToTla(v)}`)
        .join(", ");
      return `[${fields}]`;
    }

    case "FieldAccess":
      return `${exprToTla(node.target)}.${sanitizeIdent(node.field)}`;

    case "Range":
      return `(${exprToTla(node.start)}..${exprToTla(node.end)})`;

    case "UnaryOp": {
      const inner = exprToTla(node.operand);
      switch (node.op) {
        case "!":
          return `~(${inner})`;
        case "-":
          return `-(${inner})`;
        case "CARDINALITY":
          return `Cardinality(${inner})`;
        case "IS_EMPTY":
          return `(${inner} = {})`;
      }
    }

    case "BinaryOp": {
      const left = exprToTla(node.left);
      const right = exprToTla(node.right);
      const tlaOp = BINARY_OP_MAP[node.op] ?? node.op;
      return `(${left} ${tlaOp} ${right})`;
    }

    case "IfThenElse":
      return `(IF ${exprToTla(node.condition)} THEN ${exprToTla(node.thenBranch)} ELSE ${exprToTla(node.elseBranch)})`;

    case "Quantifier": {
      const q = node.quantifier === "FORALL" ? "\\A" : "\\E";
      return `(${q} ${sanitizeIdent(node.boundVar)} \\in ${exprToTla(node.domain)} : ${exprToTla(node.predicate)})`;
    }
  }
}

function formatUnchanged(vars: readonly string[]): string | null {
  if (vars.length === 0) return null;
  if (vars.length === 1) return `UNCHANGED ${vars[0]}`;
  return `UNCHANGED <<${vars.join(", ")}>>`;
}

function actionToTla(action: VisualActionIR, allVars: readonly string[]): string {
  const modifiedVars = new Set(action.effects.map((e) => e.targetVar));
  const unchangedVars = allVars.filter((v) => !modifiedVars.has(v));
  const actionIdent = sanitizeIdent(action.name);

  const lines: string[] = [
    `${actionIdent} ==`,
    `    /\\ ${exprToTla(action.guard)}`,
  ];

  for (const eff of action.effects) {
    lines.push(`    /\\ ${eff.targetVar}' = ${exprToTla(eff.expression)}`);
  }

  const unchangedClause = formatUnchanged(unchangedVars);
  if (unchangedClause) {
    lines.push(`    /\\ ${unchangedClause}`);
  }

  return lines.join("\n");
}

export interface TlaOutputFiles {
  readonly tlaFileContent: string;
  readonly cfgFileContent: string;
}

/**
 * Transpiles a VisualSpecIR into idiomatic TLA+ (.tla) and TLC config (.cfg) files.
 */
export function transpileToTla(spec: VisualSpecIR): TlaOutputFiles {
  if (spec.initialStates.length === 0) {
    throw new Error("Specification requires at least one initial state for TLA+ export.");
  }

  const allVars =
    spec.variables.length > 0
      ? spec.variables.map((v) => v.name)
      : Object.keys(spec.initialStates[0]).sort();

  const varsTuple =
    allVars.length === 1 ? allVars[0] : `<<${allVars.join(", ")}>>`;

  const initDisjuncts = spec.initialStates.map((st) => {
    const assignments = allVars.map((v) => `${v} = ${literalToTla(st[v])}`);
    return `    \\/ (${assignments.join(" /\\ ")})`;
  });

  const actionDefinitions = spec.actions
    .map((act) => actionToTla(act, allVars))
    .join("\n\n");

  const nextActionIdents = spec.actions.map((act) => sanitizeIdent(act.name));

  // If terminalCondition is provided, add a Terminated stuttering action for TLC
  const terminatedDef = spec.terminalCondition
    ? `\n\nTerminated ==\n    /\\ ${exprToTla(spec.terminalCondition)}\n    /\\ ${formatUnchanged(allVars) ?? "TRUE"}`
    : "";

  if (spec.terminalCondition) {
    nextActionIdents.push("Terminated");
  }

  const nextDisjuncts =
    nextActionIdents.length > 0
      ? nextActionIdents.map((name) => `    \\/ ${name}`).join("\n")
      : `    \\/ ${formatUnchanged(allVars) ?? "TRUE"}`;

  const invariantDefs = spec.invariants
    .map((inv) => `Inv_${sanitizeIdent(inv.id)} == ${exprToTla(inv.predicate)}`)
    .join("\n");

  const livenessDefs = spec.livenessProperties
    .map((live) => {
      const id = sanitizeIdent(live.id);
      if (live.kind === "EVENTUALLY") {
        return `Live_${id} == <>(${exprToTla(live.eventually)})`;
      }
      return `Live_${id} == (${exprToTla(live.trigger)} ~> ${exprToTla(live.response)})`;
    })
    .join("\n");

  const sections: string[] = [
    `---------------------------- MODULE ${sanitizeIdent(spec.moduleName)} ----------------------------`,
    `EXTENDS Integers, FiniteSets, Sequences`,
    ``,
    `VARIABLES ${allVars.join(", ")}`,
    ``,
    `vars == ${varsTuple}`,
    ``,
    `Init ==`,
    ...initDisjuncts,
    ``,
    actionDefinitions + terminatedDef,
    ``,
    `Next ==`,
    nextDisjuncts,
    ``,
    `Spec == Init /\\ [][Next]_vars /\\ WF_vars(Next)`,
  ];

  if (invariantDefs) {
    sections.push(
      ``,
      `(* --- Safety Invariants --- *)`,
      invariantDefs
    );
  }

  if (livenessDefs) {
    sections.push(
      ``,
      `(* --- Liveness Properties --- *)`,
      livenessDefs
    );
  }

  sections.push(
    `=============================================================================`
  );

  const cfgLines: string[] = [`SPECIFICATION Spec`];
  for (const inv of spec.invariants) {
    cfgLines.push(`INVARIANT Inv_${sanitizeIdent(inv.id)}`);
  }
  for (const live of spec.livenessProperties) {
    cfgLines.push(`PROPERTY Live_${sanitizeIdent(live.id)}`);
  }

  return {
    tlaFileContent: sections.join("\n"),
    cfgFileContent: cfgLines.join("\n"),
  };
}

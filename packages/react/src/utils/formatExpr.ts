import type { ExprNode } from "@ts-model-checker/core";

const OP_LABELS: Record<string, string> = {
  "==": "=",
  "!=": "≠",
  "&&": "AND",
  "||": "OR",
  "=>": "⇒",
  IN: "∈",
  NOT_IN: "∉",
  UNION: "∪",
  INTERSECT: "∩",
  DIFF: "∖",
  SUBSET_EQ: "⊆",
};

/** Formats an AST ExprNode into a concise, human-readable string for visual cards. */
export function formatExpr(node: ExprNode): string {
  switch (node.kind) {
    case "Literal":
      return typeof node.value === "string"
        ? `"${node.value}"`
        : String(node.value);
    case "Var":
      return node.name;
    case "SetLiteral":
      return `{${node.elements.map(formatExpr).join(", ")}}`;
    case "RecordLiteral":
      return `{ ${Object.entries(node.fields)
        .map(([k, v]) => `${k}: ${formatExpr(v)}`)
        .join(", ")} }`;
    case "FieldAccess":
      return `${formatExpr(node.target)}.${node.field}`;
    case "Range":
      return `${formatExpr(node.start)}..${formatExpr(node.end)}`;
    case "UnaryOp":
      if (node.op === "!") return `NOT (${formatExpr(node.operand)})`;
      if (node.op === "CARDINALITY") return `|${formatExpr(node.operand)}|`;
      if (node.op === "IS_EMPTY") return `${formatExpr(node.operand)} = ∅`;
      return `-${formatExpr(node.operand)}`;
    case "BinaryOp": {
      const op = OP_LABELS[node.op] ?? node.op;
      return `(${formatExpr(node.left)} ${op} ${formatExpr(node.right)})`;
    }
    case "IfThenElse":
      return `IF ${formatExpr(node.condition)} THEN ${formatExpr(node.thenBranch)} ELSE ${formatExpr(node.elseBranch)}`;
    case "Quantifier": {
      const q = node.quantifier === "FORALL" ? "∀" : "∃";
      return `${q} ${node.boundVar} ∈ ${formatExpr(node.domain)}: ${formatExpr(node.predicate)}`;
    }
  }
}

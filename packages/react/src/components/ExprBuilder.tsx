import type {
  BinaryOperator,
  ExprNode,
  Primitive,
  UnaryOperator,
  VarDecl,
} from "@ts-model-checker/core";

export interface ExprBuilderProps {
  readonly value: ExprNode;
  readonly variables: readonly VarDecl[];
  readonly onChange: (next: ExprNode) => void;
  readonly depth?: number;
}

const BINARY_OPERATORS: readonly { value: BinaryOperator; label: string }[] = [
  { value: "==", label: "= (equals)" },
  { value: "!=", label: "≠ (not equals)" },
  { value: "<", label: "< (less than)" },
  { value: "<=", label: "≤ (less than or equal)" },
  { value: ">", label: "> (greater than)" },
  { value: ">=", label: "≥ (greater than or equal)" },
  { value: "&&", label: "AND (both true)" },
  { value: "||", label: "OR (at least one)" },
  { value: "=>", label: "⇒ (implies)" },
  { value: "+", label: "+ (add)" },
  { value: "-", label: "- (subtract)" },
  { value: "*", label: "* (multiply)" },
  { value: "/", label: "÷ (integer division)" },
  { value: "IN", label: "∈ (in set)" },
  { value: "NOT_IN", label: "∉ (not in set)" },
  { value: "UNION", label: "∪ (set union)" },
];

const UNARY_OPERATORS: readonly { value: UnaryOperator; label: string }[] = [
  { value: "!", label: "NOT (negation)" },
  { value: "-", label: "- (negate)" },
  { value: "CARDINALITY", label: "|S| (set size)" },
  { value: "IS_EMPTY", label: "S = ∅ (is empty)" },
];

function parseLiteralInput(raw: string, typeHint: "string" | "number" | "boolean"): Primitive {
  if (typeHint === "boolean") return raw === "true";
  if (typeHint === "number") {
    const n = Number(raw);
    return Number.isNaN(n) ? 0 : n;
  }
  return raw;
}

/**
 * Structured no-code expression builder for ExprNode AST.
 * Prevents syntax errors by letting users pick variables, operators, and values via dropdowns.
 */
export function ExprBuilder({
  value,
  variables,
  onChange,
  depth = 0,
}: ExprBuilderProps) {
  const firstVarName = variables[0]?.name ?? "x";

  const handleKindChange = (nextKind: string) => {
    switch (nextKind) {
      case "Literal":
        onChange({ kind: "Literal", value: 0 });
        break;
      case "Var":
        onChange({ kind: "Var", name: firstVarName });
        break;
      case "BinaryOp":
        onChange({
          kind: "BinaryOp",
          op: "==",
          left: { kind: "Var", name: firstVarName },
          right: { kind: "Literal", value: 0 },
        });
        break;
      case "UnaryOp":
        onChange({
          kind: "UnaryOp",
          op: "!",
          operand: { kind: "Literal", value: true },
        });
        break;
      case "Range":
        onChange({
          kind: "Range",
          start: { kind: "Literal", value: 1 },
          end: { kind: "Literal", value: 5 },
        });
        break;
      case "IfThenElse":
        onChange({
          kind: "IfThenElse",
          condition: { kind: "Literal", value: true },
          thenBranch: { kind: "Literal", value: 1 },
          elseBranch: { kind: "Literal", value: 0 },
        });
        break;
    }
  };

  return (
    <div className="tsmc-expr-box" style={{ marginLeft: depth > 0 ? 8 : 0 }}>
      <div className="tsmc-expr-row">
        <select
          className="tsmc-select"
          value={value.kind}
          onChange={(e) => handleKindChange(e.target.value)}
        >
          <option value="BinaryOp">Operation / Comparison</option>
          <option value="Var">Variable</option>
          <option value="Literal">Fixed Value</option>
          <option value="UnaryOp">Negation / Unary</option>
          <option value="Range">Range (a..b)</option>
          <option value="IfThenElse">Conditional (If / Then / Else)</option>
        </select>

        {value.kind === "Literal" && (
          <>
            <select
              className="tsmc-select"
              value={typeof value.value === "boolean" ? "boolean" : typeof value.value === "number" ? "number" : "string"}
              onChange={(e) => {
                const t = e.target.value as "string" | "number" | "boolean";
                onChange({
                  kind: "Literal",
                  value: t === "boolean" ? true : t === "number" ? 0 : "",
                });
              }}
            >
              <option value="number">Number</option>
              <option value="string">String</option>
              <option value="boolean">Boolean</option>
            </select>

            {typeof value.value === "boolean" ? (
              <select
                className="tsmc-select"
                value={String(value.value)}
                onChange={(e) =>
                  onChange({ kind: "Literal", value: e.target.value === "true" })
                }
              >
                <option value="true">True (true)</option>
                <option value="false">False (false)</option>
              </select>
            ) : (
              <input
                className="tsmc-input"
                type={typeof value.value === "number" ? "number" : "text"}
                value={String(value.value ?? "")}
                onChange={(e) =>
                  onChange({
                    kind: "Literal",
                    value: parseLiteralInput(
                      e.target.value,
                      typeof value.value === "number" ? "number" : "string"
                    ),
                  })
                }
              />
            )}
          </>
        )}

        {value.kind === "Var" && (
          <select
            className="tsmc-select"
            value={value.name}
            onChange={(e) => onChange({ kind: "Var", name: e.target.value })}
          >
            {variables.map((v) => (
              <option key={v.name} value={v.name}>
                {v.name} ({v.type})
              </option>
            ))}
          </select>
        )}

        {value.kind === "UnaryOp" && (
          <select
            className="tsmc-select"
            value={value.op}
            onChange={(e) =>
              onChange({ ...value, op: e.target.value as UnaryOperator })
            }
          >
            {UNARY_OPERATORS.map((op) => (
              <option key={op.value} value={op.value}>
                {op.label}
              </option>
            ))}
          </select>
        )}

        {value.kind === "BinaryOp" && (
          <select
            className="tsmc-select"
            value={value.op}
            onChange={(e) =>
              onChange({ ...value, op: e.target.value as BinaryOperator })
            }
          >
            {BINARY_OPERATORS.map((op) => (
              <option key={op.value} value={op.value}>
                {op.label}
              </option>
            ))}
          </select>
        )}
      </div>

      {value.kind === "UnaryOp" && (
        <ExprBuilder
          value={value.operand}
          variables={variables}
          onChange={(operand) => onChange({ ...value, operand })}
          depth={depth + 1}
        />
      )}

      {value.kind === "BinaryOp" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <ExprBuilder
            value={value.left}
            variables={variables}
            onChange={(left) => onChange({ ...value, left })}
            depth={depth + 1}
          />
          <ExprBuilder
            value={value.right}
            variables={variables}
            onChange={(right) => onChange({ ...value, right })}
            depth={depth + 1}
          />
        </div>
      )}

      {value.kind === "Range" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <ExprBuilder
            value={value.start}
            variables={variables}
            onChange={(start) => onChange({ ...value, start })}
            depth={depth + 1}
          />
          <ExprBuilder
            value={value.end}
            variables={variables}
            onChange={(end) => onChange({ ...value, end })}
            depth={depth + 1}
          />
        </div>
      )}

      {value.kind === "IfThenElse" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div className="tsmc-section-label">If:</div>
          <ExprBuilder
            value={value.condition}
            variables={variables}
            onChange={(condition) => onChange({ ...value, condition })}
            depth={depth + 1}
          />
          <div className="tsmc-section-label">Then:</div>
          <ExprBuilder
            value={value.thenBranch}
            variables={variables}
            onChange={(thenBranch) => onChange({ ...value, thenBranch })}
            depth={depth + 1}
          />
          <div className="tsmc-section-label">Else:</div>
          <ExprBuilder
            value={value.elseBranch}
            variables={variables}
            onChange={(elseBranch) => onChange({ ...value, elseBranch })}
            depth={depth + 1}
          />
        </div>
      )}
    </div>
  );
}

/** Primitive values supported in state variables and literals. */
export type Primitive = string | number | boolean | null;

/** Recursive immutable value type for state variables. */
export type StateValue =
  | Primitive
  | readonly StateValue[]
  | { readonly [key: string]: StateValue };

/** A single system state mapping variable names to their values. */
export type State = Readonly<Record<string, StateValue>>;

/** Declared variable types for static validation and UI rendering. */
export type VarType = "number" | "string" | "boolean" | "set" | "record";

/** Variable declaration metadata for a specification. */
export interface VarDecl {
  readonly name: string;
  readonly type: VarType;
  readonly description?: string;
}

/** Supported unary operators in the closed expression AST. */
export type UnaryOperator = "!" | "-" | "CARDINALITY" | "IS_EMPTY";

/** Supported binary operators in the closed expression AST. */
export type BinaryOperator =
  | "+"
  | "-"
  | "*"
  | "/"
  | "%"
  | "=="
  | "!="
  | "<"
  | "<="
  | ">"
  | ">="
  | "&&"
  | "||"
  | "=>"
  | "IN"
  | "NOT_IN"
  | "UNION"
  | "INTERSECT"
  | "DIFF"
  | "SUBSET_EQ";

/** Closed Abstract Syntax Tree (AST) for safe, eval-free expression evaluation. */
export type ExprNode =
  | { readonly kind: "Literal"; readonly value: Primitive }
  | { readonly kind: "Var"; readonly name: string }
  | { readonly kind: "SetLiteral"; readonly elements: readonly ExprNode[] }
  | {
      readonly kind: "RecordLiteral";
      readonly fields: Readonly<Record<string, ExprNode>>;
    }
  | {
      readonly kind: "FieldAccess";
      readonly target: ExprNode;
      readonly field: string;
    }
  | {
      readonly kind: "Range";
      readonly start: ExprNode;
      readonly end: ExprNode;
    }
  | {
      readonly kind: "UnaryOp";
      readonly op: UnaryOperator;
      readonly operand: ExprNode;
    }
  | {
      readonly kind: "BinaryOp";
      readonly op: BinaryOperator;
      readonly left: ExprNode;
      readonly right: ExprNode;
    }
  | {
      readonly kind: "IfThenElse";
      readonly condition: ExprNode;
      readonly thenBranch: ExprNode;
      readonly elseBranch: ExprNode;
    }
  | {
      readonly kind: "Quantifier";
      readonly quantifier: "FORALL" | "EXISTS";
      readonly boundVar: string;
      readonly domain: ExprNode;
      readonly predicate: ExprNode;
    };

/** Assignment to a primed variable (x' = expr) in an action effect. */
export interface EffectAssignment {
  readonly targetVar: string;
  readonly expression: ExprNode;
}

/** Optional 2D position metadata for visual canvas persistence. */
export interface NodePosition {
  readonly x: number;
  readonly y: number;
}

/** Visual action box (Guard + simultaneous Effects). */
export interface VisualActionIR {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly guard: ExprNode;
  readonly effects: readonly EffectAssignment[];
  readonly position?: NodePosition;
}

/** Safety invariant rule (□P). */
export interface VisualInvariantIR {
  readonly id: string;
  readonly description: string;
  readonly predicate: ExprNode;
}

/** Temporal liveness property (◇P or P ~> Q). */
export type VisualLivenessIR =
  | {
      readonly id: string;
      readonly kind: "EVENTUALLY";
      readonly description: string;
      readonly eventually: ExprNode;
    }
  | {
      readonly id: string;
      readonly kind: "LEADS_TO";
      readonly description: string;
      readonly trigger: ExprNode;
      readonly response: ExprNode;
    };

/** Complete serializable Intermediate Representation (IR) of a model. */
export interface VisualSpecIR {
  readonly schemaVersion: 1;
  readonly moduleName: string;
  readonly variables: readonly VarDecl[];
  readonly initialStates: readonly State[];
  readonly actions: readonly VisualActionIR[];
  readonly invariants: readonly VisualInvariantIR[];
  readonly livenessProperties: readonly VisualLivenessIR[];
  readonly terminalCondition?: ExprNode;
}

/** Static validation issue reported before model checking. */
export interface ValidationIssue {
  readonly severity: "error" | "warning";
  readonly code: string;
  readonly location: string;
  readonly message: string;
}

/** Compiled executable action with pure guard and effect functions. */
export interface CompiledAction {
  readonly id: string;
  readonly name: string;
  readonly guard: (state: State) => boolean;
  readonly effect: (state: State) => Partial<State>;
}

/** Compiled executable invariant. */
export interface CompiledInvariant {
  readonly id: string;
  readonly description: string;
  readonly predicate: (state: State) => boolean;
}

/** Compiled executable specification ready for BFS exploration. */
export interface CompiledSpec {
  readonly moduleName: string;
  readonly initialStates: readonly State[];
  readonly actions: readonly CompiledAction[];
  readonly invariants: readonly CompiledInvariant[];
  readonly isTerminalState?: (state: State) => boolean;
}

/** A single step in a counterexample or execution trace. */
export interface TraceStep {
  readonly stepIndex: number;
  readonly actionName: string;
  readonly state: State;
}

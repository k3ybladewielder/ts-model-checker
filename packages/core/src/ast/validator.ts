import type { ExprNode, ValidationIssue, VisualSpecIR } from "./types";

const TLA_IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const FORBIDDEN_IDENTIFIERS = new Set(["__proto__", "constructor", "prototype"]);

function collectExprIssues(
  node: ExprNode,
  declaredVars: ReadonlySet<string>,
  boundVars: ReadonlySet<string>,
  location: string,
  issues: ValidationIssue[]
): void {
  switch (node.kind) {
    case "Literal":
      return;

    case "Var":
      if (!declaredVars.has(node.name) && !boundVars.has(node.name)) {
        issues.push({
          severity: "error",
          code: "UNDECLARED_VAR",
          location,
          message: `Variable '${node.name}' is not declared in the specification.`,
        });
      }
      return;

    case "SetLiteral":
      for (const el of node.elements) {
        collectExprIssues(el, declaredVars, boundVars, location, issues);
      }
      return;

    case "RecordLiteral":
      for (const fieldExpr of Object.values(node.fields)) {
        collectExprIssues(fieldExpr, declaredVars, boundVars, location, issues);
      }
      return;

    case "FieldAccess":
      collectExprIssues(node.target, declaredVars, boundVars, location, issues);
      return;

    case "Range":
      collectExprIssues(node.start, declaredVars, boundVars, location, issues);
      collectExprIssues(node.end, declaredVars, boundVars, location, issues);
      return;

    case "UnaryOp":
      collectExprIssues(node.operand, declaredVars, boundVars, location, issues);
      return;

    case "BinaryOp":
      collectExprIssues(node.left, declaredVars, boundVars, location, issues);
      collectExprIssues(node.right, declaredVars, boundVars, location, issues);
      return;

    case "IfThenElse":
      collectExprIssues(node.condition, declaredVars, boundVars, location, issues);
      collectExprIssues(node.thenBranch, declaredVars, boundVars, location, issues);
      collectExprIssues(node.elseBranch, declaredVars, boundVars, location, issues);
      return;

    case "Quantifier": {
      collectExprIssues(node.domain, declaredVars, boundVars, location, issues);
      const nextBound = new Set(boundVars);
      nextBound.add(node.boundVar);
      collectExprIssues(node.predicate, declaredVars, nextBound, location, issues);
      return;
    }
  }
}

/**
 * Performs static analysis on a VisualSpecIR before compilation and verification.
 * Returns a list of errors and warnings.
 */
export function validateSpec(spec: VisualSpecIR): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!TLA_IDENT_RE.test(spec.moduleName)) {
    issues.push({
      severity: "error",
      code: "INVALID_MODULE_NAME",
      location: "moduleName",
      message: `Module name '${spec.moduleName}' must be a valid identifier (letters, digits, underscores, starting with a letter or underscore).`,
    });
  }

  if (spec.initialStates.length === 0) {
    issues.push({
      severity: "error",
      code: "NO_INITIAL_STATES",
      location: "initialStates",
      message: "Specification must define at least one initial state.",
    });
  }

  const declaredVars = new Set<string>();
  for (const v of spec.variables) {
    if (!TLA_IDENT_RE.test(v.name) || FORBIDDEN_IDENTIFIERS.has(v.name)) {
      issues.push({
        severity: "error",
        code: "INVALID_VAR_NAME",
        location: `variables.${v.name}`,
        message: `Variable name '${v.name}' is not a valid or safe identifier.`,
      });
    }
    if (declaredVars.has(v.name)) {
      issues.push({
        severity: "error",
        code: "DUPLICATE_VAR",
        location: `variables.${v.name}`,
        message: `Variable '${v.name}' is declared more than once.`,
      });
    }
    declaredVars.add(v.name);
  }

  // Validate initial states against declared variables
  spec.initialStates.forEach((initState, idx) => {
    const loc = `initialStates[${idx}]`;
    for (const v of declaredVars) {
      if (!Object.prototype.hasOwnProperty.call(initState, v)) {
        issues.push({
          severity: "error",
          code: "UNINITIALIZED_VAR",
          location: `${loc}.${v}`,
          message: `Variable '${v}' is missing in initial state #${idx}.`,
        });
      }
    }
    for (const key of Object.keys(initState)) {
      if (!declaredVars.has(key)) {
        issues.push({
          severity: "error",
          code: "UNDECLARED_INIT_VAR",
          location: `${loc}.${key}`,
          message: `Initial state #${idx} sets undeclared variable '${key}'.`,
        });
      }
    }
  });

  // Validate actions
  const actionNames = new Set<string>();
  const emptyBound = new Set<string>();

  for (const action of spec.actions) {
    const loc = `actions.${action.name}`;

    if (!TLA_IDENT_RE.test(action.name)) {
      issues.push({
        severity: "warning",
        code: "NON_TLA_ACTION_NAME",
        location: loc,
        message: `Action name '${action.name}' contains characters that will be sanitized when exporting to TLA+.`,
      });
    }

    if (actionNames.has(action.name)) {
      issues.push({
        severity: "warning",
        code: "DUPLICATE_ACTION_NAME",
        location: loc,
        message: `Duplicate action name '${action.name}'.`,
      });
    }
    actionNames.add(action.name);

    collectExprIssues(action.guard, declaredVars, emptyBound, `${loc}.guard`, issues);

    if (action.effects.length === 0) {
      issues.push({
        severity: "warning",
        code: "EMPTY_ACTION_EFFECTS",
        location: `${loc}.effects`,
        message: `Action '${action.name}' has no effects (all variables remain UNCHANGED).`,
      });
    }

    const assignedInAction = new Set<string>();
    for (const eff of action.effects) {
      if (!declaredVars.has(eff.targetVar)) {
        issues.push({
          severity: "error",
          code: "UNDECLARED_TARGET_VAR",
          location: `${loc}.effects.${eff.targetVar}`,
          message: `Action '${action.name}' assigns to undeclared variable '${eff.targetVar}'.`,
        });
      }
      if (assignedInAction.has(eff.targetVar)) {
        issues.push({
          severity: "error",
          code: "DUPLICATE_ASSIGNMENT",
          location: `${loc}.effects.${eff.targetVar}`,
          message: `Action '${action.name}' assigns to variable '${eff.targetVar}' more than once.`,
        });
      }
      assignedInAction.add(eff.targetVar);

      collectExprIssues(
        eff.expression,
        declaredVars,
        emptyBound,
        `${loc}.effects.${eff.targetVar}`,
        issues
      );
    }
  }

  if (spec.actions.length === 0) {
    issues.push({
      severity: "warning",
      code: "NO_ACTIONS",
      location: "actions",
      message: "Specification has no actions defined.",
    });
  }

  // Validate invariants
  for (const inv of spec.invariants) {
    collectExprIssues(
      inv.predicate,
      declaredVars,
      emptyBound,
      `invariants.${inv.id}`,
      issues
    );
  }

  // Validate liveness properties
  for (const live of spec.livenessProperties) {
    if (live.kind === "EVENTUALLY") {
      collectExprIssues(
        live.eventually,
        declaredVars,
        emptyBound,
        `liveness.${live.id}`,
        issues
      );
    } else {
      collectExprIssues(
        live.trigger,
        declaredVars,
        emptyBound,
        `liveness.${live.id}.trigger`,
        issues
      );
      collectExprIssues(
        live.response,
        declaredVars,
        emptyBound,
        `liveness.${live.id}.response`,
        issues
      );
    }
  }

  if (spec.invariants.length === 0 && spec.livenessProperties.length === 0) {
    issues.push({
      severity: "warning",
      code: "NO_PROPERTIES",
      location: "properties",
      message: "No invariants or liveness properties defined; only deadlocks will be checked.",
    });
  }

  if (spec.terminalCondition) {
    collectExprIssues(
      spec.terminalCondition,
      declaredVars,
      emptyBound,
      "terminalCondition",
      issues
    );
  }

  return issues;
}

/** Returns true if validation produced no error-level issues. */
export function hasValidationErrors(issues: readonly ValidationIssue[]): boolean {
  return issues.some((issue) => issue.severity === "error");
}

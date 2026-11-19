import type {
  EffectAssignment,
  ExprNode,
  Primitive,
  State,
  StateValue,
  ValidationIssue,
  VarDecl,
  VarType,
  VisualActionIR,
  VisualInvariantIR,
  VisualLivenessIR,
  VisualSpecIR,
} from "../ast/types";
import { validateSpec } from "../ast/validator";

const MAX_TLA_INPUT_BYTES = 512 * 1024;
const MAX_PARSE_DEPTH = 256;
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export interface TlaParseOptions {
  readonly cfgContent?: string;
}

export interface TlaParseResult {
  readonly spec: VisualSpecIR;
  readonly warnings: readonly string[];
}

export interface JsonParseResult {
  readonly spec: VisualSpecIR;
  readonly issues: readonly ValidationIssue[];
}

type TokenType =
  | "IDENT"
  | "NUMBER"
  | "STRING"
  | "OP"
  | "LPAREN"
  | "RPAREN"
  | "LBRACE"
  | "RBRACE"
  | "LBRACKET"
  | "RBRACKET"
  | "COMMA"
  | "COLON"
  | "DOT"
  | "DOTDOT"
  | "PRIME"
  | "EOF";

interface Token {
  readonly type: TokenType;
  readonly value: string;
}

function tokenizeTlaExpr(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    const ch = input[i];

    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    // String literal
    if (ch === '"') {
      let str = "";
      i++;
      while (i < input.length && input[i] !== '"') {
        if (input[i] === "\\" && i + 1 < input.length) {
          const next = input[i + 1];
          if (next === "n") str += "\n";
          else if (next === "t") str += "\t";
          else str += next;
          i += 2;
        } else {
          str += input[i];
          i++;
        }
      }
      if (input[i] !== '"') {
        throw new Error("Unterminated string literal in TLA+ expression");
      }
      i++;
      tokens.push({ type: "STRING", value: str });
      continue;
    }

    // Number literal
    if (/[0-9]/.test(ch)) {
      let num = "";
      while (i < input.length && /[0-9]/.test(input[i])) {
        num += input[i++];
      }
      tokens.push({ type: "NUMBER", value: num });
      continue;
    }

    // Multi-char operators
    const two = input.slice(i, i + 2);
    const three = input.slice(i, i + 3);
    if (three === "|->") {
      tokens.push({ type: "OP", value: "|->" });
      i += 3;
      continue;
    }
    if (two === "..") {
      tokens.push({ type: "DOTDOT", value: ".." });
      i += 2;
      continue;
    }
    if (
      two === "/\\" ||
      two === "\\/" ||
      two === "=>" ||
      two === "<=" ||
      two === ">=" ||
      two === "/=" ||
      two === "~>" ||
      two === "<>" ||
      two === "<<" ||
      two === ">>"
    ) {
      tokens.push({ type: "OP", value: two });
      i += 2;
      continue;
    }

    // Backslash commands: \in, \notin, \cup, \cap, \subseteq, \div, \A, \E, \
    if (ch === "\\") {
      let cmd = "\\";
      i++;
      while (i < input.length && /[A-Za-z]/.test(input[i])) {
        cmd += input[i++];
      }
      tokens.push({ type: "OP", value: cmd });
      continue;
    }

    // Single-char punctuation & operators
    if (ch === "(") {
      tokens.push({ type: "LPAREN", value: "(" });
      i++;
      continue;
    }
    if (ch === ")") {
      tokens.push({ type: "RPAREN", value: ")" });
      i++;
      continue;
    }
    if (ch === "{") {
      tokens.push({ type: "LBRACE", value: "{" });
      i++;
      continue;
    }
    if (ch === "}") {
      tokens.push({ type: "RBRACE", value: "}" });
      i++;
      continue;
    }
    if (ch === "[") {
      tokens.push({ type: "LBRACKET", value: "[" });
      i++;
      continue;
    }
    if (ch === "]") {
      tokens.push({ type: "RBRACKET", value: "]" });
      i++;
      continue;
    }
    if (ch === ",") {
      tokens.push({ type: "COMMA", value: "," });
      i++;
      continue;
    }
    if (ch === ":") {
      tokens.push({ type: "COLON", value: ":" });
      i++;
      continue;
    }
    if (ch === ".") {
      tokens.push({ type: "DOT", value: "." });
      i++;
      continue;
    }
    if (ch === "'") {
      tokens.push({ type: "PRIME", value: "'" });
      i++;
      continue;
    }
    if ("=#<>+-*%~".includes(ch)) {
      tokens.push({ type: "OP", value: ch });
      i++;
      continue;
    }

    // Identifier
    if (/[A-Za-z_]/.test(ch)) {
      let ident = "";
      while (i < input.length && /[A-Za-z0-9_]/.test(input[i])) {
        ident += input[i++];
      }
      if (FORBIDDEN_KEYS.has(ident)) {
        throw new Error(`Forbidden identifier in TLA+ input: '${ident}'`);
      }
      tokens.push({ type: "IDENT", value: ident });
      continue;
    }

    throw new Error(`Unexpected character '${ch}' in TLA+ expression`);
  }

  tokens.push({ type: "EOF", value: "" });
  return tokens;
}

class ExprParser {
  private pos = 0;

  constructor(private readonly tokens: readonly Token[]) {}

  private peek(offset = 0): Token {
    return this.tokens[this.pos + offset] ?? { type: "EOF", value: "" };
  }

  private consume(): Token {
    const tok = this.peek();
    this.pos++;
    return tok;
  }

  private expect(type: TokenType, value?: string): Token {
    const tok = this.peek();
    if (tok.type !== type || (value !== undefined && tok.value !== value)) {
      throw new Error(
        `Expected ${type}${value ? ` '${value}'` : ""}, got ${tok.type} '${tok.value}'`
      );
    }
    return this.consume();
  }

  parse(depth = 0): ExprNode {
    if (depth > MAX_PARSE_DEPTH) {
      throw new Error("TLA+ expression exceeds maximum nesting depth");
    }
    return this.parseIfQuantifier(depth);
  }

  private parseIfQuantifier(depth: number): ExprNode {
    const tok = this.peek();
    if (tok.type === "IDENT" && tok.value === "IF") {
      this.consume();
      const condition = this.parse(depth + 1);
      this.expect("IDENT", "THEN");
      const thenBranch = this.parse(depth + 1);
      this.expect("IDENT", "ELSE");
      const elseBranch = this.parse(depth + 1);
      return { kind: "IfThenElse", condition, thenBranch, elseBranch };
    }

    if (tok.type === "OP" && (tok.value === "\\A" || tok.value === "\\E")) {
      const q = tok.value === "\\A" ? "FORALL" : "EXISTS";
      this.consume();
      const boundVar = this.expect("IDENT").value;
      this.expect("OP", "\\in");
      const domain = this.parseImplies(depth + 1);
      this.expect("COLON");
      const predicate = this.parse(depth + 1);
      return {
        kind: "Quantifier",
        quantifier: q,
        boundVar,
        domain,
        predicate,
      };
    }

    return this.parseImplies(depth);
  }

  private parseImplies(depth: number): ExprNode {
    let left = this.parseOr(depth);
    while (this.peek().type === "OP" && this.peek().value === "=>") {
      this.consume();
      const right = this.parseOr(depth + 1);
      left = { kind: "BinaryOp", op: "=>", left, right };
    }
    return left;
  }

  private parseOr(depth: number): ExprNode {
    // Handle leading bullet \/
    if (this.peek().type === "OP" && this.peek().value === "\\/") {
      this.consume();
    }
    let left = this.parseAnd(depth);
    while (this.peek().type === "OP" && this.peek().value === "\\/") {
      this.consume();
      const right = this.parseAnd(depth + 1);
      left = { kind: "BinaryOp", op: "||", left, right };
    }
    return left;
  }

  private parseAnd(depth: number): ExprNode {
    // Handle leading bullet /\
    if (this.peek().type === "OP" && this.peek().value === "/\\") {
      this.consume();
    }
    let left = this.parseComparison(depth);
    while (this.peek().type === "OP" && this.peek().value === "/\\") {
      this.consume();
      const right = this.parseComparison(depth + 1);
      left = { kind: "BinaryOp", op: "&&", left, right };
    }
    return left;
  }

  private parseComparison(depth: number): ExprNode {
    let left = this.parseSetOp(depth);
    const tok = this.peek();
    if (tok.type === "OP") {
      const map: Record<string, ExprNode & { kind: "BinaryOp" } extends never ? never : string> = {
        "=": "==",
        "#": "!=",
        "/=": "!=",
        "<": "<",
        "<=": "<=",
        ">": ">",
        ">=": ">=",
        "\\in": "IN",
        "\\notin": "NOT_IN",
        "\\subseteq": "SUBSET_EQ",
      };
      if (tok.value in map) {
        this.consume();
        const right = this.parseSetOp(depth + 1);
        left = {
          kind: "BinaryOp",
          op: map[tok.value] as Extract<ExprNode, { kind: "BinaryOp" }>["op"],
          left,
          right,
        };
      }
    }
    return left;
  }

  private parseSetOp(depth: number): ExprNode {
    let left = this.parseRange(depth);
    while (
      this.peek().type === "OP" &&
      (this.peek().value === "\\cup" ||
        this.peek().value === "\\cap" ||
        this.peek().value === "\\")
    ) {
      const opTok = this.consume().value;
      const op =
        opTok === "\\cup" ? "UNION" : opTok === "\\cap" ? "INTERSECT" : "DIFF";
      const right = this.parseRange(depth + 1);
      left = { kind: "BinaryOp", op, left, right };
    }
    return left;
  }

  private parseRange(depth: number): ExprNode {
    const left = this.parseAdditive(depth);
    if (this.peek().type === "DOTDOT") {
      this.consume();
      const right = this.parseAdditive(depth + 1);
      return { kind: "Range", start: left, end: right };
    }
    return left;
  }

  private parseAdditive(depth: number): ExprNode {
    let left = this.parseMultiplicative(depth);
    while (
      this.peek().type === "OP" &&
      (this.peek().value === "+" || this.peek().value === "-")
    ) {
      const op = this.consume().value as "+" | "-";
      const right = this.parseMultiplicative(depth + 1);
      left = { kind: "BinaryOp", op, left, right };
    }
    return left;
  }

  private parseMultiplicative(depth: number): ExprNode {
    let left = this.parseUnary(depth);
    while (
      this.peek().type === "OP" &&
      (this.peek().value === "*" ||
        this.peek().value === "\\div" ||
        this.peek().value === "%")
    ) {
      const raw = this.consume().value;
      const op = raw === "\\div" ? "/" : (raw as "*" | "%");
      const right = this.parseUnary(depth + 1);
      left = { kind: "BinaryOp", op, left, right };
    }
    return left;
  }

  private parseUnary(depth: number): ExprNode {
    const tok = this.peek();
    if (tok.type === "OP" && (tok.value === "~" || tok.value === "-")) {
      this.consume();
      const op = tok.value === "~" ? "!" : "-";
      return { kind: "UnaryOp", op, operand: this.parseUnary(depth + 1) };
    }
    return this.parsePostfix(depth);
  }

  private parsePostfix(depth: number): ExprNode {
    let expr = this.parsePrimary(depth);
    while (this.peek().type === "DOT") {
      this.consume();
      const field = this.expect("IDENT").value;
      if (FORBIDDEN_KEYS.has(field)) {
        throw new Error(`Forbidden field name: '${field}'`);
      }
      expr = { kind: "FieldAccess", target: expr, field };
    }
    return expr;
  }

  private parsePrimary(depth: number): ExprNode {
    const tok = this.peek();

    if (tok.type === "LPAREN") {
      this.consume();
      const inner = this.parse(depth + 1);
      this.expect("RPAREN");
      return inner;
    }

    if (tok.type === "LBRACE") {
      this.consume();
      const elements: ExprNode[] = [];
      if (this.peek().type !== "RBRACE") {
        elements.push(this.parse(depth + 1));
        while (this.peek().type === "COMMA") {
          this.consume();
          elements.push(this.parse(depth + 1));
        }
      }
      this.expect("RBRACE");
      return { kind: "SetLiteral", elements };
    }

    if (tok.type === "LBRACKET") {
      this.consume();
      const fields: Record<string, ExprNode> = {};
      if (this.peek().type !== "RBRACKET") {
        const parseField = () => {
          const key = this.expect("IDENT").value;
          if (FORBIDDEN_KEYS.has(key)) {
            throw new Error(`Forbidden record field: '${key}'`);
          }
          this.expect("OP", "|->");
          const val = this.parse(depth + 1);
          Object.defineProperty(fields, key, {
            value: val,
            enumerable: true,
            writable: true,
            configurable: true,
          });
        };
        parseField();
        while (this.peek().type === "COMMA") {
          this.consume();
          parseField();
        }
      }
      this.expect("RBRACKET");
      return { kind: "RecordLiteral", fields };
    }

    if (tok.type === "NUMBER") {
      this.consume();
      return { kind: "Literal", value: Number(tok.value) };
    }

    if (tok.type === "STRING") {
      this.consume();
      return { kind: "Literal", value: tok.value === "NULL" ? null : tok.value };
    }

    if (tok.type === "IDENT") {
      this.consume();
      if (tok.value === "TRUE") return { kind: "Literal", value: true };
      if (tok.value === "FALSE") return { kind: "Literal", value: false };
      if (tok.value === "Cardinality" && this.peek().type === "LPAREN") {
        this.consume();
        const operand = this.parse(depth + 1);
        this.expect("RPAREN");
        return { kind: "UnaryOp", op: "CARDINALITY", operand };
      }
      return { kind: "Var", name: tok.value };
    }

    throw new Error(`Unexpected token ${tok.type} '${tok.value}' in TLA+ expression`);
  }
}

/** Parses a TLA+ expression string into an AST ExprNode. */
export function parseTlaExpr(exprText: string): ExprNode {
  const tokens = tokenizeTlaExpr(exprText);
  const parser = new ExprParser(tokens);
  const node = parser.parse();
  return node;
}

function stripTlaComments(source: string): string {
  // Remove (* ... *) block comments and \* ... line comments (outside strings)
  let out = "";
  let i = 0;
  let inString = false;

  while (i < source.length) {
    if (source[i] === '"' && source[i - 1] !== "\\") {
      inString = !inString;
      out += source[i++];
      continue;
    }
    if (!inString && source.slice(i, i + 2) === "(*") {
      i += 2;
      while (i < source.length && source.slice(i, i + 2) !== "*)") {
        i++;
      }
      i += 2;
      continue;
    }
    if (!inString && source.slice(i, i + 2) === "\\*") {
      while (i < source.length && source[i] !== "\n") {
        i++;
      }
      continue;
    }
    out += source[i++];
  }
  return out;
}

function inferVarType(val: StateValue): VarType {
  if (typeof val === "number") return "number";
  if (typeof val === "boolean") return "boolean";
  if (Array.isArray(val)) return "set";
  if (val !== null && typeof val === "object") return "record";
  return "string";
}

function evalConstantExpr(node: ExprNode): StateValue {
  switch (node.kind) {
    case "Literal":
      return node.value;
    case "UnaryOp":
      if (node.op === "-") {
        const inner = evalConstantExpr(node.operand);
        if (typeof inner === "number") return -inner;
      }
      throw new Error("Non-constant expression in Init state");
    case "SetLiteral":
      return Object.freeze(node.elements.map(evalConstantExpr));
    case "RecordLiteral": {
      const rec: Record<string, StateValue> = {};
      for (const [k, v] of Object.entries(node.fields)) {
        Object.defineProperty(rec, k, {
          value: evalConstantExpr(v),
          enumerable: true,
          writable: true,
          configurable: true,
        });
      }
      return Object.freeze(rec);
    }
    default:
      throw new Error(`Unsupported Init value kind: ${node.kind}`);
  }
}

function splitTopLevelBy(text: string, sep: "/\\" | "\\/"): string[] {
  const parts: string[] = [];
  let depthParen = 0;
  let depthBrace = 0;
  let depthBracket = 0;
  let inString = false;
  let start = 0;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"' && text[i - 1] !== "\\") {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === "(") depthParen++;
    else if (ch === ")") depthParen--;
    else if (ch === "{") depthBrace++;
    else if (ch === "}") depthBrace--;
    else if (ch === "[") depthBracket++;
    else if (ch === "]") depthBracket--;

    if (
      depthParen === 0 &&
      depthBrace === 0 &&
      depthBracket === 0 &&
      text.slice(i, i + 2) === sep
    ) {
      const chunk = text.slice(start, i).trim();
      if (chunk) parts.push(chunk);
      start = i + 2;
      i += 1;
    }
  }

  const tail = text.slice(start).trim();
  if (tail) parts.push(tail);
  return parts;
}

function parseInitStates(
  initBody: string,
  varNames: readonly string[]
): readonly State[] {
  const disjuncts = splitTopLevelBy(initBody, "\\/");
  const states: State[] = [];

  for (const rawDisjunct of disjuncts) {
    let cleaned = rawDisjunct.trim();
    if (cleaned.startsWith("(") && cleaned.endsWith(")")) {
      cleaned = cleaned.slice(1, -1).trim();
    }
    const conjuncts = splitTopLevelBy(cleaned, "/\\");
    const st: Record<string, StateValue> = {};

    for (const conj of conjuncts) {
      const eqIdx = conj.indexOf("=");
      if (eqIdx === -1) continue;
      const lhs = conj.slice(0, eqIdx).trim();
      const rhs = conj.slice(eqIdx + 1).trim();
      if (FORBIDDEN_KEYS.has(lhs)) {
        throw new Error(`Forbidden variable name in Init: '${lhs}'`);
      }
      st[lhs] = evalConstantExpr(parseTlaExpr(rhs));
    }

    if (Object.keys(st).length > 0) {
      for (const v of varNames) {
        if (!(v in st)) {
          st[v] = null;
        }
      }
      states.push(Object.freeze(st));
    }
  }

  return states;
}

/**
 * Parses a structured TLA+ (.tla) file (and optional .cfg) into a VisualSpecIR.
 * Supports modules generated by `transpileToTla` as well as standard TLA+ specifications.
 */
export function parseTlaToSpec(
  tlaContent: string,
  options: TlaParseOptions = {}
): TlaParseResult {
  if (tlaContent.length > MAX_TLA_INPUT_BYTES) {
    throw new Error(`TLA+ input exceeds maximum size (${MAX_TLA_INPUT_BYTES} bytes)`);
  }

  const warnings: string[] = [];
  const noComments = stripTlaComments(tlaContent);

  // 1. Module name
  const moduleMatch = noComments.match(/----+\s*MODULE\s+([A-Za-z_][A-Za-z0-9_]*)\s*----+/);
  const moduleName = moduleMatch?.[1] ?? "ImportedTlaModel";

  // Remove header/footer lines
  const body = noComments
    .replace(/----+\s*MODULE\s+[A-Za-z_][A-Za-z0-9_]*\s*----+/, "")
    .replace(/====+/g, "")
    .replace(/^\s*EXTENDS\s+[^\n]+/m, "");

  // 2. Extract VARIABLES
  const varMatch = body.match(/^\s*VARIABLES?\s+([^\n]+)/m);
  const declaredVarNames = varMatch
    ? varMatch[1]
        .split(",")
        .map((s) => s.trim())
        .filter((s) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(s) && !FORBIDDEN_KEYS.has(s))
    : [];

  // 3. Extract top-level `Name == ...` definitions
  const defRegex = /^([A-Za-z_][A-Za-z0-9_]*)\s*==\s*/gm;
  const matches: { name: string; start: number; bodyStart: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = defRegex.exec(body)) !== null) {
    matches.push({
      name: m[1],
      start: m.index,
      bodyStart: m.index + m[0].length,
    });
  }

  const defs = new Map<string, string>();
  for (let i = 0; i < matches.length; i++) {
    const end = i + 1 < matches.length ? matches[i + 1].start : body.length;
    defs.set(matches[i].name, body.slice(matches[i].bodyStart, end).trim());
  }

  // 4. Parse Init
  const initBody = defs.get("Init");
  if (!initBody) {
    throw new Error("TLA+ specification must define 'Init == ...'");
  }
  const initialStates = parseInitStates(initBody, declaredVarNames);
  if (initialStates.length === 0) {
    throw new Error("Could not parse any initial state from 'Init'");
  }

  const allVarNames =
    declaredVarNames.length > 0
      ? declaredVarNames
      : Object.keys(initialStates[0]).sort();

  const variables: VarDecl[] = allVarNames.map((name) => ({
    name,
    type: inferVarType(initialStates[0][name]),
  }));

  // 5. Parse CFG invariants/properties if provided
  const cfgInvariants = new Set<string>();
  const cfgProperties = new Set<string>();
  if (options.cfgContent) {
    for (const line of options.cfgContent.split(/\r?\n/)) {
      const invM = line.match(/^\s*INVARIANT\s+([A-Za-z_][A-Za-z0-9_]*)/);
      if (invM) cfgInvariants.add(invM[1]);
      const propM = line.match(/^\s*PROPERTY\s+([A-Za-z_][A-Za-z0-9_]*)/);
      if (propM) cfgProperties.add(propM[1]);
    }
  }

  // 6. Determine actions from Next == \/ Act1 \/ Act2 ...
  const nextBody = defs.get("Next");
  const actionNames = nextBody
    ? splitTopLevelBy(nextBody, "\\/").map((s) => s.trim())
    : [...defs.keys()].filter(
        (k) =>
          k !== "Init" &&
          k !== "Next" &&
          k !== "Spec" &&
          k !== "vars" &&
          !k.startsWith("Inv_") &&
          !k.startsWith("Live_") &&
          !cfgInvariants.has(k) &&
          !cfgProperties.has(k)
      );

  let terminalCondition: ExprNode | undefined;
  const actions: VisualActionIR[] = [];

  actionNames.forEach((actName, idx) => {
    const rawBody = defs.get(actName);
    if (!rawBody) {
      warnings.push(`Action '${actName}' referenced in Next has no definition.`);
      return;
    }

    const conjuncts = splitTopLevelBy(rawBody, "/\\");
    const guardExprs: ExprNode[] = [];
    const effects: EffectAssignment[] = [];

    for (const conj of conjuncts) {
      if (/^UNCHANGED\b/.test(conj)) {
        continue;
      }

      const primedMatch = conj.match(/^([A-Za-z_][A-Za-z0-9_]*)'\s*=\s*([\s\S]+)$/);
      if (primedMatch) {
        const targetVar = primedMatch[1];
        if (FORBIDDEN_KEYS.has(targetVar)) {
          throw new Error(`Forbidden target variable: '${targetVar}'`);
        }
        effects.push({
          targetVar,
          expression: parseTlaExpr(primedMatch[2].trim()),
        });
        continue;
      }

      try {
        guardExprs.push(parseTlaExpr(conj));
      } catch (err) {
        warnings.push(
          `Skipped unsupported conjunct in '${actName}': ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    const combinedGuard: ExprNode =
      guardExprs.length === 0
        ? { kind: "Literal", value: true }
        : guardExprs.reduce((acc, cur) => ({
            kind: "BinaryOp",
            op: "&&",
            left: acc,
            right: cur,
          }));

    // Recognise `Terminated` stuttering action exported by transpileToTla
    if (actName === "Terminated" && effects.length === 0 && guardExprs.length > 0) {
      terminalCondition = combinedGuard;
      return;
    }

    actions.push({
      id: actName,
      name: actName,
      guard: combinedGuard,
      effects,
      position: {
        x: 60 + (idx % 2) * 320,
        y: 200 + Math.floor(idx / 2) * 180,
      },
    });
  });

  // 7. Parse Invariants & Liveness
  const invariants: VisualInvariantIR[] = [];
  const livenessProperties: VisualLivenessIR[] = [];

  for (const [defName, defBody] of defs.entries()) {
    if (
      defName === "Init" ||
      defName === "Next" ||
      defName === "Spec" ||
      defName === "vars" ||
      defName === "Terminated" ||
      actionNames.includes(defName)
    ) {
      continue;
    }

    const isExplicitInv = cfgInvariants.has(defName) || defName.startsWith("Inv_");
    const isExplicitProp = cfgProperties.has(defName) || defName.startsWith("Live_");

    const trimmed = defBody.trim();
    if (trimmed.startsWith("<>")) {
      const inner = trimmed.slice(2).trim();
      try {
        livenessProperties.push({
          id: defName.replace(/^Live_/, ""),
          kind: "EVENTUALLY",
          description: defName.replace(/^Live_/, ""),
          eventually: parseTlaExpr(inner),
        });
      } catch (err) {
        warnings.push(
          `Could not parse liveness property '${defName}': ${err instanceof Error ? err.message : String(err)}`
        );
      }
      continue;
    }

    if (trimmed.includes("~>")) {
      const [leftRaw, rightRaw] = trimmed.split("~>");
      try {
        const cleanLeft = leftRaw.trim().replace(/^\(/, "");
        const cleanRight = rightRaw.trim().replace(/\)$/, "");
        livenessProperties.push({
          id: defName.replace(/^Live_/, ""),
          kind: "LEADS_TO",
          description: defName.replace(/^Live_/, ""),
          trigger: parseTlaExpr(cleanLeft),
          response: parseTlaExpr(cleanRight),
        });
      } catch (err) {
        warnings.push(
          `Could not parse leads-to property '${defName}': ${err instanceof Error ? err.message : String(err)}`
        );
      }
      continue;
    }

    if (isExplicitInv && !isExplicitProp) {
      try {
        const id = defName.replace(/^Inv_/, "");
        invariants.push({
          id,
          description: id,
          predicate: parseTlaExpr(trimmed),
        });
      } catch (err) {
        warnings.push(
          `Could not parse invariant '${defName}': ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  }

  return {
    spec: {
      schemaVersion: 1,
      moduleName,
      variables,
      initialStates,
      actions,
      invariants,
      livenessProperties,
      terminalCondition,
    },
    warnings,
  };
}

/**
 * Safely parses and validates a JSON string representing a VisualSpecIR.
 */
export function parseJsonToSpec(jsonContent: string): JsonParseResult {
  if (jsonContent.length > MAX_TLA_INPUT_BYTES) {
    throw new Error(`JSON input exceeds maximum size (${MAX_TLA_INPUT_BYTES} bytes)`);
  }

  const parsed: unknown = JSON.parse(jsonContent);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Invalid VisualSpecIR JSON: root must be an object");
  }

  const obj = parsed as Record<string, unknown>;
  if (obj.schemaVersion !== 1 || typeof obj.moduleName !== "string") {
    throw new Error("Invalid VisualSpecIR JSON: missing schemaVersion=1 or moduleName");
  }

  const spec: VisualSpecIR = {
    schemaVersion: 1,
    moduleName: obj.moduleName,
    variables: Array.isArray(obj.variables) ? (obj.variables as VarDecl[]) : [],
    initialStates: Array.isArray(obj.initialStates) ? (obj.initialStates as State[]) : [],
    actions: Array.isArray(obj.actions) ? (obj.actions as VisualActionIR[]) : [],
    invariants: Array.isArray(obj.invariants) ? (obj.invariants as VisualInvariantIR[]) : [],
    livenessProperties: Array.isArray(obj.livenessProperties)
      ? (obj.livenessProperties as VisualLivenessIR[])
      : [],
    terminalCondition: obj.terminalCondition as ExprNode | undefined,
  };

  const issues = validateSpec(spec);
  return { spec, issues };
}

export type { Primitive };

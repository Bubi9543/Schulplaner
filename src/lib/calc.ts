// Sicherer Formel-Auswerter für den Taschenrechner.
// Kein eval() – Tokenizer + Shunting-Yard → RPN → Auswertung.
// Unterstützt: + - × ÷, Potenz (^), Klammern, Prozent (%),
// Funktionen (sin cos tan asin acos atan √ ln log exp abs)
// und Konstanten (π, e). Trig respektiert den Deg/Rad-Modus.

export interface EvalOptions {
  /** true = Eingaben in Grad, false = Bogenmaß. */
  deg?: boolean;
}

const FUNCTIONS = new Set([
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan',
  'sqrt', 'ln', 'log', 'exp', 'abs',
]);

const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E };

type TokType = 'num' | 'func' | 'const' | 'op' | 'lparen' | 'rparen' | 'percent';
interface Tok { t: TokType; v: string; }

/** Wandelt die hübschen Anzeigesymbole in maschinenlesbare Tokens um. */
function normalize(input: string): string {
  return input
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/−/g, '-')
    .replace(/π/g, 'pi')
    .replace(/√/g, 'sqrt')
    .replace(/,/g, '.');
}

function tokenize(s: string): Tok[] {
  const re = /([0-9]*\.?[0-9]+(?:e[+-]?[0-9]+)?)|([a-zA-Z]+)|([()])|([+\-*/^%])/g;
  const toks: Tok[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m[1] !== undefined && m[1] !== '') {
      toks.push({ t: 'num', v: m[1] });
    } else if (m[2]) {
      const id = m[2].toLowerCase();
      if (FUNCTIONS.has(id)) toks.push({ t: 'func', v: id });
      else if (id in CONSTS) toks.push({ t: 'const', v: id });
      else throw new Error(`Unbekannt: ${m[2]}`);
    } else if (m[3]) {
      toks.push({ t: m[3] === '(' ? 'lparen' : 'rparen', v: m[3] });
    } else if (m[4]) {
      toks.push({ t: m[4] === '%' ? 'percent' : 'op', v: m[4] });
    }
  }
  return toks;
}

function prec(op: string): number {
  switch (op) {
    case '+': case '-': return 2;
    case '*': case '/': return 3;
    case '^': return 4;
    case 'u-': case 'u+': return 5;
    default: return 0;
  }
}

function rightAssoc(op: string): boolean {
  return op === '^' || op === 'u-' || op === 'u+';
}

/** Shunting-Yard mit Erkennung von unärem Minus/Plus. */
function toRPN(toks: Tok[]): Tok[] {
  const out: Tok[] = [];
  const stack: Tok[] = [];
  let prev: Tok | null = null;

  for (const tok of toks) {
    if (tok.t === 'num' || tok.t === 'const') {
      out.push(tok);
    } else if (tok.t === 'func') {
      stack.push(tok);
    } else if (tok.t === 'percent') {
      out.push(tok); // Postfix – wirkt direkt auf den vorherigen Wert.
    } else if (tok.t === 'op') {
      let op = tok.v;
      const unary = (op === '-' || op === '+') &&
        (!prev || prev.t === 'op' || prev.t === 'lparen');
      if (unary) op = op === '-' ? 'u-' : 'u+';

      while (stack.length) {
        const top = stack[stack.length - 1];
        if (top.t === 'func') { out.push(stack.pop()!); continue; }
        if (top.t === 'op') {
          const cmp = rightAssoc(op) ? prec(op) < prec(top.v) : prec(op) <= prec(top.v);
          if (cmp) { out.push(stack.pop()!); continue; }
        }
        break;
      }
      stack.push({ t: 'op', v: op });
    } else if (tok.t === 'lparen') {
      stack.push(tok);
    } else if (tok.t === 'rparen') {
      while (stack.length && stack[stack.length - 1].t !== 'lparen') out.push(stack.pop()!);
      if (!stack.length) throw new Error('Klammerfehler');
      stack.pop(); // ( entfernen
      if (stack.length && stack[stack.length - 1].t === 'func') out.push(stack.pop()!);
    }
    prev = tok;
  }

  while (stack.length) {
    const top = stack.pop()!;
    if (top.t === 'lparen') throw new Error('Klammerfehler');
    out.push(top);
  }
  return out;
}

function applyFunc(name: string, x: number, opts: EvalOptions): number {
  const toRad = (v: number) => (opts.deg ? (v * Math.PI) / 180 : v);
  const fromRad = (v: number) => (opts.deg ? (v * 180) / Math.PI : v);
  switch (name) {
    case 'sin': return Math.sin(toRad(x));
    case 'cos': return Math.cos(toRad(x));
    case 'tan': return Math.tan(toRad(x));
    case 'asin': return fromRad(Math.asin(x));
    case 'acos': return fromRad(Math.acos(x));
    case 'atan': return fromRad(Math.atan(x));
    case 'sqrt': return Math.sqrt(x);
    case 'ln': return Math.log(x);
    case 'log': return Math.log10(x);
    case 'exp': return Math.exp(x);
    case 'abs': return Math.abs(x);
    default: throw new Error(`Unbekannt: ${name}`);
  }
}

function evalRPN(rpn: Tok[], opts: EvalOptions): number {
  const st: number[] = [];
  for (const tok of rpn) {
    if (tok.t === 'num') {
      st.push(parseFloat(tok.v));
    } else if (tok.t === 'const') {
      st.push(CONSTS[tok.v]);
    } else if (tok.t === 'percent') {
      const a = st.pop();
      if (a === undefined) throw new Error('Syntax');
      st.push(a / 100);
    } else if (tok.t === 'func') {
      const a = st.pop();
      if (a === undefined) throw new Error('Syntax');
      st.push(applyFunc(tok.v, a, opts));
    } else if (tok.t === 'op') {
      if (tok.v === 'u-') { const a = st.pop(); if (a === undefined) throw new Error('Syntax'); st.push(-a); continue; }
      if (tok.v === 'u+') { continue; }
      const b = st.pop();
      const a = st.pop();
      if (a === undefined || b === undefined) throw new Error('Syntax');
      switch (tok.v) {
        case '+': st.push(a + b); break;
        case '-': st.push(a - b); break;
        case '*': st.push(a * b); break;
        case '/': st.push(a / b); break;
        case '^': st.push(Math.pow(a, b)); break;
        default: throw new Error(`Unbekannt: ${tok.v}`);
      }
    }
  }
  if (st.length !== 1) throw new Error('Syntax');
  return st[0];
}

/** Wertet einen Ausdruck aus. Wirft bei Syntaxfehlern. */
export function evaluate(input: string, opts: EvalOptions = {}): number {
  const expr = normalize(input);
  if (!expr.trim()) throw new Error('Leer');
  const result = evalRPN(toRPN(tokenize(expr)), opts);
  if (!Number.isFinite(result)) throw new Error('Mathefehler');
  return result;
}

/** Formatiert ein Ergebnis hübsch (max. 10 signifikante Stellen, keine Float-Artefakte). */
export function formatResult(n: number): string {
  if (Number.isInteger(n) && Math.abs(n) < 1e15) return String(n);
  const rounded = parseFloat(n.toPrecision(10));
  return String(rounded);
}

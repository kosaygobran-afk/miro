/**
 * Deterministic arithmetic engine for the management calculator.
 * Pure module — safe for client and server. No eval, no dependencies.
 *
 * Percent semantics (calculator-style):
 * - `a + b%` means a + a * b / 100  (1000 + 18% = 1180)
 * - `a - b%` means a - a * b / 100
 * - A percent-flagged factor used with * or / means / 100 (200 * 10% = 20, 50 / 50% = 100)
 * - A standalone b% means b / 100 (18% = 0.18)
 * - Percent applies to the immediately preceding evaluated factor (number or parenthesized group).
 */

const MAX_INPUT_LENGTH = 200;
const MAX_OPERATIONS = 500;
const MAX_MAGNITUDE = 1e15;

export type CalculatorKeyboardAction =
  { type: "input"; value: string } | { type: "backspace" } | { type: "equals" };

export function getCalculatorKeyboardAction(
  key: string,
): CalculatorKeyboardAction | null {
  if (key === "Enter" || key === "=") return { type: "equals" };
  if (key === "Backspace" || key === "Delete") return { type: "backspace" };
  if (/^[0-9.%+\-*/()]$/.test(key)) return { type: "input", value: key };
  return null;
}

export class CalculatorError extends Error {
  public readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "CalculatorError";
    this.code = code;
  }
}

type Factor = { value: number; percent: boolean };

class Parser {
  private pos = 0;
  private operations = 0;

  constructor(private readonly input: string) {}

  parse(): number {
    const value = this.parseAdditive();
    this.skipWhitespace();
    if (this.pos < this.input.length) {
      throw new CalculatorError(
        `Invalid expression: unexpected character at position ${this.pos}`,
        "INVALID_EXPRESSION",
      );
    }
    this.guard(value);
    return value;
  }

  private atEnd(): boolean {
    return this.pos >= this.input.length;
  }

  private peek(): string | undefined {
    return this.atEnd() ? undefined : this.input[this.pos];
  }

  private skipWhitespace(): void {
    while (!this.atEnd() && /\s/.test(this.input[this.pos])) this.pos++;
  }

  private countOp(): void {
    this.operations++;
    if (this.operations > MAX_OPERATIONS) {
      throw new CalculatorError("Too many operations", "TOO_MANY_OPERATIONS");
    }
  }

  private guard(value: number): number {
    if (!Number.isFinite(value)) {
      throw new CalculatorError("Result is not finite", "NON_FINITE_RESULT");
    }
    if (Math.abs(value) > MAX_MAGNITUDE) {
      throw new CalculatorError("Result too large (exceeds 1e15)", "OVERFLOW");
    }
    return value;
  }

  private expect(char: string): void {
    const actual = this.peek();
    if (actual !== char) {
      throw new CalculatorError(
        `Expected '${char}' at position ${this.pos}`,
        this.atEnd() ? "INVALID_EXPRESSION" : "INVALID_CHARACTER",
      );
    }
    this.pos++;
  }

  private parseAdditive(): number {
    const first = this.parseMultiplicative();
    let acc = first.percent ? first.value / 100 : first.value;
    this.guard(acc);

    for (;;) {
      this.skipWhitespace();
      const op = this.peek();
      if (op !== "+" && op !== "-") break;
      this.pos++;
      this.countOp();
      const term = this.parseMultiplicative();
      // Calculator style: `acc + b%` contributes acc * b / 100
      const contribution = term.percent ? (acc * term.value) / 100 : term.value;
      acc = op === "+" ? acc + contribution : acc - contribution;
      this.guard(acc);
    }
    return acc;
  }

  private parseMultiplicative(): Factor {
    const first = this.parseFactor();
    let left = first.value;
    // A lone percent-flagged factor propagates its flag to the additive level;
    // any * or / consumes it as /100.
    let pendingPercent = first.percent;

    for (;;) {
      this.skipWhitespace();
      const op = this.peek();
      if (op !== "*" && op !== "/") break;
      this.pos++;
      this.countOp();
      if (pendingPercent) {
        left = left / 100;
        pendingPercent = false;
      }
      const rhs = this.parseFactor();
      const rv = rhs.percent ? rhs.value / 100 : rhs.value;
      if (op === "*") {
        left = left * rv;
      } else {
        if (rv === 0) {
          throw new CalculatorError("Division by zero", "DIV_BY_ZERO");
        }
        left = left / rv;
      }
      this.guard(left);
    }
    return { value: left, percent: pendingPercent };
  }

  private parseFactor(): Factor {
    this.skipWhitespace();
    let negative = false;
    while (this.peek() === "-") {
      negative = !negative;
      this.pos++;
      this.skipWhitespace();
    }

    let value: number;
    let percent = false;
    const char = this.peek();

    if (char === "(") {
      this.pos++;
      this.countOp();
      value = this.parseAdditive();
      this.skipWhitespace();
      if (this.peek() !== ")") {
        throw new CalculatorError(
          "Mismatched parentheses",
          "MISMATCHED_PARENS",
        );
      }
      this.pos++;
    } else if (char !== undefined && /[\d.]/.test(char)) {
      value = this.parseNumber();
    } else {
      throw new CalculatorError(
        `Invalid expression: expected a number at position ${this.pos}`,
        "INVALID_EXPRESSION",
      );
    }

    const flag = this.parsePercentFlag();
    if (flag) percent = true;
    return { value: negative ? -value : value, percent };
  }

  private parsePercentFlag(): boolean {
    if (this.peek() !== "%") return false;
    this.pos++;
    this.countOp();
    return true;
  }

  private parseNumber(): number {
    const start = this.pos;
    while (!this.atEnd() && /\d/.test(this.input[this.pos])) this.pos++;
    if (this.peek() === ".") {
      this.pos++;
      if (this.atEnd() || !/\d/.test(this.input[this.pos])) {
        throw new CalculatorError(
          `Invalid number at position ${start}`,
          "INVALID_EXPRESSION",
        );
      }
      while (!this.atEnd() && /\d/.test(this.input[this.pos])) this.pos++;
    }
    const raw = this.input.slice(start, this.pos);
    const value = Number(raw);
    if (!Number.isFinite(value) || raw === "") {
      throw new CalculatorError(
        `Invalid number: '${raw}'`,
        "INVALID_EXPRESSION",
      );
    }
    if (Math.abs(value) > MAX_MAGNITUDE) {
      throw new CalculatorError("Number too large (exceeds 1e15)", "OVERFLOW");
    }
    return value;
  }
}

function normalizeOperators(input: string): string {
  return input.replace(/×/g, "*").replace(/÷/g, "/").replace(/[−–—]/g, "-");
}

/**
 * Evaluates a calculator expression. Throws CalculatorError with a
 * machine-readable `code` on any invalid or unsafe input.
 * Result is rounded to 10 decimal places to eliminate binary float noise.
 */
export function evaluateExpression(input: string): number {
  if (input == null) {
    throw new CalculatorError("Input is null or undefined", "NULL_INPUT");
  }
  const normalized = normalizeOperators(input).trim();
  if (normalized.length === 0) {
    throw new CalculatorError("Empty or whitespace-only input", "EMPTY_INPUT");
  }
  if (normalized.length > MAX_INPUT_LENGTH) {
    throw new CalculatorError(
      `Input exceeds maximum length of ${MAX_INPUT_LENGTH} characters`,
      "INPUT_TOO_LONG",
    );
  }
  const value = new Parser(normalized).parse();
  return Math.round(value * 1e10) / 1e10;
}

/**
 * Normalizes user expression input for display/storage: trims, collapses
 * whitespace runs, and maps Unicode operators (×, ÷, −, –, —) to ASCII.
 */
export function formatExpression(input: string): string {
  return normalizeOperators(input).trim().replace(/\s+/g, " ");
}

/**
 * Rounds to 2 decimal places, half-up (sign-aware).
 */
export function roundMoney(amount: number): number {
  const sign = amount < 0 ? -1 : 1;
  return (sign * Math.floor(Math.abs(amount) * 100 + 0.5 + 1e-9)) / 100;
}

/** Gross-up by the configured VAT rate percent (never hardcoded). */
export function applyVatRate(amount: number, vatRatePct: number): number {
  return roundMoney(amount * (1 + vatRatePct / 100));
}

/** Extract the net amount from a VAT-inclusive gross at the configured rate. */
export function removeVatRate(amount: number, vatRatePct: number): number {
  return roundMoney(amount / (1 + vatRatePct / 100));
}

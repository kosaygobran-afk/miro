import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";

// Load the calculator module
const source = await readFile(
  new URL("../../src/lib/calculator.ts", import.meta.url),
  "utf8",
);
const calculator = {};
runInNewContext(
  ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText,
  {
    exports: calculator,
  },
);

// Destructure what we need
const {
  evaluateExpression,
  formatExpression,
  applyVatRate,
  removeVatRate,
  roundMoney,
} = calculator;

test("calculator keyboard maps numeric, operator, delete, and equals keys", () => {
  assert.equal(calculator.getCalculatorKeyboardAction("7")?.type, "input");
  assert.equal(calculator.getCalculatorKeyboardAction("7")?.value, "7");
  assert.equal(calculator.getCalculatorKeyboardAction("(")?.value, "(");
  assert.equal(
    calculator.getCalculatorKeyboardAction("Backspace")?.type,
    "backspace",
  );
  assert.equal(calculator.getCalculatorKeyboardAction("=")?.type, "equals");
  assert.equal(calculator.getCalculatorKeyboardAction("Enter")?.type, "equals");
  assert.equal(calculator.getCalculatorKeyboardAction("Escape"), null);
  assert.equal(calculator.getCalculatorKeyboardAction("ArrowLeft"), null);
});

test("evaluateExpression handles basic addition and subtraction", () => {
  assert.equal(evaluateExpression("2 + 3"), 5);
  assert.equal(evaluateExpression("10 - 4"), 6);
  assert.equal(evaluateExpression("5 + 5 - 2"), 8);
});

test("evaluateExpression handles multiplication and division", () => {
  assert.equal(evaluateExpression("3 * 4"), 12);
  assert.equal(evaluateExpression("15 / 3"), 5);
  assert.equal(evaluateExpression("2 * 3 * 4"), 24);
  assert.equal(evaluateExpression("24 / 4 / 2"), 3);
});

test("evaluateExpression handles operator precedence", () => {
  assert.equal(evaluateExpression("2 + 3 * 4"), 14); // 2 + (3 * 4) = 2 + 12 = 14
  assert.equal(evaluateExpression("10 - 2 * 3"), 4); // 10 - (2 * 3) = 10 - 6 = 4
  assert.equal(evaluateExpression("8 / 2 * 4"), 16); // (8 / 2) * 4 = 4 * 4 = 16 (left to right)
});

test("evaluateExpression handles parentheses", () => {
  assert.equal(evaluateExpression("(2 + 3) * 4"), 20); // (2 + 3) * 4 = 5 * 4 = 20
  assert.equal(evaluateExpression("10 - (2 + 3)"), 5); // 10 - (2 + 3) = 10 - 5 = 5
  assert.equal(evaluateExpression("2 * (3 + 4) * 5"), 70); // 2 * 7 * 5 = 70
  assert.equal(evaluateExpression("((1 + 2) * 3) + 4"), 13); // ((1 + 2) * 3) + 4 = (3 * 3) + 4 = 9 + 4 = 13
});

test("evaluateExpression handles decimal numbers", () => {
  assert.equal(evaluateExpression("2.5 + 3.7"), 6.2);
  assert.equal(evaluateExpression("10.5 - 2.3"), 8.2);
  assert.equal(evaluateExpression("3.14 * 2"), 6.28);
  // 10 / 3 rounded to 10 decimal places
  assert.equal(evaluateExpression("10 / 3"), 3.3333333333);
});

test("evaluateExpression handles unary minus", () => {
  assert.equal(evaluateExpression("-5 + 3"), -2);
  assert.equal(evaluateExpression("5 * (-3)"), -15);
  assert.equal(evaluateExpression("-(-4)"), 4);
  assert.equal(evaluateExpression("-(2 + 3) * 2"), -10); // -(2 + 3) * 2 = -5 * 2 = -10
});

test("evaluateExpression handles calculator-style percent", () => {
  // a + b% means a + (a * b / 100)
  assert.equal(evaluateExpression("100 + 20%"), 120); // 100 + (100 * 20 / 100) = 100 + 20 = 120
  assert.equal(evaluateExpression("50 + 10%"), 55); // 50 + (50 * 10 / 100) = 50 + 5 = 55

  // a - b% means a - (a * b / 100)
  assert.equal(evaluateExpression("100 - 20%"), 80); // 100 - (100 * 20 / 100) = 100 - 20 = 80
  assert.equal(evaluateExpression("50 - 10%"), 45); // 50 - (50 * 10 / 100) = 50 - 5 = 45

  // Standalone b% means b / 100
  assert.equal(evaluateExpression("20%"), 0.2); // 20 / 100 = 0.2
  assert.equal(evaluateExpression("50%"), 0.5); // 50 / 100 = 0.5

  // Percent after multiplication/division (normal operation)
  assert.equal(evaluateExpression("200 * 10%"), 20); // 200 * (10 / 100) = 200 * 0.1 = 20
  assert.equal(evaluateExpression("50 / 50%"), 100); // 50 / (50 / 100) = 50 / 0.5 = 100

  // Mixed expressions
  assert.equal(evaluateExpression("100 + 50 * 10%"), 105); // 100 + (50 * 0.1) = 100 + 5 = 105
  assert.equal(evaluateExpression("200 - 100 * 5%"), 195); // 5% consumed by * → 100 * 0.05 = 5; 200 - 5 = 195
});

test("evaluateExpression handles mixed whitespace", () => {
  assert.equal(evaluateExpression("  2 + 3  "), 5);
  assert.equal(evaluateExpression("2\t+\t3"), 5);
  assert.equal(evaluateExpression("2\n+\n3"), 5);
  assert.equal(evaluateExpression("  2   +   3   "), 5);
});

test("evaluateExpression handles 0.1 + 0.2 = 0.3 (floating point precision)", () => {
  // Should return exactly 0.3 due to rounding to 10 decimal places
  assert.equal(evaluateExpression("0.1 + 0.2"), 0.3);
});

test("evaluateExpression applies VatRate correctly", () => {
  // Test with 18% rate
  assert.equal(applyVatRate(1000, 18), 1180);
  assert.equal(removeVatRate(1180, 18), 1000);

  // Test with 17% rate (proves no hardcoding)
  assert.equal(applyVatRate(1000, 17), 1170);
  assert.equal(removeVatRate(1170, 17), 1000);

  // Round trip test
  const amount = 123.45;
  const rate = 18;
  const gross = applyVatRate(amount, rate);
  const net = removeVatRate(gross, rate);
  assert.equal(net, amount);
});

test("evaluateExpression roundMoney helper works correctly", () => {
  assert.equal(roundMoney(123.456), 123.46); // rounds up
  assert.equal(roundMoney(123.454), 123.45); // rounds down
  assert.equal(roundMoney(123.455), 123.46); // rounds up (half-up)
  assert.equal(roundMoney(-123.456), -123.46); // negative numbers
});

test("evaluateExpression formatExpression normalizes input", () => {
  assert.equal(formatExpression("  2  +  3  "), "2 + 3");
  assert.equal(formatExpression("2×3"), "2*3"); // multiplication sign
  assert.equal(formatExpression("10÷2"), "10/2"); // division sign
  assert.equal(formatExpression("5−3"), "5-3"); // minus sign
  assert.equal(formatExpression("  2 × 3 ÷ 4 − 1  "), "2 * 3 / 4 - 1");
});

test("evaluateExpression rejects empty/whitespace input", () => {
  assert.throws(() => evaluateExpression(""), /CalculatorError/);
  assert.throws(() => evaluateExpression("   "), /CalculatorError/);
  assert.throws(() => evaluateExpression("\t\n\r"), /CalculatorError/);
});

test("evaluateExpression rejects invalid characters", () => {
  assert.throws(() => evaluateExpression("2 + a"), /CalculatorError/);
  assert.throws(() => evaluateExpression("2 + @"), /CalculatorError/);
  assert.throws(() => evaluateExpression("2 # 3"), /CalculatorError/);
  assert.throws(() => evaluateExpression("hello"), /CalculatorError/);
});

test("evaluateExpression rejects malformed expressions", () => {
  assert.throws(() => evaluateExpression("2 +"), /CalculatorError/); // trailing operator
  assert.throws(() => evaluateExpression("+ 2"), /CalculatorError/); // leading operator
  assert.throws(() => evaluateExpression("2 + + 3"), /CalculatorError/); // double operator
  assert.throws(() => evaluateExpression("(2 + 3"), /CalculatorError/); // unbalanced parens
  assert.throws(() => evaluateExpression("2 + 3)"), /CalculatorError/); // unbalanced parens
  assert.throws(() => evaluateExpression("2 . 3"), /CalculatorError/); // invalid decimal
  assert.throws(() => evaluateExpression("2..3"), /CalculatorError/); // multiple decimal points
});

test("evaluateExpression rejects division by zero", () => {
  assert.throws(() => evaluateExpression("1 / 0"), /CalculatorError/);
  assert.throws(() => evaluateExpression("(2 + 3) / 0"), /CalculatorError/);
  assert.throws(() => evaluateExpression("1 / 0 + 1"), /CalculatorError/); // 1/0+1 should reject
});

test("evaluateExpression rejects non-finite results", () => {
  // These would create infinity or NaN
  assert.throws(() => evaluateExpression("1 / 0"), /CalculatorError/);
  // Note: Actually testing for NaN is tricky since we'd need to generate it
  // The implementation should catch division by zero above
});

test("evaluateExpression rejects intermediate magnitude beyond 1e15", () => {
  // Create a number that would exceed 1e15 during calculation
  assert.throws(() => evaluateExpression("1e14 * 20"), /CalculatorError/); // 2e15 > 1e15
  assert.throws(() => evaluateExpression("1e15 * 2"), /CalculatorError/); // 2e15 > 1e15
});

test("evaluateExpression rejects overly long input", () => {
  const longInput = "1".repeat(201) + " + 1";
  assert.throws(() => evaluateExpression(longInput), /CalculatorError/);
});

test("evaluateExpression rejects too many tokens", () => {
  // Create an expression with many small numbers to exceed 500 tokens
  const manyTokens = Array(501).fill("1").join(" + ");
  assert.throws(() => evaluateExpression(manyTokens), /CalculatorError/);
});

test("evaluateExpression rejects eval-style payloads", () => {
  // These should be rejected as invalid characters
  assert.throws(
    () => evaluateExpression("1;process.exit()"),
    /CalculatorError/,
  );
  assert.throws(() => evaluateExpression("1,n"), /CalculatorError/);
  assert.throws(() => evaluateExpression("2 + alert('x')"), /CalculatorError/);
});

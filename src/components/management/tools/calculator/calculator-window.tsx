"use client";

import { useEffect, useRef, useState } from "react";
import {
  evaluateExpression,
  applyVatRate,
  removeVatRate,
  CalculatorError,
} from "@/lib/calculator";
import { useManagementTools } from "../management-tool-provider";
import { calculatorCopy as copy } from "./calculator-copy";
import styles from "./calculator-window.module.css";

interface CalculatorWindowProps {
  locale: "he" | "en";
  userId: string;
}

export function CalculatorWindow({ locale, userId }: CalculatorWindowProps) {
  const t = (map: Record<"he" | "en", string>) => map[locale];
  const { saveDraft, clearDraft } = useManagementTools();

  const [display, setDisplay] = useState("0");
  const [pendingInput, setPendingInput] = useState(false);
  const [vatRate, setVatRate] = useState<number | null>(null);
  const [history, setHistory] = useState<
    Array<{ time: string; expression: string; result: string }>
  >([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const displayRef = useRef<HTMLDivElement | null>(null);

  // Load VAT rate from API (same as sales-panel)
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/management/tax", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : { taxRates: [] }))
      .then((data) => {
        if (controller.signal.aborted) return;
        const rows = Array.isArray(data.taxRates) ? data.taxRates : [];
        const current = rows.find(
          (row: { status?: string; is_active?: boolean }) =>
            row.status === "current" && row.is_active !== false,
        );
        if (current && typeof current.rate === "number") {
          setVatRate(current.rate);
        }
      })
      .catch(() => {
        // VAT estimate unavailable
      });
    return () => controller.abort();
  }, []);

  // Load history from API
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/management/calculator-history?limit=20`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (res) => {
        if (controller.signal.aborted) return;
        if (!res.ok) {
          setHistory([]);
          return;
        }
        const data = await res.json();
        const records = Array.isArray(data.records) ? data.records : [];
        setHistory(
          records
            .map(
              (record: {
                time: string;
                expression: string;
                result: string;
              }) => ({
                time: record.time,
                expression: record.expression,
                result: record.result,
              }),
            )
            .reverse(), // Most recent first
        );
      })
      .catch(() => setHistory([]));
    return () => controller.abort();
  }, []);

  // Save draft when display changes
  useEffect(() => {
    saveDraft("calculator", { display, pendingInput, vatRate, historyOpen });
  }, [display, pendingInput, vatRate, historyOpen, userId, saveDraft]);

  // Clear display when component unmounts or userId changes (handled by provider)
  useEffect(() => {
    return () => {
      clearDraft("calculator");
    };
  }, [userId, clearDraft]);

  const handleKeyPress = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (error) {
      // Clear error on any key press when there's an error
      setError(null);
      return;
    }

    const key = event.key;

    // Allow digits, decimal point, and operators
    if (/[\d.%+\-*/()]/.test(key)) {
      handleInput(key);
      return;
    }

    // Handle Enter as equals
    if (key === "Enter" || key === "=") {
      event.preventDefault();
      handleEquals();
      return;
    }

    // Handle Escape to minimize (this should be handled by the window component)
    // But we'll also handle it here for safety
    if (key === "Escape") {
      // The window component should handle this and minimize
      return;
    }
  };

  const handleInput = (input: string) => {
    if (error) {
      setError(null);
    }

    if (pendingInput && /[\d.]/.test(input)) {
      setDisplay(input);
      setPendingInput(false);
    } else {
      setDisplay((prev) => (prev === "0" ? input : prev + input));
      setPendingInput(false);
    }
  };

  const handleBackspace = () => {
    if (error) {
      setError(null);
      return;
    }

    setDisplay((prev) => {
      if (prev.length <= 1) return "0";
      return prev.slice(0, -1);
    });
    setPendingInput(false);
  };

  const handleClear = () => {
    setDisplay("0");
    setPendingInput(false);
    setError(null);
  };

  const handleSign = () => {
    if (error) {
      setError(null);
      return;
    }

    setDisplay((prev) => {
      if (prev === "0") return "0";
      if (prev.startsWith("-")) return prev.slice(1);
      return `-${prev}`;
    });
    setPendingInput(false);
  };

  const handlePercent = () => {
    if (error) {
      setError(null);
      return;
    }

    handleInput("%");
  };

  const handleEquals = () => {
    if (error) {
      setError(null);
      return;
    }

    try {
      const result = evaluateExpression(display);
      setDisplay(String(result));
      setPendingInput(true);

      // Save to history via API
      saveToHistory(display);
    } catch (err) {
      if (err instanceof CalculatorError) {
        switch (err.code) {
          case "DIV_BY_ZERO":
            setError(t(copy.errorDivByZero));
            break;
          case "EMPTY_INPUT":
            setError(t(copy.errorEmptyInput));
            break;
          case "OVERFLOW":
            setError(t(copy.errorOverflow));
            break;
          case "INVALID_EXPRESSION":
          case "INVALID_CHARACTER":
          case "MISMATCHED_PARENS":
          case "NULL_INPUT":
          case "INPUT_TOO_LONG":
          case "TOO_MANY_OPERATIONS":
          case "NON_FINITE_RESULT":
            setError(t(copy.errorInvalidExpression));
            break;
          default:
            setError(t(copy.errorInvalidExpression));
        }
      } else {
        setError(t(copy.errorInvalidExpression));
      }
    }
  };

  const handleVatAdd = () => {
    if (error) {
      setError(null);
      return;
    }

    if (vatRate === null) {
      setError(t(copy.errorInvalidExpression)); // VAT unavailable
      return;
    }

    try {
      const value = parseFloat(display);
      if (isNaN(value)) {
        setError(t(copy.errorInvalidExpression));
        return;
      }
      const result = applyVatRate(value, vatRate);
      setDisplay(String(result));
      setPendingInput(true);
    } catch {
      setError(t(copy.errorInvalidExpression));
    }
  };

  const handleVatSubtract = () => {
    if (error) {
      setError(null);
      return;
    }

    if (vatRate === null) {
      setError(t(copy.errorInvalidExpression)); // VAT unavailable
      return;
    }

    try {
      const value = parseFloat(display);
      if (isNaN(value)) {
        setError(t(copy.errorInvalidExpression));
        return;
      }
      const result = removeVatRate(value, vatRate);
      setDisplay(String(result));
      setPendingInput(true);
    } catch {
      setError(t(copy.errorInvalidExpression));
    }
  };

  const saveToHistory = (expression: string) => {
    fetch("/api/management/calculator-history", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expression, contextPath: "/management/tools" }),
    })
      .then(async (res) => {
        if (!res.ok) return;
        const data = await res.json();
        const newRecord = {
          time: new Date().toISOString(),
          expression,
          result: String(data.result),
        };
        setHistory((prev) => [newRecord, ...prev.slice(0, 19)]); // Keep max 20
      })
      .catch(() => {
        // Silently fail - history is enhancement, not core functionality
      });
  };

  const handleHistoryItemClick = (item: {
    time: string;
    expression: string;
    result: string;
  }) => {
    setDisplay(item.result);
    setPendingInput(true);
    setHistoryOpen(false);
  };

  const handleClearHistory = () => {
    if (window.confirm(t(copy.clearHistoryConfirm))) {
      fetch("/api/management/calculator-history", {
        method: "DELETE",
      })
        .then(() => {
          setHistory([]);
        })
        .catch(() => {
          // Silently fail
        });
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.displayGroup}>
        <div
          ref={displayRef}
          className={styles.display}
          role="textbox"
          aria-readonly="true"
          tabIndex={0}
          onKeyDown={handleKeyPress}
        >
          {display}
        </div>
        {vatRate === null ? null : (
          <div className={styles.vatNote}>{t(copy.percentNote)}</div>
        )}
      </div>

      <div className={styles.keypad}>
        {/* Row 1: Backspace, Clear, %, / */}
        <button className={styles.button} onClick={handleBackspace}>
          {t(copy.backspace)}
        </button>
        <button className={styles.button} onClick={handleClear}>
          {t(copy.clear)}
        </button>
        <button className={styles.button} onClick={handlePercent}>
          {t(copy.percent)}
        </button>
        <button className={styles.button} onClick={() => handleInput("/")}>
          {t(copy.divide)}
        </button>

        {/* Row 2: 7, 8, 9, * */}
        <button className={styles.button} onClick={() => handleInput("7")}>
          7
        </button>
        <button className={styles.button} onClick={() => handleInput("8")}>
          8
        </button>
        <button className={styles.button} onClick={() => handleInput("9")}>
          9
        </button>
        <button className={styles.button} onClick={() => handleInput("*")}>
          {t(copy.multiply)}
        </button>

        {/* Row 3: 4, 5, 6, - */}
        <button className={styles.button} onClick={() => handleInput("4")}>
          4
        </button>
        <button className={styles.button} onClick={() => handleInput("5")}>
          5
        </button>
        <button className={styles.button} onClick={() => handleInput("6")}>
          6
        </button>
        <button className={styles.button} onClick={() => handleInput("-")}>
          {t(copy.subtract)}
        </button>

        {/* Row 4: 1, 2, 3, + */}
        <button className={styles.button} onClick={() => handleInput("1")}>
          1
        </button>
        <button className={styles.button} onClick={() => handleInput("2")}>
          2
        </button>
        <button className={styles.button} onClick={() => handleInput("3")}>
          3
        </button>
        <button className={styles.button} onClick={() => handleInput("+")}>
          {t(copy.add)}
        </button>

        {/* Row 5: 0, ., ±, = */}
        <button
          className={styles.buttonDouble}
          onClick={() => handleInput("0")}
        >
          0
        </button>
        <button className={styles.button} onClick={() => handleInput(".")}>
          {t(copy.decimal)}
        </button>
        <button className={styles.button} onClick={handleSign}>
          {t(copy.sign)}
        </button>
        <button className={styles.button} onClick={handleEquals}>
          {t(copy.equals)}
        </button>

        {/* Row 6: VAT buttons */}
        <button className={styles.button} onClick={handleVatAdd}>
          {t(copy.vatAdd)}
        </button>
        <button className={styles.button} onClick={handleVatSubtract}>
          {t(copy.vatSubtract)}
        </button>
      </div>

      {/* History Panel */}
      <div
        className={`${styles.historyPanel} ${historyOpen ? styles.historyPanelOpen : ""}`}
      >
        <div className={styles.historyHeader}>
          <button
            className={styles.historyToggle}
            onClick={() => setHistoryOpen(!historyOpen)}
            aria-label={t(historyOpen ? copy.minimize : copy.history)}
          >
            {historyOpen ? (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M5 12h14"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            ) : (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M12 5l0 14"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            )}
          </button>
          <span className={styles.historyTitle}>{t(copy.history)}</span>
        </div>

        {history.length === 0 ? (
          <p className={styles.historyEmpty}>{t(copy.noHistory)}</p>
        ) : (
          <ul className={styles.historyList}>
            {history.map((item, index) => (
              <li
                key={index}
                className={styles.historyItem}
                onClick={() => handleHistoryItemClick(item)}
              >
                <div className={styles.historyExpression}>
                  {item.expression}
                </div>
                <div className={styles.historyResult}>{item.result}</div>
                <div className={styles.historyTime}>
                  {new Date(item.time).toLocaleTimeString(
                    locale === "he" ? "he-IL" : "en-IL",
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {history.length > 0 && (
          <button
            className={styles.clearHistoryButton}
            onClick={handleClearHistory}
          >
            {t(copy.clearHistory)}
          </button>
        )}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import {
  Calculator as CalculatorIcon,
  ChevronDown,
  Delete,
  History,
  Percent,
} from "lucide-react";
import {
  evaluateExpression,
  getCalculatorKeyboardAction,
  applyVatRate,
  removeVatRate,
  CalculatorError,
} from "@/lib/calculator";
import { useManagementTools } from "../management-tool-provider";
import { useConfirmDialog } from "../../ui/use-confirm-dialog";
import { calculatorCopy as copy } from "./calculator-copy";
import styles from "./calculator-window.module.css";

interface CalculatorWindowProps {
  locale: "he" | "en";
  userId: string;
}

export function CalculatorWindow({ locale, userId }: CalculatorWindowProps) {
  const t = (map: Record<"he" | "en", string>) => map[locale];
  const { saveDraft, clearDraft } = useManagementTools();
  // Themed, accessible replacement for the clear-history confirm().
  const { confirm, dialogNode } = useConfirmDialog();

  const [display, setDisplay] = useState("0");
  const [pendingInput, setPendingInput] = useState(false);
  const [vatRate, setVatRate] = useState<number | null>(null);
  const [history, setHistory] = useState<
    Array<{ time: string; expression: string; result: string }>
  >([]);
  const [historyStatus, setHistoryStatus] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [historyMutationError, setHistoryMutationError] = useState<
    "save" | "clear" | null
  >(null);
  const [historyReloadKey, setHistoryReloadKey] = useState(0);
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
        if (!res.ok) throw new Error("History unavailable");
        const data = await res.json();
        // API returns { history: [...] } - map to local history shape
        const records = Array.isArray(data.history) ? data.history : [];
        setHistory(
          records.map(
            (record: {
              created_at: string;
              expression: string;
              result: number;
            }) => ({
              time: record.created_at,
              expression: record.expression,
              result: String(record.result),
            }),
          ),
        );
        setHistoryStatus("ready");
      })
      .catch(() => {
        if (!controller.signal.aborted) setHistoryStatus("error");
      });
    return () => controller.abort();
  }, [historyReloadKey]);

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
    const target = event.target;
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      (target instanceof HTMLElement && target.isContentEditable)
    ) {
      return;
    }
    if (
      target instanceof HTMLButtonElement &&
      (event.key === "Enter" || event.key === " ")
    ) {
      return;
    }

    const action = getCalculatorKeyboardAction(event.key);
    if (!action) return;
    event.preventDefault();
    if (action.type === "equals") {
      handleEquals();
    } else if (action.type === "backspace") {
      handleBackspace();
    } else {
      handleInput(action.value);
    }
  };

  const handleInput = (input: string) => {
    if (error) {
      setError(null);
      if (/^[\d.]$/.test(input)) {
        setDisplay(input);
        setPendingInput(false);
        return;
      }
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
    if (error) setError(null);

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
      setError(t(copy.vatUnavailable));
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
      setError(t(copy.vatUnavailable));
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
    setHistoryMutationError(null);
    fetch("/api/management/calculator-history", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expression, contextPath: "/management/tools" }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("History save failed");
        const data = await res.json();
        const newRecord = {
          time: new Date().toISOString(),
          expression,
          result: String(data.result),
        };
        setHistory((prev) => [newRecord, ...prev.slice(0, 19)]); // Keep max 20
        setHistoryStatus("ready");
      })
      .catch(() => setHistoryMutationError("save"));
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
    void confirm({
      title: t(copy.clearHistoryConfirm),
      confirmLabel: t({ he: "נקה היסטוריה", en: "Clear history" }),
      cancelLabel: t({ he: "עדיין לא", en: "Not yet" }),
      tone: "danger",
    }).then((proceed) => {
      if (!proceed) return;
      setHistoryMutationError(null);
      fetch("/api/management/calculator-history", {
        method: "DELETE",
      })
        .then((res) => {
          if (!res.ok) throw new Error("History clear failed");
          setHistory([]);
          setHistoryStatus("ready");
        })
        .catch(() => setHistoryMutationError("clear"));
    });
  };

  return (
    <div
      className={styles.container}
      dir={locale === "he" ? "rtl" : "ltr"}
      onKeyDown={handleKeyPress}
    >
      {dialogNode}
      <div className={styles.displayGroup}>
        <div className={styles.displayHeading}>
          <span className={styles.calculatorName}>
            <CalculatorIcon size={17} aria-hidden="true" />
            {t(copy.title)}
          </span>
          {vatRate === null ? null : (
            <span className={styles.vatRateBadge}>
              <Percent size={14} aria-hidden="true" />
              <bdi dir="ltr">{vatRate}%</bdi>
              {t(copy.vatRateLabel)}
            </span>
          )}
        </div>
        <div
          ref={displayRef}
          className={styles.display}
          role="textbox"
          aria-readonly="true"
          tabIndex={0}
          dir="ltr"
        >
          {display}
        </div>
        {error ? (
          <p className={styles.errorMessage} role="alert">
            {error}
          </p>
        ) : null}
        {vatRate === null ? null : (
          <div className={styles.vatNote}>{t(copy.percentNote)}</div>
        )}
      </div>

      <div className={styles.keypad} dir="ltr">
        {/* Row 1: Backspace, Clear, %, / */}
        <button
          type="button"
          className={`${styles.button} ${styles.utilityButton}`}
          onClick={handleBackspace}
          aria-label={t(copy.backspace)}
        >
          <Delete size={19} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={`${styles.button} ${styles.utilityButton}`}
          onClick={handleClear}
          aria-label={t(copy.clear)}
        >
          AC
        </button>
        <button
          type="button"
          className={`${styles.button} ${styles.utilityButton}`}
          onClick={handlePercent}
          aria-label={t(copy.percent)}
        >
          {t(copy.percent)}
        </button>
        <button
          type="button"
          className={`${styles.button} ${styles.operatorButton}`}
          onClick={() => handleInput("/")}
          aria-label={t(copy.divide)}
        >
          ÷
        </button>

        {/* Row 2: 7, 8, 9, * */}
        <button
          type="button"
          className={styles.button}
          onClick={() => handleInput("7")}
        >
          7
        </button>
        <button
          type="button"
          className={styles.button}
          onClick={() => handleInput("8")}
        >
          8
        </button>
        <button
          type="button"
          className={styles.button}
          onClick={() => handleInput("9")}
        >
          9
        </button>
        <button
          type="button"
          className={`${styles.button} ${styles.operatorButton}`}
          onClick={() => handleInput("*")}
          aria-label={t(copy.multiply)}
        >
          ×
        </button>

        {/* Row 3: 4, 5, 6, - */}
        <button
          type="button"
          className={styles.button}
          onClick={() => handleInput("4")}
        >
          4
        </button>
        <button
          type="button"
          className={styles.button}
          onClick={() => handleInput("5")}
        >
          5
        </button>
        <button
          type="button"
          className={styles.button}
          onClick={() => handleInput("6")}
        >
          6
        </button>
        <button
          type="button"
          className={`${styles.button} ${styles.operatorButton}`}
          onClick={() => handleInput("-")}
          aria-label={t(copy.subtract)}
        >
          −
        </button>

        {/* Row 4: 1, 2, 3, + */}
        <button
          type="button"
          className={styles.button}
          onClick={() => handleInput("1")}
        >
          1
        </button>
        <button
          type="button"
          className={styles.button}
          onClick={() => handleInput("2")}
        >
          2
        </button>
        <button
          type="button"
          className={styles.button}
          onClick={() => handleInput("3")}
        >
          3
        </button>
        <button
          type="button"
          className={`${styles.button} ${styles.operatorButton}`}
          onClick={() => handleInput("+")}
          aria-label={t(copy.add)}
        >
          +
        </button>

        {/* Row 5: 0, ., ±, = */}
        <button
          type="button"
          className={styles.button}
          onClick={() => handleInput("0")}
        >
          0
        </button>
        <button
          type="button"
          className={styles.button}
          onClick={() => handleInput(".")}
          aria-label={t(copy.decimal)}
        >
          .
        </button>
        <button
          type="button"
          className={`${styles.button} ${styles.utilityButton}`}
          onClick={handleSign}
          aria-label={t(copy.sign)}
        >
          ±
        </button>
        <button
          type="button"
          className={`${styles.button} ${styles.equalsButton}`}
          onClick={handleEquals}
          aria-label={t(copy.equals)}
        >
          =
        </button>

        {/* Row 6: VAT buttons */}
        <button
          type="button"
          className={`${styles.button} ${styles.vatButton}`}
          onClick={handleVatAdd}
        >
          <Percent size={15} aria-hidden="true" />
          {t(copy.vatAdd)}
        </button>
        <button
          type="button"
          className={`${styles.button} ${styles.vatButton}`}
          onClick={handleVatSubtract}
        >
          <Percent size={15} aria-hidden="true" />
          {t(copy.vatSubtract)}
        </button>
      </div>

      {/* History Panel */}
      <div
        className={`${styles.historyPanel} ${historyOpen ? styles.historyPanelOpen : ""}`}
      >
        <div className={styles.historyHeader}>
          <button
            type="button"
            className={styles.historyToggle}
            onClick={() => setHistoryOpen(!historyOpen)}
            aria-label={t(copy.history)}
            aria-expanded={historyOpen}
            aria-controls="calculator-history-list"
          >
            <History size={16} aria-hidden="true" />
            <ChevronDown
              size={14}
              className={`${styles.historyChevron} ${historyOpen ? styles.historyChevronOpen : ""}`}
              aria-hidden="true"
            />
          </button>
          <span className={styles.historyTitle}>
            <History size={16} aria-hidden="true" />
            {t(copy.history)}
          </span>
        </div>

        {historyStatus === "loading" ? (
          <p className={styles.historyFeedback} role="status">
            {t(copy.historyLoading)}
          </p>
        ) : null}
        {historyStatus === "error" ? (
          <div className={styles.historyErrorState} role="status">
            <p>{t(copy.historyUnavailable)}</p>
            <button
              type="button"
              className={styles.retryHistoryButton}
              onClick={() => {
                setHistoryStatus("loading");
                setHistoryReloadKey((current) => current + 1);
              }}
            >
              {t(copy.retryHistory)}
            </button>
          </div>
        ) : null}
        {historyStatus === "ready" && history.length === 0 ? (
          <p className={styles.historyEmpty}>{t(copy.noHistory)}</p>
        ) : history.length > 0 ? (
          <ul className={styles.historyList} id="calculator-history-list">
            {history.map((item, index) => (
              <li key={index} className={styles.historyItem}>
                <button
                  type="button"
                  className={styles.historyButton}
                  onClick={() => handleHistoryItemClick(item)}
                  aria-label={`${item.expression} = ${item.result}`}
                >
                  <span className={styles.historyExpression}>
                    {item.expression}
                  </span>
                  <span className={styles.historyResult}>{item.result}</span>
                  <time
                    className={styles.historyTime}
                    dateTime={item.time}
                    dir="ltr"
                  >
                    {new Date(item.time).toLocaleTimeString(
                      locale === "he" ? "he-IL" : "en-IL",
                    )}
                  </time>
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {historyMutationError ? (
          <p className={styles.historyMutationError} role="alert">
            {t(
              historyMutationError === "save"
                ? copy.historySaveFailed
                : copy.historyClearFailed,
            )}
          </p>
        ) : null}

        {history.length > 0 && (
          <button
            type="button"
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

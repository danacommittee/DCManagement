"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

type ToastType = "success" | "error";

interface ToastState {
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TOAST_DURATION_MS = 4000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ToastState | null>(null);

  const toast = useCallback((message: string, type: ToastType = "success") => {
    setState({ message, type });
    const t = setTimeout(() => setState(null), TOAST_DURATION_MS);
    return () => clearTimeout(t);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {state && (
        <div
          role="status"
          aria-live="polite"
          className={
            state.type === "error"
              ? "fixed bottom-4 left-4 right-4 z-50 min-h-[44px] rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800 shadow-lg dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200 sm:left-auto sm:right-4 sm:max-w-sm"
              : "fixed bottom-4 left-4 right-4 z-50 min-h-[44px] rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-800 shadow-lg dark:border-green-900/50 dark:bg-green-950/40 dark:text-green-200 sm:left-auto sm:right-4 sm:max-w-sm"
          }
        >
          {state.type === "success" && "✓ "}
          {state.type === "error" && "✕ "}
          {state.message}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

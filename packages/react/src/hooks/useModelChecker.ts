import { useCallback, useRef, useState } from "react";
import type {
  CheckerProgress,
  VerificationResult,
  VisualSpecIR,
} from "@ts-model-checker/core";
import {
  runModelCheckAsync,
  type RunWorkerCheckOptions,
} from "@ts-model-checker/worker";

export interface UseModelCheckerReturn {
  readonly isRunning: boolean;
  readonly progress: CheckerProgress | null;
  readonly result: VerificationResult | null;
  readonly error: string | null;
  readonly verify: (
    spec: VisualSpecIR,
    options?: Omit<RunWorkerCheckOptions, "onProgress" | "signal">
  ) => Promise<VerificationResult | null>;
  readonly cancel: () => void;
  readonly reset: () => void;
}

/**
 * React hook for running formal model checking asynchronously (via Web Worker when configured)
 * with live progress updates and cancellation support.
 */
export function useModelChecker(
  defaultCreateWorker?: () => Worker
): UseModelCheckerReturn {
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<CheckerProgress | null>(null);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsRunning(false);
  }, []);

  const reset = useCallback(() => {
    cancel();
    setProgress(null);
    setResult(null);
    setError(null);
  }, [cancel]);

  const verify = useCallback(
    async (
      spec: VisualSpecIR,
      options: Omit<RunWorkerCheckOptions, "onProgress" | "signal"> = {}
    ): Promise<VerificationResult | null> => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setIsRunning(true);
      setProgress(null);
      setError(null);

      try {
        const res = await runModelCheckAsync(spec, {
          ...options,
          createWorker: options.createWorker ?? defaultCreateWorker,
          signal: controller.signal,
          onProgress: (p) => setProgress(p),
        });
        if (!controller.signal.aborted) {
          setResult(res);
          setIsRunning(false);
        }
        return res;
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : String(err));
          setIsRunning(false);
        }
        return null;
      }
    },
    [defaultCreateWorker]
  );

  return {
    isRunning,
    progress,
    result,
    error,
    verify,
    cancel,
    reset,
  };
}

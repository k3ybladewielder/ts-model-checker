import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  Repeat,
  SkipBack,
  SkipForward,
} from "lucide-react";
import type { TraceStep } from "@ts-model-checker/core";

export interface TracePlayerProps {
  readonly title: string;
  readonly steps: readonly TraceStep[];
  /** Index where an infinite Lasso cycle begins (for Liveness violations). */
  readonly cycleStartIndex?: number;
  readonly activeStepIndex: number;
  readonly onStepChange: (index: number) => void;
}

export function TracePlayer({
  title,
  steps,
  cycleStartIndex,
  activeStepIndex,
  onStepChange,
}: TracePlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    if (!isPlaying || steps.length === 0) return;
    const timer = setInterval(() => {
      onStepChange(
        activeStepIndex + 1 >= steps.length
          ? cycleStartIndex ?? 0
          : activeStepIndex + 1
      );
    }, 900);
    return () => clearInterval(timer);
  }, [isPlaying, activeStepIndex, steps.length, cycleStartIndex, onStepChange]);

  if (steps.length === 0) return null;

  const clampedIndex = Math.min(Math.max(0, activeStepIndex), steps.length - 1);
  const currentStep = steps[clampedIndex];
  const prevStep = clampedIndex > 0 ? steps[clampedIndex - 1] : null;
  const varNames = Object.keys(currentStep.state).sort();

  return (
    <div className="tsmc-panel">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <span
          className="tsmc-badge tsmc-badge-danger"
          style={{ fontSize: 12, padding: "4px 10px" }}
        >
          <AlertTriangle size={14} /> {title}
        </span>
        <span style={{ fontSize: 12, color: "var(--tsmc-text-muted)" }}>
          Step {clampedIndex + 1} of {steps.length}
        </span>
      </div>

      {/* Controls */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <button
          type="button"
          className="tsmc-btn tsmc-btn-sm"
          onClick={() => {
            setIsPlaying(false);
            onStepChange(0);
          }}
          disabled={clampedIndex === 0}
          title="Start"
        >
          <SkipBack size={14} />
        </button>
        <button
          type="button"
          className="tsmc-btn tsmc-btn-sm"
          onClick={() => {
            setIsPlaying(false);
            onStepChange(Math.max(0, clampedIndex - 1));
          }}
          disabled={clampedIndex === 0}
          title="Previous Step"
        >
          <ChevronLeft size={14} />
        </button>
        <button
          type="button"
          className="tsmc-btn tsmc-btn-sm tsmc-btn-primary"
          onClick={() => setIsPlaying((p) => !p)}
        >
          {isPlaying ? <Pause size={14} /> : <Play size={14} />}
          {isPlaying ? "Pause" : "Play"}
        </button>
        <button
          type="button"
          className="tsmc-btn tsmc-btn-sm"
          onClick={() => {
            setIsPlaying(false);
            onStepChange(Math.min(steps.length - 1, clampedIndex + 1));
          }}
          disabled={clampedIndex === steps.length - 1}
          title="Next Step"
        >
          <ChevronRight size={14} />
        </button>
        <button
          type="button"
          className="tsmc-btn tsmc-btn-sm"
          onClick={() => {
            setIsPlaying(false);
            onStepChange(steps.length - 1);
          }}
          disabled={clampedIndex === steps.length - 1}
          title="Last Step"
        >
          <SkipForward size={14} />
        </button>
      </div>

      {/* Step Timeline */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {steps.map((s, idx) => {
          const inCycle =
            cycleStartIndex !== undefined && idx >= cycleStartIndex;
          const isCurrent = idx === clampedIndex;
          return (
            <button
              key={idx}
              type="button"
              className={`tsmc-btn tsmc-btn-sm ${
                isCurrent ? "tsmc-btn-primary" : ""
              }`}
              onClick={() => {
                setIsPlaying(false);
                onStepChange(idx);
              }}
            >
              {inCycle && <Repeat size={11} />}
              {idx}. {s.actionName}
            </button>
          );
        })}
      </div>

      {/* Variable Diff Table */}
      <table className="tsmc-diff-table">
        <thead>
          <tr>
            <th>Variable</th>
            <th>Previous</th>
            <th>Current ({currentStep.actionName})</th>
          </tr>
        </thead>
        <tbody>
          {varNames.map((v) => {
            const prevVal = prevStep ? prevStep.state[v] : undefined;
            const currVal = currentStep.state[v];
            const changed =
              prevStep !== null &&
              JSON.stringify(prevVal) !== JSON.stringify(currVal);

            return (
              <tr key={v} className={changed ? "tsmc-diff-changed" : ""}>
                <td>{v}</td>
                <td style={{ color: "var(--tsmc-text-muted)" }}>
                  {prevStep ? JSON.stringify(prevVal) : "—"}
                </td>
                <td>{JSON.stringify(currVal)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

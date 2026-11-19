import { useMemo, useState } from "react";
import {
  CheckCircle2,
  Code2,
  FilePlus2,
  Play,
  RotateCcw,
  Square,
  Upload,
  XCircle,
} from "lucide-react";
import {
  createBlankSpec,
  PRESET_CATALOG,
  type TraceStep,
  type VisualSpecIR,
} from "@ts-model-checker/core";
import {
  FormalCanvas,
  ImportModal,
  PropertiesPanel,
  TlaExportModal,
  TracePlayer,
  useModelChecker,
} from "@ts-model-checker/react";

const createCheckerWorker = () =>
  new Worker(new URL("@ts-model-checker/worker/worker", import.meta.url), {
    type: "module",
  });

export function App() {
  const [selectedPresetId, setSelectedPresetId] = useState(PRESET_CATALOG[0].id);
  const [spec, setSpec] = useState<VisualSpecIR>(PRESET_CATALOG[0].spec);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [showTlaModal, setShowTlaModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const { isRunning, progress, result, error, verify, cancel, reset } =
    useModelChecker(createCheckerWorker);

  const handleSelectPreset = (presetId: string) => {
    if (presetId === "__blank__") {
      setSelectedPresetId("__blank__");
      setSpec(createBlankSpec("MySystem"));
      setActiveStepIndex(0);
      reset();
      return;
    }
    const found = PRESET_CATALOG.find((p) => p.id === presetId);
    if (!found) return;
    setSelectedPresetId(presetId);
    setSpec(found.spec);
    setActiveStepIndex(0);
    reset();
  };

  const handleCreateBlank = () => {
    handleSelectPreset("__blank__");
  };

  const handleRunVerify = async () => {
    setActiveStepIndex(0);
    await verify(spec, { maxStates: 50_000 });
  };

  const traceInfo = useMemo<{
    title: string;
    steps: readonly TraceStep[];
    cycleStartIndex?: number;
  } | null>(() => {
    if (!result) return null;
    if (result.status === "INVARIANT_VIOLATED") {
      return {
        title: `Invariant Violated: ${result.violatedInvariant.description}`,
        steps: result.counterexample,
      };
    }
    if (result.status === "DEADLOCK") {
      return {
        title: "Deadlock Detected (no enabled actions)",
        steps: result.counterexample,
      };
    }
    if (result.status === "LIVENESS_VIOLATED") {
      const { prefix, cycle, violatedProperty } = result.violation;
      return {
        title: `Liveness Violated: ${violatedProperty.description}`,
        steps: [...prefix, ...cycle],
        cycleStartIndex: prefix.length,
      };
    }
    return null;
  }, [result]);

  const activeTraceStep =
    traceInfo && traceInfo.steps[activeStepIndex]
      ? traceInfo.steps[activeStepIndex]
      : null;

  const isLastViolationStep =
    traceInfo !== null && activeStepIndex === traceInfo.steps.length - 1;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        fontFamily: "var(--tsmc-font)",
        color: "var(--tsmc-text)",
      }}
    >
      {/* Top Bar */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 18px",
          background: "#ffffff",
          borderBottom: "1px solid var(--tsmc-border)",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <strong style={{ fontSize: 16 }}>ts-model-checker</strong>
          <select
            className="tsmc-select"
            value={selectedPresetId}
            onChange={(e) => handleSelectPreset(e.target.value)}
          >
            <option value="__blank__">Blank System (Start from Scratch)</option>
            {PRESET_CATALOG.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="tsmc-btn"
            onClick={handleCreateBlank}
            title="Start a new blank system from scratch"
          >
            <FilePlus2 size={15} /> New Blank
          </button>
          <input
            className="tsmc-input"
            style={{ width: 160 }}
            value={spec.moduleName}
            onChange={(e) => setSpec({ ...spec, moduleName: e.target.value })}
            placeholder="Module name"
            title="Specification module name"
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            type="button"
            className="tsmc-btn"
            onClick={() => setShowImportModal(true)}
          >
            <Upload size={15} /> Import
          </button>

          <button
            type="button"
            className="tsmc-btn"
            onClick={() => setShowTlaModal(true)}
          >
            <Code2 size={15} /> Export TLA+ / JSON
          </button>

          {isRunning ? (
            <button
              type="button"
              className="tsmc-btn tsmc-btn-danger"
              onClick={cancel}
            >
              <Square size={14} /> Cancel
            </button>
          ) : (
            <button
              type="button"
              className="tsmc-btn tsmc-btn-primary"
              onClick={handleRunVerify}
            >
              <Play size={14} /> Verify Model
            </button>
          )}

          {result && (
            <button
              type="button"
              className="tsmc-btn"
              onClick={() => {
                setActiveStepIndex(0);
                reset();
              }}
              title="Clear result"
            >
              <RotateCcw size={14} />
            </button>
          )}
        </div>
      </header>

      {/* Main Split View */}
      <main
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 420px",
          gap: 14,
          padding: 14,
          flex: 1,
          minHeight: 0,
        }}
      >
        <FormalCanvas
          spec={spec}
          onChange={(next) => {
            setSpec(next);
          }}
          activeActionName={activeTraceStep?.actionName ?? null}
          isViolationStep={isLastViolationStep}
        />

        <aside
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            overflowY: "auto",
            paddingRight: 2,
          }}
        >
          {/* Verification Status Card */}
          {isRunning && (
            <div className="tsmc-panel">
              <span className="tsmc-badge tsmc-badge-info">
                Exploring state space...
              </span>
              {progress && (
                <div style={{ fontSize: 12, color: "var(--tsmc-text-muted)" }}>
                  States explored: {progress.statesExplored} | Transitions:{" "}
                  {progress.transitionsEvaluated}
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="tsmc-panel">
              <span className="tsmc-badge tsmc-badge-danger">
                <XCircle size={14} /> Error: {error}
              </span>
            </div>
          )}

          {result?.status === "PASSED" && (
            <div className="tsmc-panel">
              <span className="tsmc-badge tsmc-badge-success">
                <CheckCircle2 size={14} /> Verification Passed (PASSED)
              </span>
              <div style={{ fontSize: 12, color: "var(--tsmc-text-muted)" }}>
                {result.statesExplored} reachable states verified,{" "}
                {result.transitionsEvaluated} transitions evaluated in{" "}
                {result.durationMs}ms.
              </div>
            </div>
          )}

          {result?.status === "VALIDATION_ERROR" && (
            <div className="tsmc-panel">
              <span className="tsmc-badge tsmc-badge-danger">
                <XCircle size={14} /> Static Validation Errors
              </span>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
                {result.issues.map((issue, idx) => (
                  <li key={idx}>
                    <strong>[{issue.location}]</strong> {issue.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Counterexample Time-Travel Player */}
          {traceInfo && (
            <TracePlayer
              title={traceInfo.title}
              steps={traceInfo.steps}
              cycleStartIndex={traceInfo.cycleStartIndex}
              activeStepIndex={activeStepIndex}
              onStepChange={setActiveStepIndex}
            />
          )}

          {/* Safety & Liveness Properties */}
          <PropertiesPanel spec={spec} onChange={setSpec} />
        </aside>
      </main>

      {showTlaModal && (
        <TlaExportModal spec={spec} onClose={() => setShowTlaModal(false)} />
      )}

      {showImportModal && (
        <ImportModal
          onImport={(importedSpec) => {
            setSelectedPresetId("__blank__");
            setSpec(importedSpec);
            setActiveStepIndex(0);
            reset();
          }}
          onClose={() => setShowImportModal(false)}
        />
      )}
    </div>
  );
}

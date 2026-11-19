import { useState, type ChangeEvent } from "react";
import { AlertTriangle, FileUp, Upload, X } from "lucide-react";
import {
  hasValidationErrors,
  parseJsonToSpec,
  parseTlaToSpec,
  type VisualSpecIR,
} from "@ts-model-checker/core";

export interface ImportModalProps {
  readonly onImport: (spec: VisualSpecIR) => void;
  readonly onClose: () => void;
}

export function ImportModal({ onImport, onClose }: ImportModalProps) {
  const [tab, setTab] = useState<"tla" | "json">("tla");
  const [tlaText, setTlaText] = useState("");
  const [cfgText, setCfgText] = useState("");
  const [jsonText, setJsonText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<readonly string[]>([]);

  const handleFileUpload = (
    e: ChangeEvent<HTMLInputElement>,
    setter: (val: string) => void
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setter(reader.result);
      }
    };
    reader.readAsText(file);
  };

  const handleImport = () => {
    setError(null);
    setWarnings([]);

    try {
      if (tab === "tla") {
        if (!tlaText.trim()) {
          setError("Please paste or upload a .tla module first.");
          return;
        }
        const res = parseTlaToSpec(tlaText, {
          cfgContent: cfgText.trim() ? cfgText : undefined,
        });
        if (res.warnings.length > 0) {
          setWarnings(res.warnings);
        }
        onImport(res.spec);
        onClose();
      } else {
        if (!jsonText.trim()) {
          setError("Please paste or upload a VisualSpecIR JSON file first.");
          return;
        }
        const res = parseJsonToSpec(jsonText);
        if (hasValidationErrors(res.issues)) {
          setError(
            res.issues
              .filter((i) => i.severity === "error")
              .map((i) => `[${i.location}] ${i.message}`)
              .join("; ")
          );
          return;
        }
        onImport(res.spec);
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="tsmc-modal-backdrop" onClick={onClose}>
      <div className="tsmc-modal" onClick={(e) => e.stopPropagation()}>
        <div className="tsmc-modal-header">
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <Upload size={16} /> Import Model (TLA+ or JSON)
          </span>
          <button type="button" className="tsmc-btn tsmc-btn-sm" onClick={onClose}>
            <X size={14} />
          </button>
        </div>

        <div className="tsmc-modal-body">
          <div style={{ display: "flex", gap: 6 }}>
            <button
              type="button"
              className={`tsmc-btn tsmc-btn-sm ${
                tab === "tla" ? "tsmc-btn-primary" : ""
              }`}
              onClick={() => {
                setTab("tla");
                setError(null);
              }}
            >
              TLA+ (.tla / .cfg)
            </button>
            <button
              type="button"
              className={`tsmc-btn tsmc-btn-sm ${
                tab === "json" ? "tsmc-btn-primary" : ""
              }`}
              onClick={() => {
                setTab("json");
                setError(null);
              }}
            >
              JSON (VisualSpecIR)
            </button>
          </div>

          {tab === "tla" ? (
            <>
              <div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 4,
                  }}
                >
                  <span className="tsmc-section-label">TLA+ Module (.tla)</span>
                  <label className="tsmc-btn tsmc-btn-sm" style={{ cursor: "pointer" }}>
                    <FileUp size={12} /> Upload .tla
                    <input
                      type="file"
                      accept=".tla,text/plain"
                      style={{ display: "none" }}
                      onChange={(e) => handleFileUpload(e, setTlaText)}
                    />
                  </label>
                </div>
                <textarea
                  className="tsmc-input"
                  style={{
                    width: "100%",
                    minHeight: 170,
                    fontFamily: "var(--tsmc-mono)",
                    fontSize: 12,
                    boxSizing: "border-box",
                  }}
                  placeholder="---- MODULE MyModel ----&#10;VARIABLES x&#10;Init == x = 0&#10;..."
                  value={tlaText}
                  onChange={(e) => setTlaText(e.target.value)}
                />
              </div>

              <div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 4,
                  }}
                >
                  <span className="tsmc-section-label">
                    TLC Config (.cfg — Optional)
                  </span>
                  <label className="tsmc-btn tsmc-btn-sm" style={{ cursor: "pointer" }}>
                    <FileUp size={12} /> Upload .cfg
                    <input
                      type="file"
                      accept=".cfg,text/plain"
                      style={{ display: "none" }}
                      onChange={(e) => handleFileUpload(e, setCfgText)}
                    />
                  </label>
                </div>
                <textarea
                  className="tsmc-input"
                  style={{
                    width: "100%",
                    minHeight: 80,
                    fontFamily: "var(--tsmc-mono)",
                    fontSize: 12,
                    boxSizing: "border-box",
                  }}
                  placeholder="SPECIFICATION Spec&#10;INVARIANT Inv_1"
                  value={cfgText}
                  onChange={(e) => setCfgText(e.target.value)}
                />
              </div>
            </>
          ) : (
            <div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 4,
                }}
              >
                <span className="tsmc-section-label">VisualSpecIR JSON</span>
                <label className="tsmc-btn tsmc-btn-sm" style={{ cursor: "pointer" }}>
                  <FileUp size={12} /> Upload .json
                  <input
                    type="file"
                    accept=".json,application/json"
                    style={{ display: "none" }}
                    onChange={(e) => handleFileUpload(e, setJsonText)}
                  />
                </label>
              </div>
              <textarea
                className="tsmc-input"
                style={{
                  width: "100%",
                  minHeight: 240,
                  fontFamily: "var(--tsmc-mono)",
                  fontSize: 12,
                  boxSizing: "border-box",
                }}
                placeholder='{ "schemaVersion": 1, "moduleName": "MyModel", ... }'
                value={jsonText}
                onChange={(e) => setJsonText(e.target.value)}
              />
            </div>
          )}

          {error && (
            <div className="tsmc-badge tsmc-badge-danger" style={{ borderRadius: 6, padding: "8px 10px" }}>
              <AlertTriangle size={14} /> {error}
            </div>
          )}

          {warnings.length > 0 && (
            <div className="tsmc-badge tsmc-badge-warning" style={{ borderRadius: 6, padding: "8px 10px" }}>
              {warnings.join(" | ")}
            </div>
          )}
        </div>

        <div className="tsmc-modal-footer">
          <button type="button" className="tsmc-btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="tsmc-btn tsmc-btn-primary"
            onClick={handleImport}
          >
            Import into Canvas
          </button>
        </div>
      </div>
    </div>
  );
}

import { useMemo, useState } from "react";
import { Check, Copy, Download, X } from "lucide-react";
import { transpileToTla, type VisualSpecIR } from "@ts-model-checker/core";

export interface TlaExportModalProps {
  readonly spec: VisualSpecIR;
  readonly onClose: () => void;
}

export function TlaExportModal({ spec, onClose }: TlaExportModalProps) {
  const [activeTab, setActiveTab] = useState<"tla" | "cfg" | "json">("tla");
  const [copied, setCopied] = useState(false);

  const output = useMemo(() => {
    try {
      return { ok: true as const, files: transpileToTla(spec) };
    } catch (err) {
      return {
        ok: false as const,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }, [spec]);

  const jsonContent = useMemo(() => JSON.stringify(spec, null, 2), [spec]);

  const content =
    activeTab === "json"
      ? jsonContent
      : output.ok
        ? activeTab === "tla"
          ? output.files.tlaFileContent
          : output.files.cfgFileContent
        : output.error;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleDownload = (filename: string, text: string) => {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="tsmc-modal-backdrop" onClick={onClose}>
      <div className="tsmc-modal" onClick={(e) => e.stopPropagation()}>
        <div className="tsmc-modal-header">
          <span>Export TLA+ Specification ({spec.moduleName})</span>
          <button type="button" className="tsmc-btn tsmc-btn-sm" onClick={onClose}>
            <X size={14} />
          </button>
        </div>

        <div className="tsmc-modal-body">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                type="button"
                className={`tsmc-btn tsmc-btn-sm ${
                  activeTab === "tla" ? "tsmc-btn-primary" : ""
                }`}
                onClick={() => setActiveTab("tla")}
              >
                {spec.moduleName}.tla
              </button>
              <button
                type="button"
                className={`tsmc-btn tsmc-btn-sm ${
                  activeTab === "cfg" ? "tsmc-btn-primary" : ""
                }`}
                onClick={() => setActiveTab("cfg")}
              >
                {spec.moduleName}.cfg
              </button>
              <button
                type="button"
                className={`tsmc-btn tsmc-btn-sm ${
                  activeTab === "json" ? "tsmc-btn-primary" : ""
                }`}
                onClick={() => setActiveTab("json")}
              >
                {spec.moduleName}.json
              </button>
            </div>

            {(output.ok || activeTab === "json") && (
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  type="button"
                  className="tsmc-btn tsmc-btn-sm"
                  onClick={handleCopy}
                >
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                  {copied ? "Copied" : "Copy"}
                </button>
                <button
                  type="button"
                  className="tsmc-btn tsmc-btn-sm"
                  onClick={() =>
                    handleDownload(
                      activeTab === "tla"
                        ? `${spec.moduleName}.tla`
                        : activeTab === "cfg"
                          ? `${spec.moduleName}.cfg`
                          : `${spec.moduleName}.json`,
                      content
                    )
                  }
                >
                  <Download size={12} /> Download
                </button>
              </div>
            )}
          </div>

          <pre
            style={{
              margin: 0,
              padding: 12,
              borderRadius: 8,
              background: "#0f172a",
              color: "#e2e8f0",
              fontFamily: "var(--tsmc-mono)",
              fontSize: 12,
              overflow: "auto",
              maxHeight: 420,
            }}
          >
            {content}
          </pre>
        </div>
      </div>
    </div>
  );
}

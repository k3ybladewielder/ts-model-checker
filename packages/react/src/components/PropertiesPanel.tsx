import { useState } from "react";
import { Plus, Shield, Sparkles, Trash2 } from "lucide-react";
import type {
  VisualInvariantIR,
  VisualLivenessIR,
  VisualSpecIR,
} from "@ts-model-checker/core";
import { formatExpr } from "../utils/formatExpr";
import { ExprBuilder } from "./ExprBuilder";

export interface PropertiesPanelProps {
  readonly spec: VisualSpecIR;
  readonly onChange: (nextSpec: VisualSpecIR) => void;
}

export function PropertiesPanel({ spec, onChange }: PropertiesPanelProps) {
  const [editingInvId, setEditingInvId] = useState<string | null>(null);
  const [editingLiveId, setEditingLiveId] = useState<string | null>(null);

  const firstVar = spec.variables[0]?.name ?? "x";

  const addInvariant = () => {
    const id = `inv_${Date.now()}`;
    const newInv: VisualInvariantIR = {
      id,
      description: `Ensure property holds on ${firstVar}`,
      predicate: {
        kind: "BinaryOp",
        op: ">=",
        left: { kind: "Var", name: firstVar },
        right: { kind: "Literal", value: 0 },
      },
    };
    onChange({ ...spec, invariants: [...spec.invariants, newInv] });
    setEditingInvId(id);
  };

  const addLiveness = (kind: "EVENTUALLY" | "LEADS_TO") => {
    const id = `live_${Date.now()}`;
    const newLive: VisualLivenessIR =
      kind === "EVENTUALLY"
        ? {
            id,
            kind: "EVENTUALLY",
            description: `Eventually ${firstVar} satisfies condition`,
            eventually: {
              kind: "BinaryOp",
              op: "==",
              left: { kind: "Var", name: firstVar },
              right: { kind: "Literal", value: 0 },
            },
          }
        : {
            id,
            kind: "LEADS_TO",
            description: `Whenever condition P holds, Q eventually holds`,
            trigger: { kind: "Literal", value: true },
            response: { kind: "Literal", value: true },
          };

    onChange({
      ...spec,
      livenessProperties: [...spec.livenessProperties, newLive],
    });
    setEditingLiveId(id);
  };

  return (
    <div className="tsmc-panel">
      {/* Safety Invariants */}
      <div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 8,
          }}
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontWeight: 600,
              fontSize: 13,
            }}
          >
            <Shield size={15} color="#2563eb" /> Safety Invariants (□P)
          </span>
          <button type="button" className="tsmc-btn tsmc-btn-sm" onClick={addInvariant}>
            <Plus size={12} /> Add
          </button>
        </div>

        {spec.invariants.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--tsmc-text-muted)" }}>
            No invariants defined. Add rules that must hold in every reachable state.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {spec.invariants.map((inv) => {
              const isEditing = editingInvId === inv.id;
              return (
                <div
                  key={inv.id}
                  style={{
                    border: "1px solid var(--tsmc-border)",
                    borderRadius: 8,
                    padding: 8,
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <strong style={{ fontSize: 12 }}>{inv.description}</strong>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button
                        type="button"
                        className="tsmc-btn tsmc-btn-sm"
                        onClick={() =>
                          setEditingInvId(isEditing ? null : inv.id)
                        }
                      >
                        {isEditing ? "Close" : "Edit"}
                      </button>
                      <button
                        type="button"
                        className="tsmc-btn tsmc-btn-sm tsmc-btn-danger"
                        onClick={() =>
                          onChange({
                            ...spec,
                            invariants: spec.invariants.filter(
                              (i) => i.id !== inv.id
                            ),
                          })
                        }
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>

                  <div className="tsmc-code-chip">{formatExpr(inv.predicate)}</div>

                  {isEditing && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
                      <input
                        className="tsmc-input"
                        value={inv.description}
                        onChange={(e) =>
                          onChange({
                            ...spec,
                            invariants: spec.invariants.map((i) =>
                              i.id === inv.id
                                ? { ...i, description: e.target.value }
                                : i
                            ),
                          })
                        }
                      />
                      <ExprBuilder
                        value={inv.predicate}
                        variables={spec.variables}
                        onChange={(predicate) =>
                          onChange({
                            ...spec,
                            invariants: spec.invariants.map((i) =>
                              i.id === inv.id ? { ...i, predicate } : i
                            ),
                          })
                        }
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Temporal Liveness */}
      <div style={{ borderTop: "1px solid var(--tsmc-border)", paddingTop: 10 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 8,
            gap: 6,
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontWeight: 600,
              fontSize: 13,
            }}
          >
            <Sparkles size={15} color="#7c3aed" /> Temporal Properties (Liveness)
          </span>
          <div style={{ display: "flex", gap: 4 }}>
            <button
              type="button"
              className="tsmc-btn tsmc-btn-sm"
              onClick={() => addLiveness("EVENTUALLY")}
            >
              + ◇ Eventually
            </button>
            <button
              type="button"
              className="tsmc-btn tsmc-btn-sm"
              onClick={() => addLiveness("LEADS_TO")}
            >
              + P ⇝ Q
            </button>
          </div>
        </div>

        {spec.livenessProperties.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--tsmc-text-muted)" }}>
            No liveness properties configured.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {spec.livenessProperties.map((live) => {
              const isEditing = editingLiveId === live.id;
              return (
                <div
                  key={live.id}
                  style={{
                    border: "1px solid var(--tsmc-border)",
                    borderRadius: 8,
                    padding: 8,
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <strong style={{ fontSize: 12 }}>
                      [{live.kind === "EVENTUALLY" ? "◇" : "⇝"}] {live.description}
                    </strong>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button
                        type="button"
                        className="tsmc-btn tsmc-btn-sm"
                        onClick={() =>
                          setEditingLiveId(isEditing ? null : live.id)
                        }
                      >
                        {isEditing ? "Close" : "Edit"}
                      </button>
                      <button
                        type="button"
                        className="tsmc-btn tsmc-btn-sm tsmc-btn-danger"
                        onClick={() =>
                          onChange({
                            ...spec,
                            livenessProperties: spec.livenessProperties.filter(
                              (l) => l.id !== live.id
                            ),
                          })
                        }
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>

                  <div className="tsmc-code-chip">
                    {live.kind === "EVENTUALLY"
                      ? `◇ (${formatExpr(live.eventually)})`
                      : `(${formatExpr(live.trigger)}) ⇝ (${formatExpr(live.response)})`}
                  </div>

                  {isEditing && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
                      <input
                        className="tsmc-input"
                        value={live.description}
                        onChange={(e) =>
                          onChange({
                            ...spec,
                            livenessProperties: spec.livenessProperties.map((l) =>
                              l.id === live.id
                                ? { ...l, description: e.target.value }
                                : l
                            ),
                          })
                        }
                      />
                      {live.kind === "EVENTUALLY" ? (
                        <ExprBuilder
                          value={live.eventually}
                          variables={spec.variables}
                          onChange={(eventually) =>
                            onChange({
                              ...spec,
                              livenessProperties: spec.livenessProperties.map((l) =>
                                l.id === live.id && l.kind === "EVENTUALLY"
                                  ? { ...l, eventually }
                                  : l
                              ),
                            })
                          }
                        />
                      ) : (
                        <>
                          <span className="tsmc-section-label">When (P):</span>
                          <ExprBuilder
                            value={live.trigger}
                            variables={spec.variables}
                            onChange={(trigger) =>
                              onChange({
                                ...spec,
                                livenessProperties: spec.livenessProperties.map((l) =>
                                  l.id === live.id && l.kind === "LEADS_TO"
                                    ? { ...l, trigger }
                                    : l
                                ),
                              })
                            }
                          />
                          <span className="tsmc-section-label">Eventually (Q):</span>
                          <ExprBuilder
                            value={live.response}
                            variables={spec.variables}
                            onChange={(response) =>
                              onChange({
                                ...spec,
                                livenessProperties: spec.livenessProperties.map((l) =>
                                  l.id === live.id && l.kind === "LEADS_TO"
                                    ? { ...l, response }
                                    : l
                                ),
                              })
                            }
                          />
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

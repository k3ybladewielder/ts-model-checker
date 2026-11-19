import { useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import type {
  EffectAssignment,
  VarDecl,
  VisualActionIR,
} from "@ts-model-checker/core";
import { ExprBuilder } from "./ExprBuilder";

export interface ActionEditorModalProps {
  readonly action: VisualActionIR;
  readonly variables: readonly VarDecl[];
  readonly onSave: (updated: VisualActionIR) => void;
  readonly onDelete?: (actionId: string) => void;
  readonly onClose: () => void;
}

export function ActionEditorModal({
  action,
  variables,
  onSave,
  onDelete,
  onClose,
}: ActionEditorModalProps) {
  const [draft, setDraft] = useState<VisualActionIR>(action);

  const handleAddEffect = () => {
    const unusedVar =
      variables.find((v) => !draft.effects.some((e) => e.targetVar === v.name))
        ?.name ??
      variables[0]?.name ??
      "x";

    const nextEffect: EffectAssignment = {
      targetVar: unusedVar,
      expression: { kind: "Literal", value: 0 },
    };
    setDraft({ ...draft, effects: [...draft.effects, nextEffect] });
  };

  const handleRemoveEffect = (index: number) => {
    setDraft({
      ...draft,
      effects: draft.effects.filter((_, idx) => idx !== index),
    });
  };

  return (
    <div className="tsmc-modal-backdrop" onClick={onClose}>
      <div className="tsmc-modal" onClick={(e) => e.stopPropagation()}>
        <div className="tsmc-modal-header">
          <span>Edit Action: {draft.name}</span>
          <button type="button" className="tsmc-btn tsmc-btn-sm" onClick={onClose}>
            <X size={14} />
          </button>
        </div>

        <div className="tsmc-modal-body">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span className="tsmc-section-label">Action Name</span>
              <input
                className="tsmc-input"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span className="tsmc-section-label">Description (Optional)</span>
              <input
                className="tsmc-input"
                value={draft.description ?? ""}
                onChange={(e) =>
                  setDraft({ ...draft, description: e.target.value })
                }
              />
            </label>
          </div>

          <div>
            <div className="tsmc-section-label">When it can run (Guard)</div>
            <ExprBuilder
              value={draft.guard}
              variables={variables}
              onChange={(guard) => setDraft({ ...draft, guard })}
            />
          </div>

          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 6,
              }}
            >
              <span className="tsmc-section-label">
                Next-state changes (Effects)
              </span>
              <button
                type="button"
                className="tsmc-btn tsmc-btn-sm"
                onClick={handleAddEffect}
                disabled={variables.length === 0}
              >
                <Plus size={12} /> Add Effect
              </button>
            </div>

            {draft.effects.length === 0 ? (
              <div style={{ fontSize: 12, color: "var(--tsmc-text-muted)" }}>
                No effects defined — all variables remain UNCHANGED.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {draft.effects.map((eff, idx) => (
                  <div
                    key={idx}
                    style={{
                      border: "1px solid var(--tsmc-border)",
                      borderRadius: 8,
                      padding: 10,
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <strong style={{ fontSize: 13 }}>Next value of:</strong>
                        <select
                          className="tsmc-select"
                          value={eff.targetVar}
                          onChange={(e) => {
                            const updated = [...draft.effects];
                            updated[idx] = { ...eff, targetVar: e.target.value };
                            setDraft({ ...draft, effects: updated });
                          }}
                        >
                          {variables.map((v) => (
                            <option key={v.name} value={v.name}>
                              {v.name}&apos;
                            </option>
                          ))}
                        </select>
                      </div>

                      <button
                        type="button"
                        className="tsmc-btn tsmc-btn-sm tsmc-btn-danger"
                        onClick={() => handleRemoveEffect(idx)}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>

                    <ExprBuilder
                      value={eff.expression}
                      variables={variables}
                      onChange={(expression) => {
                        const updated = [...draft.effects];
                        updated[idx] = { ...eff, expression };
                        setDraft({ ...draft, effects: updated });
                      }}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="tsmc-modal-footer" style={{ justifyContent: "space-between" }}>
          <div>
            {onDelete && (
              <button
                type="button"
                className="tsmc-btn tsmc-btn-danger"
                onClick={() => {
                  onDelete(draft.id);
                  onClose();
                }}
              >
                <Trash2 size={14} /> Delete Action
              </button>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="tsmc-btn" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="tsmc-btn tsmc-btn-primary"
              onClick={() => {
                onSave(draft);
                onClose();
              }}
            >
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

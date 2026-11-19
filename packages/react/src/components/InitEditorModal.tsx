import { useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import type { State, StateValue, VarDecl, VarType } from "@ts-model-checker/core";

export interface InitEditorModalProps {
  readonly variables: readonly VarDecl[];
  readonly initialState: State;
  readonly onSave: (variables: readonly VarDecl[], initialState: State) => void;
  readonly onClose: () => void;
}

function defaultForType(type: VarType): StateValue {
  switch (type) {
    case "number":
      return 0;
    case "boolean":
      return false;
    case "string":
      return "IDLE";
    case "set":
      return [];
    case "record":
      return {};
  }
}

function parseValue(raw: string, type: VarType): StateValue {
  if (type === "number") {
    const n = Number(raw);
    return Number.isNaN(n) ? 0 : n;
  }
  if (type === "boolean") {
    return raw === "true";
  }
  if (type === "set" || type === "record") {
    try {
      return JSON.parse(raw) as StateValue;
    } catch {
      return defaultForType(type);
    }
  }
  return raw;
}

export function InitEditorModal({
  variables,
  initialState,
  onSave,
  onClose,
}: InitEditorModalProps) {
  const [vars, setVars] = useState<VarDecl[]>([...variables]);
  const [stateDraft, setStateDraft] = useState<Record<string, StateValue>>({
    ...initialState,
  });

  const handleAddVar = () => {
    let idx = vars.length + 1;
    let name = `var${idx}`;
    while (vars.some((v) => v.name === name)) {
      idx += 1;
      name = `var${idx}`;
    }
    setVars([...vars, { name, type: "number" }]);
    setStateDraft({ ...stateDraft, [name]: 0 });
  };

  const handleRenameVar = (index: number, nextName: string) => {
    const oldName = vars[index].name;
    const updated = [...vars];
    updated[index] = { ...vars[index], name: nextName };
    setVars(updated);

    if (oldName !== nextName) {
      const nextState = { ...stateDraft };
      nextState[nextName] = nextState[oldName] ?? defaultForType(vars[index].type);
      delete nextState[oldName];
      setStateDraft(nextState);
    }
  };

  const handleTypeChange = (index: number, nextType: VarType) => {
    const v = vars[index];
    const updated = [...vars];
    updated[index] = { ...v, type: nextType };
    setVars(updated);
    setStateDraft({ ...stateDraft, [v.name]: defaultForType(nextType) });
  };

  const handleRemoveVar = (index: number) => {
    const name = vars[index].name;
    setVars(vars.filter((_, i) => i !== index));
    const nextState = { ...stateDraft };
    delete nextState[name];
    setStateDraft(nextState);
  };

  return (
    <div className="tsmc-modal-backdrop" onClick={onClose}>
      <div className="tsmc-modal" onClick={(e) => e.stopPropagation()}>
        <div className="tsmc-modal-header">
          <span>Configure Variables &amp; Initial State (Init)</span>
          <button type="button" className="tsmc-btn tsmc-btn-sm" onClick={onClose}>
            <X size={14} />
          </button>
        </div>

        <div className="tsmc-modal-body">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13, color: "var(--tsmc-text-muted)" }}>
              Define the system state variables and their initial values.
            </span>
            <button type="button" className="tsmc-btn tsmc-btn-sm" onClick={handleAddVar}>
              <Plus size={12} /> New Variable
            </button>
          </div>

          {vars.map((v, idx) => (
            <div
              key={idx}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 120px 1fr auto",
                gap: 8,
                alignItems: "center",
              }}
            >
              <input
                className="tsmc-input"
                value={v.name}
                placeholder="Name"
                onChange={(e) => handleRenameVar(idx, e.target.value)}
              />
              <select
                className="tsmc-select"
                value={v.type}
                onChange={(e) => handleTypeChange(idx, e.target.value as VarType)}
              >
                <option value="number">Number</option>
                <option value="string">String</option>
                <option value="boolean">Boolean</option>
                <option value="set">Set</option>
                <option value="record">Record</option>
              </select>

              {v.type === "boolean" ? (
                <select
                  className="tsmc-select"
                  value={String(Boolean(stateDraft[v.name]))}
                  onChange={(e) =>
                    setStateDraft({
                      ...stateDraft,
                      [v.name]: e.target.value === "true",
                    })
                  }
                >
                  <option value="true">true</option>
                  <option value="false">false</option>
                </select>
              ) : (
                <input
                  className="tsmc-input"
                  type={v.type === "number" ? "number" : "text"}
                  value={
                    typeof stateDraft[v.name] === "object"
                      ? JSON.stringify(stateDraft[v.name])
                      : String(stateDraft[v.name] ?? "")
                  }
                  onChange={(e) =>
                    setStateDraft({
                      ...stateDraft,
                      [v.name]: parseValue(e.target.value, v.type),
                    })
                  }
                />
              )}

              <button
                type="button"
                className="tsmc-btn tsmc-btn-sm tsmc-btn-danger"
                onClick={() => handleRemoveVar(idx)}
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>

        <div className="tsmc-modal-footer">
          <button type="button" className="tsmc-btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="tsmc-btn tsmc-btn-primary"
            onClick={() => {
              onSave(vars, stateDraft);
              onClose();
            }}
          >
            Save Initial State
          </button>
        </div>
      </div>
    </div>
  );
}

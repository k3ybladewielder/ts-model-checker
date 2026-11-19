import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { Play, Edit3 } from "lucide-react";
import type { State, VarDecl } from "@ts-model-checker/core";

export interface InitNodeData extends Record<string, unknown> {
  readonly variables: readonly VarDecl[];
  readonly initialState: State;
  readonly isActive?: boolean;
  readonly onEdit?: () => void;
}

export type InitFlowNode = Node<InitNodeData, "initNode">;

export function InitNode({ data }: NodeProps<InitFlowNode>) {
  const { variables, initialState, isActive, onEdit } = data;

  return (
    <div className={`tsmc-node tsmc-node-init ${isActive ? "tsmc-node-active" : ""}`}>
      <div className="tsmc-node-header">
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Play size={14} /> Initial State (Init)
        </span>
        {onEdit && (
          <button
            type="button"
            className="tsmc-btn tsmc-btn-sm"
            onClick={onEdit}
            title="Edit initial variables"
          >
            <Edit3 size={12} />
          </button>
        )}
      </div>

      <div className="tsmc-node-body">
        {variables.length === 0 ? (
          <span style={{ color: "var(--tsmc-text-muted)" }}>
            No variables defined
          </span>
        ) : (
          variables.map((v) => (
            <div key={v.name} className="tsmc-var-row">
              <strong>{v.name}</strong>
              <span>= {JSON.stringify(initialState[v.name])}</span>
            </div>
          ))
        )}
      </div>

      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

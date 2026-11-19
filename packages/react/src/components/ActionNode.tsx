import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { Edit3, Zap } from "lucide-react";
import type { VisualActionIR } from "@ts-model-checker/core";
import { formatExpr } from "../utils/formatExpr";

export interface ActionNodeData extends Record<string, unknown> {
  readonly action: VisualActionIR;
  readonly isActive?: boolean;
  readonly isViolated?: boolean;
  readonly onEdit?: (actionId: string) => void;
}

export type ActionFlowNode = Node<ActionNodeData, "actionNode">;

export function ActionNode({ data }: NodeProps<ActionFlowNode>) {
  const { action, isActive, isViolated, onEdit } = data;

  const stateClass = isViolated
    ? "tsmc-node-violated"
    : isActive
      ? "tsmc-node-active"
      : "";

  return (
    <div className={`tsmc-node ${stateClass}`}>
      <Handle type="target" position={Position.Top} />

      <div className="tsmc-node-header">
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Zap size={14} color="#2563eb" /> {action.name}
        </span>
        {onEdit && (
          <button
            type="button"
            className="tsmc-btn tsmc-btn-sm"
            onClick={() => onEdit(action.id)}
            title="Edit action"
          >
            <Edit3 size={12} />
          </button>
        )}
      </div>

      <div className="tsmc-node-body">
        <div>
          <div className="tsmc-section-label">When (Guard)</div>
          <div className="tsmc-code-chip">{formatExpr(action.guard)}</div>
        </div>

        <div>
          <div className="tsmc-section-label">Then (Effects)</div>
          {action.effects.length === 0 ? (
            <div className="tsmc-code-chip" style={{ color: "var(--tsmc-text-muted)" }}>
              UNCHANGED (No changes)
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {action.effects.map((eff) => (
                <div key={eff.targetVar} className="tsmc-code-chip">
                  <strong>{eff.targetVar}&apos;</strong> = {formatExpr(eff.expression)}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

import { useCallback, useMemo, useState } from "react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type Edge,
  type Node,
  type NodeChange,
  type NodeTypes,
} from "@xyflow/react";
import { Plus } from "lucide-react";
import type {
  State,
  VarDecl,
  VisualActionIR,
  VisualSpecIR,
} from "@ts-model-checker/core";
import { ActionEditorModal } from "./ActionEditorModal";
import { ActionNode } from "./ActionNode";
import { InitEditorModal } from "./InitEditorModal";
import { InitNode } from "./InitNode";

export interface FormalCanvasProps {
  readonly spec: VisualSpecIR;
  readonly onChange: (nextSpec: VisualSpecIR) => void;
  /** Name of the action currently highlighted by TracePlayer (e.g. "Init" or action.name). */
  readonly activeActionName?: string | null;
  /** Marks the active action as violating an invariant. */
  readonly isViolationStep?: boolean;
  readonly readOnly?: boolean;
}

const nodeTypes: NodeTypes = {
  initNode: InitNode,
  actionNode: ActionNode,
};

export function FormalCanvas({
  spec,
  onChange,
  activeActionName = null,
  isViolationStep = false,
  readOnly = false,
}: FormalCanvasProps) {
  const [editingActionId, setEditingActionId] = useState<string | null>(null);
  const [editingInit, setEditingInit] = useState(false);

  const editingAction = useMemo(
    () => spec.actions.find((a) => a.id === editingActionId) ?? null,
    [spec.actions, editingActionId]
  );

  const nodes: Node[] = useMemo(() => {
    const initNode: Node = {
      id: "__init__",
      type: "initNode",
      position: { x: 230, y: 20 },
      data: {
        variables: spec.variables,
        initialState: spec.initialStates[0] ?? {},
        isActive: activeActionName === "Init",
        onEdit: readOnly ? undefined : () => setEditingInit(true),
      },
    };

    const actionNodes: Node[] = spec.actions.map((act, idx) => ({
      id: act.id,
      type: "actionNode",
      position: act.position ?? {
        x: 60 + (idx % 2) * 320,
        y: 200 + Math.floor(idx / 2) * 180,
      },
      data: {
        action: act,
        isActive: activeActionName === act.name && !isViolationStep,
        isViolated: activeActionName === act.name && isViolationStep,
        onEdit: readOnly ? undefined : (id: string) => setEditingActionId(id),
      },
    }));

    return [initNode, ...actionNodes];
  }, [spec, activeActionName, isViolationStep, readOnly]);

  const edges: Edge[] = useMemo(
    () =>
      spec.actions.map((act) => ({
        id: `edge_init_${act.id}`,
        source: "__init__",
        target: act.id,
        animated: activeActionName === act.name,
        style: {
          stroke: activeActionName === act.name ? "#2563eb" : "#94a3b8",
          strokeWidth: activeActionName === act.name ? 2.5 : 1.5,
        },
      })),
    [spec.actions, activeActionName]
  );

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      if (readOnly) return;
      const positionUpdates = new Map<string, { x: number; y: number }>();
      for (const ch of changes) {
        if (ch.type === "position" && ch.position && ch.id !== "__init__") {
          positionUpdates.set(ch.id, ch.position);
        }
      }
      if (positionUpdates.size === 0) return;

      onChange({
        ...spec,
        actions: spec.actions.map((act) => {
          const pos = positionUpdates.get(act.id);
          return pos ? { ...act, position: pos } : act;
        }),
      });
    },
    [spec, onChange, readOnly]
  );

  const handleAddAction = () => {
    const idx = spec.actions.length + 1;
    const newAction: VisualActionIR = {
      id: `act_${Date.now()}`,
      name: `Action_${idx}`,
      guard: { kind: "Literal", value: true },
      effects: [],
      position: {
        x: 60 + ((idx - 1) % 2) * 320,
        y: 200 + Math.floor((idx - 1) / 2) * 180,
      },
    };
    onChange({ ...spec, actions: [...spec.actions, newAction] });
    setEditingActionId(newAction.id);
  };

  const handleSaveAction = (updated: VisualActionIR) => {
    onChange({
      ...spec,
      actions: spec.actions.map((a) => (a.id === updated.id ? updated : a)),
    });
  };

  const handleDeleteAction = (actionId: string) => {
    onChange({
      ...spec,
      actions: spec.actions.filter((a) => a.id !== actionId),
    });
  };

  const handleSaveInit = (
    variables: readonly VarDecl[],
    initialState: State
  ) => {
    onChange({
      ...spec,
      variables,
      initialStates: [initialState, ...spec.initialStates.slice(1)],
    });
  };

  return (
    <div className="tsmc-canvas-wrapper">
      {!readOnly && (
        <div className="tsmc-toolbar">
          <button
            type="button"
            className="tsmc-btn tsmc-btn-sm tsmc-btn-primary"
            onClick={handleAddAction}
          >
            <Plus size={14} /> New Action
          </button>
        </div>
      )}

      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={handleNodesChange}
        fitView
        nodesConnectable={false}
      >
        <Background gap={16} size={1} />
        <Controls />
        <MiniMap zoomable pannable />
      </ReactFlow>

      {editingAction && (
        <ActionEditorModal
          action={editingAction}
          variables={spec.variables}
          onSave={handleSaveAction}
          onDelete={handleDeleteAction}
          onClose={() => setEditingActionId(null)}
        />
      )}

      {editingInit && (
        <InitEditorModal
          variables={spec.variables}
          initialState={spec.initialStates[0] ?? {}}
          onSave={handleSaveInit}
          onClose={() => setEditingInit(false)}
        />
      )}
    </div>
  );
}

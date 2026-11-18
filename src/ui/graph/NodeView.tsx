import { memo } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import { AlertTriangle, Eye } from 'lucide-react';
import { getDef } from '../../core/nodes/registry';
import { NodeIcon } from '../meta';
import { actions } from '../../state/store';

export interface SdfNodeData extends Record<string, unknown> {
  type: string;
  title: string;
  summary: string;
  dims: Record<string, 2 | 3 | null>; // per input key, and 'out'
  connected: Record<string, boolean>;
  error?: string;
  viewing: boolean;
  dimmed: boolean;
}

export type SdfFlowNode = Node<SdfNodeData, 'sdf'>;

function NodeViewImpl({ id, data, selected }: NodeProps<SdfFlowNode>) {
  const def = getDef(data.type)!;
  const outDim = data.dims.out;
  return (
    <div
      className={`sdf-node${selected ? ' selected' : ''}${data.error ? ' has-error' : ''}${data.dimmed ? ' dimmed' : ''}`}
      data-testid={`node-${data.type}`}
      data-node-id={id}
    >
      <div
        className="sdf-node-head"
        style={{ background: `color-mix(in srgb, var(--cat-${def.category}) 9%, transparent)` }}
      >
        <NodeIcon type={data.type} category={def.category} size={13} />
        <span className="sdf-node-title" title={def.summary}>
          {data.title}
        </span>
        {data.error && (
          <span className="node-badge" title={data.error} role="img" aria-label={`Problem: ${data.error}`}>
            <AlertTriangle size={14} />
          </span>
        )}
        {def.output && (
          <button
            type="button"
            className="node-eye nodrag"
            aria-pressed={data.viewing}
            aria-label={data.viewing ? 'Show the whole shape again' : `View only ${data.title}`}
            title={data.viewing ? 'Show the whole shape again' : 'View only this node’s result'}
            onClick={(e) => {
              e.stopPropagation();
              actions.set({ viewRoot: data.viewing ? null : id });
            }}
          >
            <Eye size={13} />
          </button>
        )}
        {def.output && (
          <Handle
            type="source"
            position={Position.Right}
            id="out"
            className={`${outDim === 2 ? 'dim2' : 'dim3'}${data.connected.out ? ' connected' : ''}`}
            title={outDim === 2 ? '2D profile output' : 'Shape output'}
            style={{ top: 18 }}
          />
        )}
      </div>
      {def.inputs.map((inp) => {
        const d = data.dims[inp.key] ?? (inp.type === 'sdf2' ? 2 : 3);
        return (
          <div className="sdf-node-row" key={inp.key}>
            <Handle
              type="target"
              position={Position.Left}
              id={inp.key}
              className={`${d === 2 ? 'dim2' : 'dim3'}${data.connected[inp.key] ? ' connected' : ''}`}
              title={`${inp.label}${inp.multi ? ' (accepts many)' : ''}`}
            />
            {inp.label}
            {inp.multi && <span className="muted">&nbsp;+</span>}
          </div>
        );
      })}
      <div className="sdf-node-sub">{data.summary}</div>
    </div>
  );
}

export const NodeView = memo(NodeViewImpl);

import { memo } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { ChevronDown, ChevronRight, Group } from 'lucide-react';
import { setGroupCollapsed } from '../../state/groups';

export interface GroupCardData extends Record<string, unknown> {
  groupId: string;
  title: string;
  count: number;
  inputs: { id: string; label: string; dim: 2 | 3; connected: boolean }[];
  outputs: { id: string; label: string; dim: 2 | 3; connected: boolean }[];
  settings: { label: string; value: string }[];
  dimmed: boolean;
}
export type GroupCardNode = Node<GroupCardData, 'groupCard'>;

export interface GroupFrameData extends Record<string, unknown> {
  groupId: string;
  title: string;
  count: number;
  width: number;
  height: number;
}
export type GroupFrameNode = Node<GroupFrameData, 'groupFrame'>;

function GroupCardImpl({ data, selected }: NodeProps<GroupCardNode>) {
  const single = data.outputs.length === 1 ? data.outputs[0] : null;
  return (
    <div
      className={`sdf-node group-card${selected ? ' selected' : ''}${data.dimmed ? ' dimmed' : ''}`}
      data-testid="group-card"
      data-group-id={data.groupId}
    >
      <div className="sdf-node-head group-head">
        <Group size={13} aria-hidden="true" />
        <span className="sdf-node-title">{data.title}</span>
        <button
          type="button"
          className="node-eye nodrag"
          aria-label={`Expand group ${data.title}`}
          title="Show the nodes inside"
          onClick={(e) => {
            e.stopPropagation();
            setGroupCollapsed(data.groupId, false);
          }}
        >
          <ChevronRight size={13} />
        </button>
        {single && (
          <Handle
            type="source"
            position={Position.Right}
            id={single.id}
            className={`${single.dim === 2 ? 'dim2' : 'dim3'}${single.connected ? ' connected' : ''}`}
            title={`Result: ${single.label}`}
            style={{ top: 18 }}
          />
        )}
      </div>
      {data.inputs.map((i) => (
        <div className="sdf-node-row" key={i.id}>
          <Handle
            type="target"
            position={Position.Left}
            id={i.id}
            className={`${i.dim === 2 ? 'dim2' : 'dim3'}${i.connected ? ' connected' : ''}`}
            title={i.label}
          />
          <span className="group-port">{i.label}</span>
        </div>
      ))}
      {!single &&
        data.outputs.map((o) => (
          <div className="sdf-node-row group-out" key={o.id}>
            <span className="group-port">{o.label}</span>
            <Handle
              type="source"
              position={Position.Right}
              id={o.id}
              className={`${o.dim === 2 ? 'dim2' : 'dim3'}${o.connected ? ' connected' : ''}`}
              title={`Result: ${o.label}`}
            />
          </div>
        ))}
      {data.settings.length > 0 && (
        <dl className="group-settings">
          {data.settings.slice(0, 4).map((s, i) => (
            <div key={i}>
              <dt>{s.label}</dt>
              <dd>{s.value}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="sdf-node-sub">
        Group of {data.count} node{data.count === 1 ? '' : 's'}
      </div>
    </div>
  );
}

function GroupFrameImpl({ data, selected }: NodeProps<GroupFrameNode>) {
  return (
    <div
      className={`group-frame${selected ? ' selected' : ''}`}
      style={{ width: data.width, height: data.height }}
      data-testid="group-frame"
      data-group-id={data.groupId}
    >
      <div className="group-frame-head">
        <Group size={13} aria-hidden="true" />
        <span>{data.title}</span>
        <span className="muted">· {data.count}</span>
        <button
          type="button"
          className="node-eye nodrag"
          aria-label={`Collapse group ${data.title}`}
          title="Collapse into one card"
          onClick={(e) => {
            e.stopPropagation();
            setGroupCollapsed(data.groupId, true);
          }}
        >
          <ChevronDown size={13} />
        </button>
      </div>
    </div>
  );
}

export const GroupCard = memo(GroupCardImpl);
export const GroupFrame = memo(GroupFrameImpl);

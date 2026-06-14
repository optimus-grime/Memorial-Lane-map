export type ToolMode = 'select' | 'point' | 'route' | 'erase' | 'obstacle';

export type MarkerType = 'default' | 'spawn' | 'loot' | 'extract';

export interface LocationNode {
  id: string;
  x: number;
  y: number;
  label: string;
  type?: MarkerType;
}

export interface RouteEdge {
  id: string;
  startNodeId: string;
  endNodeId: string;
  pathPoints?: {x: number; y: number}[];
}

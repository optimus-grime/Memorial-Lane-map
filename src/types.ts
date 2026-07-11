export type ToolMode = 'select' | 'point' | 'route' | 'erase' | 'obstacle';

export type MarkerType = 'default' | 'workbench' | 'bitecoin' | 'recipe' | 'booster';

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

export interface LayerData {
  id: string;
  name: string;
  nodes: LocationNode[];
  edges: RouteEdge[];
  isVisible: boolean;
}

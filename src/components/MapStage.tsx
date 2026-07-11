import React, { useRef, useState } from 'react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { LocationNode, RouteEdge, ToolMode, LayerData } from '../types';

interface MapStageProps {
  baseImage: string | null;
  gridImage: string | null;
  gridOpacity: number;
  mode: ToolMode;
  layers: LayerData[];
  activeLayerId: string;
  activeRouteStart: string | null;
  snapToGrid: boolean;
  gridCols: number;
  gridRows: number;
  blockedCells: Set<string>;
  heatmapData?: Record<string, number> | null;
  onToggleObstacle: (cellKey: string, add: boolean) => void;
  onAddNode: (x: number, y: number) => void;
  onNodeClick: (id: string, e: React.MouseEvent) => void;
  onEdgeClick: (id: string, e: React.MouseEvent) => void;
}

const generateSmoothPath = (points: {x: number, y: number}[]) => {
  if (!points || points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let d = `M ${points[0].x} ${points[0].y}`;
  
  if (points.length === 2) {
    return d + ` L ${points[1].x} ${points[1].y}`;
  }

  const firstMidX = (points[0].x + points[1].x) / 2;
  const firstMidY = (points[0].y + points[1].y) / 2;
  d += ` L ${firstMidX} ${firstMidY}`;

  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    const next = points[i + 1];
    const midX = (p.x + next.x) / 2;
    const midY = (p.y + next.y) / 2;
    d += ` Q ${p.x} ${p.y} ${midX} ${midY}`;
  }

  const last = points[points.length - 1];
  d += ` L ${last.x} ${last.y}`;

  return d;
};

export function MapStage({
  baseImage,
  gridImage,
  gridOpacity,
  mode,
  layers,
  activeLayerId,
  activeRouteStart,
  snapToGrid,
  gridCols,
  gridRows,
  blockedCells,
  heatmapData,
  onToggleObstacle,
  onAddNode,
  onNodeClick,
  onEdgeClick
}: MapStageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

  const activeLayer = layers.find(l => l.id === activeLayerId) || layers[0];
  const nodes = activeLayer.nodes;
  
  const isPaintingRef = useRef(false);
  const paintModeRef = useRef<'add'|'remove'>('add');

  const handleMouseMove = (e: React.MouseEvent) => {
    if (mode === 'route' && activeRouteStart && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      let x = ((e.clientX - rect.left) / rect.width) * 100;
      let y = ((e.clientY - rect.top) / rect.height) * 100;
      
      if (snapToGrid && gridCols > 0 && gridRows > 0) {
        const stepX = 100 / gridCols;
        const stepY = 100 / gridRows;
        x = Math.round(x / stepX) * stepX;
        y = Math.round(y / stepY) * stepY;
      }
      
      setMousePos({ x, y });
    }
  };

  const handleMouseLeave = () => {
    setMousePos(null);
  };

  const handleMapClick = (e: React.MouseEvent) => {
    // We now handle clicks via pointer events for paint drags, but keep point creation here
    if (!baseImage) return;

    const target = e.target as HTMLElement;
    if (target.tagName.toLowerCase() === 'button' || target.tagName.toLowerCase() === 'line') return;

    if (mode === 'point' && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      let x = ((e.clientX - rect.left) / rect.width) * 100;
      let y = ((e.clientY - rect.top) / rect.height) * 100;
      
      if (snapToGrid && gridCols > 0 && gridRows > 0) {
        const stepX = 100 / gridCols;
        const stepY = 100 / gridRows;
        x = Math.round(x / stepX) * stepX;
        y = Math.round(y / stepY) * stepY;
      }
      
      onAddNode(x, y);
    }
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName.toLowerCase() === 'button' || target.tagName.toLowerCase() === 'line') return;
    
    if (mode === 'obstacle' && containerRef.current) {
      isPaintingRef.current = true;
      const rect = containerRef.current.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      const col = Math.floor(x / (100 / gridCols));
      const row = Math.floor(y / (100 / gridRows));
      
      const cellKey = `${col},${row}`;
      paintModeRef.current = blockedCells.has(cellKey) ? 'remove' : 'add';
      onToggleObstacle(cellKey, paintModeRef.current === 'add');
      
      // Capture so drag doesn't drop unexpectedly if user moves fast
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    handleMouseMove(e as unknown as React.MouseEvent);

    if (isPaintingRef.current && mode === 'obstacle' && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      const col = Math.floor(x / (100 / gridCols));
      const row = Math.floor(y / (100 / gridRows));
      
      if (col >= 0 && col < gridCols && row >= 0 && row < gridRows) {
        const cellKey = `${col},${row}`;
        if (paintModeRef.current === 'add' && !blockedCells.has(cellKey)) {
          onToggleObstacle(cellKey, true);
        } else if (paintModeRef.current === 'remove' && blockedCells.has(cellKey)) {
          onToggleObstacle(cellKey, false);
        }
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isPaintingRef.current) {
      isPaintingRef.current = false;
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    handleMouseLeave(); // Clear the route ghost line
  };

  const activeStartNode = activeRouteStart ? nodes.find(n => n.id === activeRouteStart) : null;

  return (
    <div
      className={`relative w-full h-full bg-[#0a0a0a] overflow-hidden flex items-center justify-center
        ${mode === 'point' || mode === 'route' ? 'cursor-crosshair' : 'cursor-default'}
      `}
    >
      {!baseImage && (
        <div className="text-slate-500 font-mono text-sm border border-slate-800 border-dashed p-12 rounded-xl bg-slate-900/30 flex flex-col items-center gap-3">
          <svg className="w-8 h-8 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
          </svg>
          Upload a Base Map to begin planning
        </div>
      )}

      {baseImage && (
        <div className="w-full h-full flex items-center justify-center">
          <TransformWrapper
            initialScale={1}
            minScale={0.5}
            maxScale={8}
            panning={{ disabled: mode !== 'select' }}
            doubleClick={{ disabled: true }}
            wheel={{ step: 0.1 }}
          >
            <TransformComponent wrapperStyle={{ width: '100%', height: '100%' }} contentStyle={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: '100%', minHeight: '100%' }}>
              <div
                ref={containerRef}
                className="relative inline-block select-none leading-none shadow-2xl bg-black border border-slate-900"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                onClick={handleMapClick}
              >
              {/* Internal generated visual snap grid */}
              {snapToGrid && (
                <div 
                  className="absolute inset-0 pointer-events-none opacity-20 z-0"
                  style={{
                    backgroundImage: `linear-gradient(to right, #3b82f6 1.5px, transparent 1.5px), linear-gradient(to bottom, #3b82f6 1.5px, transparent 1.5px)`,
                    backgroundSize: `${100 / gridCols}% ${100 / gridRows}%`
                  }}
                />
              )}
              {/* Maps stack */}
              <img
                src={baseImage}
                className="block max-w-[85vw] max-h-[85vh] pointer-events-none"
                alt="Base Map"
                draggable={false}
              />
              {gridImage && (
                <img
                  src={gridImage}
                  className="absolute inset-0 w-full h-full object-fill pointer-events-none transition-opacity duration-150 ease-out z-0"
                  style={{ opacity: gridOpacity / 100 }}
                  alt="Grid Overlay"
                  draggable={false}
                />
              )}

              {/* Heatmap Overlay */}
              {heatmapData && (
                <div className="absolute inset-0 pointer-events-none z-0">
                  {Object.entries(heatmapData).map(([cellKey, score]) => {
                    const [c, r] = cellKey.split(',').map(Number);
                    const stepX = 100 / gridCols;
                    const stepY = 100 / gridRows;

                    // Color mapping: 1.0 = optimal (green), 0.0 = worst (red)
                    // HSL mapping: Hue 0 (red) to 120 (green)
                    const hue = score * 120;

                    return (
                      <div
                        key={`heat-${cellKey}`}
                        className="absolute"
                        style={{
                          left: `${c * stepX}%`,
                          top: `${r * stepY}%`,
                          width: `${stepX}%`,
                          height: `${stepY}%`,
                          backgroundColor: `hsla(${hue}, 100%, 50%, 0.45)`,
                          border: `1px solid hsla(${hue}, 100%, 50%, 0.1)`
                        }}
                      />
                    );
                  })}
                </div>
              )}

              {/* Blocked Cells Overlay */}
              <div 
                className="absolute inset-0 pointer-events-none z-0 transition-opacity duration-150 ease-out"
                style={{ opacity: gridOpacity / 100 }}
              >
                {Array.from(blockedCells).map(cellStr => {
                  const [c, r] = cellStr.split(',').map(Number);
                  const stepX = 100 / gridCols;
                  const stepY = 100 / gridRows;
                  return (
                    <div
                      key={`b-${cellStr}`}
                      className="absolute bg-red-500/30 border border-red-500/50 backdrop-blur-sm shadow-[0_0_15px_rgba(239,68,68,0.2)]"
                      style={{ left: `${c * stepX}%`, top: `${r * stepY}%`, width: `${stepX}%`, height: `${stepY}%` }}
                    />
                  );
                })}
              </div>

              {/* SVG Overlay for Routes */}
              <svg 
                className="absolute inset-0 w-full h-full pointer-events-none overflow-visible"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
              >
                <defs>
                  <filter id="routeGlow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="1.5" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>
                  <linearGradient id="routeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#10b981" />
                    <stop offset="50%" stopColor="#8b5cf6" />
                    <stop offset="100%" stopColor="#3b82f6" />
                  </linearGradient>
                  
                  <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="2.5" markerHeight="2.5" orient="auto-start-reverse" markerUnits="userSpaceOnUse">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#3b82f6" />
                  </marker>
                  <marker id="arrow-erase" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="2.5" markerHeight="2.5" orient="auto-start-reverse" markerUnits="userSpaceOnUse">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#ef4444" />
                  </marker>
                </defs>

                {layers.filter(layer => layer.isVisible).map((layer, layerIndex) => {
                  const isActiveLayer = layer.id === activeLayerId;
                  const layerOpacity = isActiveLayer ? 1 : 0.4;
                  
                  return (
                    <g key={layer.id} opacity={layerOpacity}>
                      {layer.edges.map(edge => {
                        const start = layer.nodes.find(n => n.id === edge.startNodeId);
                        const end = layer.nodes.find(n => n.id === edge.endNodeId);
                        if (!start || !end) return null;
                        
                        const isErase = mode === 'erase' && isActiveLayer;
                        const allowInteraction = isActiveLayer;
                        const commonProps = {
                          stroke: isErase ? "#ef4444" : "url(#routeGradient)",
                          strokeWidth: isErase ? "4" : "3.5",
                          strokeLinecap: "round" as const,
                          strokeLinejoin: "round" as const,
                          fill: "none",
                          filter: isErase ? "none" : "url(#routeGlow)",
                          markerEnd: isErase ? "url(#arrow-erase)" : "url(#arrow)",
                          vectorEffect: "non-scaling-stroke",
                          className: `transition-all duration-300 ${isErase ? 'pointer-events-auto cursor-pointer hover:strokeWidth-[6px] hover:stroke-red-500 hover:drop-shadow-[0_0_8px_rgba(239,68,68,0.8)]' : ''}`,
                          onClick: (e: React.MouseEvent) => { if (isErase && allowInteraction) { e.stopPropagation(); onEdgeClick(edge.id, e); } }
                        };

                        if (edge.pathPoints && edge.pathPoints.length > 1) {
                          return (
                            <g key={edge.id}>
                              {/* Invisible thicker path for hit detection when erasing */}
                              {isErase && (
                                <path 
                                  d={generateSmoothPath(edge.pathPoints)} 
                                  stroke="transparent" 
                                  strokeWidth="16" 
                                  fill="none" 
                                  vectorEffect="non-scaling-stroke"
                                  className="pointer-events-auto cursor-pointer"
                                  onClick={(e) => { e.stopPropagation(); onEdgeClick(edge.id, e); }}
                                />
                              )}
                              <path 
                                d={generateSmoothPath(edge.pathPoints)} 
                                {...commonProps} 
                              />
                            </g>
                          );
                        }

                        return (
                          <g key={edge.id}>
                            {isErase && (
                              <path 
                                d={`M ${start.x} ${start.y} L ${end.x} ${end.y}`}
                                stroke="transparent" 
                                strokeWidth="16" 
                                fill="none" 
                                vectorEffect="non-scaling-stroke"
                                className="pointer-events-auto cursor-pointer"
                                onClick={(e) => { e.stopPropagation(); onEdgeClick(edge.id, e); }}
                              />
                            )}
                            <path 
                              d={`M ${start.x} ${start.y} L ${end.x} ${end.y}`}
                              {...commonProps} 
                            />
                          </g>
                        );
                      })}
                    </g>
                  );
                })}

                {/* Active drawing route */}
                {activeStartNode && mousePos && (
                  <path
                    d={`M ${activeStartNode.x} ${activeStartNode.y} L ${mousePos.x} ${mousePos.y}`}
                    stroke="url(#routeGradient)"
                    strokeWidth="3.5"
                    strokeDasharray="8 6"
                    fill="none"
                    filter="url(#routeGlow)"
                    vectorEffect="non-scaling-stroke"
                    className="opacity-80 animate-pulse"
                  />
                )}
              </svg>

              {/* HTML Nodes overlay */}
              {layers.filter(layer => layer.isVisible).map(layer => {
                const isActiveLayer = layer.id === activeLayerId;
                const layerOpacity = isActiveLayer ? 1 : 0.4;
                
                return (
                  <div key={layer.id} className="absolute inset-0 pointer-events-none" style={{ opacity: layerOpacity }}>
                    {layer.nodes.map(n => {
                      const isStartNode = activeRouteStart === n.id && isActiveLayer;
                      const allowInteraction = isActiveLayer;
                      
                      const typeColor = n.type === 'workbench' ? 'bg-blue-500' : 
                                        n.type === 'bitecoin' ? 'bg-amber-500' :
                                        n.type === 'recipe' ? 'bg-purple-500' :
                                        n.type === 'booster' ? 'bg-green-400' : 'bg-slate-300';
                      return (
                        <div
                          key={n.id}
                          className={`absolute transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1.5 group z-10 ${allowInteraction ? 'pointer-events-auto' : ''}`}
                          style={{ left: `${n.x}%`, top: `${n.y}%` }}
                        >
                          <button
                            type="button"
                            onClick={(e) => { if (allowInteraction) { e.stopPropagation(); onNodeClick(n.id, e); } }}
                            className={`w-3.5 h-3.5 rounded-full border-[2.5px] border-[#0a0a0a] shadow-lg shadow-black/40 transition-all outline-none focus:outline-none ring-0
                              ${mode === 'erase' && allowInteraction ? 'bg-red-500 cursor-pointer pointer-events-auto hover:bg-red-400 hover:scale-125' :
                                isStartNode ? 'bg-amber-400 scale-[1.3] pointer-events-auto ring-2 ring-amber-400/30' :
                                mode === 'route' && allowInteraction ? 'bg-blue-400 cursor-pointer pointer-events-auto hover:bg-amber-300 hover:scale-[1.2]' :
                                `${typeColor} ${allowInteraction ? (mode === 'select' ? 'hover:scale-110 cursor-pointer' : 'cursor-default') : ''}`
                              }
                            `}
                          />
                          <span className="px-2 py-0.5 bg-[#0a0a0a]/90 text-slate-300 text-[10px] font-mono tracking-wider rounded border border-slate-800 shadow-md backdrop-blur-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none translate-y-1 group-hover:translate-y-0">
                            {n.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </TransformComponent>
        </TransformWrapper>
        </div>
      )}
    </div>
  );
}

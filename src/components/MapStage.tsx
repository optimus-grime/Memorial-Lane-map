import React, { useRef, useState } from 'react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { LocationNode, RouteEdge, ToolMode } from '../types';

interface MapStageProps {
  baseImage: string | null;
  gridImage: string | null;
  gridOpacity: number;
  mode: ToolMode;
  nodes: LocationNode[];
  edges: RouteEdge[];
  activeRouteStart: string | null;
  snapToGrid: boolean;
  gridCols: number;
  gridRows: number;
  blockedCells: Set<string>;
  onToggleObstacle: (cellKey: string, add: boolean) => void;
  onAddNode: (x: number, y: number) => void;
  onNodeClick: (id: string, e: React.MouseEvent) => void;
  onEdgeClick: (id: string, e: React.MouseEvent) => void;
}

export function MapStage({
  baseImage,
  gridImage,
  gridOpacity,
  mode,
  nodes,
  edges,
  activeRouteStart,
  snapToGrid,
  gridCols,
  gridRows,
  blockedCells,
  onToggleObstacle,
  onAddNode,
  onNodeClick,
  onEdgeClick
}: MapStageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  
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

              {/* Blocked Cells Overlay */}
              <div className="absolute inset-0 pointer-events-none z-0">
                {Array.from(blockedCells).map(cellStr => {
                  const [c, r] = cellStr.split(',').map(Number);
                  const stepX = 100 / gridCols;
                  const stepY = 100 / gridRows;
                  return (
                    <div
                      key={cellStr}
                      className="absolute bg-red-500/30 border border-red-500/50 backdrop-blur-sm shadow-[0_0_15px_rgba(239,68,68,0.2)]"
                      style={{ left: `${c * stepX}%`, top: `${r * stepY}%`, width: `${stepX}%`, height: `${stepY}%` }}
                    />
                  );
                })}
              </div>

              {/* SVG Overlay for Routes */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible">
                {edges.map(edge => {
                  const start = nodes.find(n => n.id === edge.startNodeId);
                  const end = nodes.find(n => n.id === edge.endNodeId);
                  if (!start || !end) return null;
                  
                  const isErase = mode === 'erase';
                  const strokeCol = isErase ? "#ef4444" : "#10b981";
                  const commonProps = {
                    stroke: strokeCol,
                    strokeWidth: isErase ? "6" : "3",
                    strokeLinecap: "round" as const,
                    strokeLinejoin: "round" as const,
                    className: `transition-colors duration-200 ${isErase ? 'pointer-events-auto cursor-pointer hover:strokeWidth-4 hover:stroke-red-500' : ''}`,
                    onClick: (e: React.MouseEvent) => { if (isErase) { e.stopPropagation(); onEdgeClick(edge.id, e); } }
                  };

                  if (edge.pathPoints && edge.pathPoints.length > 1) {
                    return (
                      <g key={edge.id}>
                        {edge.pathPoints.map((p, i, arr) => {
                          if (i === 0) return null;
                          const prev = arr[i - 1];
                          return <line key={`${edge.id}-${i}`} x1={`${prev.x}%`} y1={`${prev.y}%`} x2={`${p.x}%`} y2={`${p.y}%`} {...commonProps} />;
                        })}
                      </g>
                    );
                  }

                  return (
                    <line key={edge.id} x1={`${start.x}%`} y1={`${start.y}%`} x2={`${end.x}%`} y2={`${end.y}%`} {...commonProps} />
                  );
                })}

                {/* Active drawing route */}
                {activeStartNode && mousePos && (
                  <line
                    x1={`${activeStartNode.x}%`} y1={`${activeStartNode.y}%`}
                    x2={`${mousePos.x}%`} y2={`${mousePos.y}%`}
                    stroke="#10b981"
                    strokeWidth="2"
                    strokeDasharray="6 6"
                    className="opacity-70 animate-pulse"
                  />
                )}
              </svg>

              {/* HTML Nodes overlay */}
              {nodes.map(n => {
                const isStartNode = activeRouteStart === n.id;
                const typeColor = n.type === 'spawn' ? 'bg-green-500' : 
                                  n.type === 'loot' ? 'bg-purple-500' :
                                  n.type === 'extract' ? 'bg-red-500' : 'bg-white';
                return (
                  <div
                    key={n.id}
                    className="absolute transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1.5 group z-10"
                    style={{ left: `${n.x}%`, top: `${n.y}%` }}
                  >
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onNodeClick(n.id, e); }}
                      className={`w-3.5 h-3.5 rounded-full border-[2.5px] border-[#0a0a0a] shadow-lg shadow-black/40 transition-all outline-none focus:outline-none ring-0
                        ${mode === 'erase' ? 'bg-red-500 cursor-pointer pointer-events-auto hover:bg-red-400 hover:scale-125' :
                          isStartNode ? 'bg-amber-400 scale-[1.3] pointer-events-auto ring-2 ring-amber-400/30' :
                          mode === 'route' ? 'bg-blue-400 cursor-pointer pointer-events-auto hover:bg-amber-300 hover:scale-[1.2]' :
                          `${typeColor} pointer-events-auto ${mode === 'select' ? 'hover:scale-110 cursor-pointer' : 'cursor-default'}`
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
          </TransformComponent>
        </TransformWrapper>
        </div>
      )}
    </div>
  );
}

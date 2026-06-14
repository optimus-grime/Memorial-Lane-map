import { useState, useRef, ChangeEvent } from 'react';
import { MapStage } from './components/MapStage';
import { LocationNode, RouteEdge, ToolMode, MarkerType } from './types';
import { calculateRoutePath } from './utils/pathfinding';
import { Layers, Target, Waypoints, Eraser, Download, Upload, Image as ImageIcon, Trash2, MousePointer2, Grid, Wand2, BrickWall } from 'lucide-react';

export default function App() {
  const [baseImage, setBaseImage] = useState<string | null>(null);
  const [gridImage, setGridImage] = useState<string | null>(null);
  const [gridOpacity, setGridOpacity] = useState<number>(50);
  const [snapToGrid, setSnapToGrid] = useState(false);
  const [gridCols, setGridCols] = useState(20);
  const [gridRows, setGridRows] = useState(20);
  
  const [mode, setMode] = useState<ToolMode>('select');
  const [markerType, setMarkerType] = useState<MarkerType>('default');
  const [nodes, setNodes] = useState<LocationNode[]>([]);
  const [edges, setEdges] = useState<RouteEdge[]>([]);
  const [activeRouteStart, setActiveRouteStart] = useState<string | null>(null);
  const [blockedCells, setBlockedCells] = useState<Set<string>>(new Set());

  const baseInputRef = useRef<HTMLInputElement>(null);
  const gridInputRef = useRef<HTMLInputElement>(null);
  const fileImportRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (e: ChangeEvent<HTMLInputElement>, setter: React.Dispatch<React.SetStateAction<string | null>>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setter(url);
    }
  };

  const handleAddNode = (x: number, y: number) => {
    const newNode: LocationNode = {
      id: Math.random().toString(36).substring(2, 9),
      x,
      y,
      label: `L-${nodes.length + 1}`,
      type: markerType
    };
    setNodes([...nodes, newNode]);
  };

  const handleToggleObstacle = (cellKey: string, isAdding: boolean) => {
    setBlockedCells(prev => {
      const next = new Set(prev);
      if (isAdding) next.add(cellKey);
      else next.delete(cellKey);
      return next;
    });
  };

  const handleNodeClick = (id: string) => {
    if (mode === 'erase') {
      setNodes(nodes.filter(n => n.id !== id));
      setEdges(edges.filter(e => e.startNodeId !== id && e.endNodeId !== id));
    } else if (mode === 'route') {
      if (!activeRouteStart) {
        setActiveRouteStart(id);
      } else {
        if (activeRouteStart !== id) {
          const exists = edges.find(e => 
            (e.startNodeId === activeRouteStart && e.endNodeId === id) ||
            (e.startNodeId === id && e.endNodeId === activeRouteStart)
          );
          if (!exists) {
            const startNode = nodes.find(n => n.id === activeRouteStart);
            const endNode = nodes.find(n => n.id === id);
            
            let pathPoints = undefined;
            if (startNode && endNode) {
              pathPoints = calculateRoutePath(startNode, endNode, gridCols, gridRows, blockedCells);
            }

            setEdges([...edges, {
              id: Math.random().toString(36).substring(2, 9),
              startNodeId: activeRouteStart,
              endNodeId: id,
              pathPoints
            }]);
          }
        }
        setActiveRouteStart(null); // click again or link closes the link action
      }
    }
  };

  const handleEdgeClick = (id: string) => {
    if (mode === 'erase') {
      setEdges(edges.filter(e => e.id !== id));
    }
  };

  const handleExport = () => {
    const data = { nodes, edges, blockedCells: Array.from(blockedCells) };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tactical-map-data.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (json.nodes && json.edges) {
          setNodes(json.nodes);
          setEdges(json.edges);
          if (json.blockedCells) {
            setBlockedCells(new Set(json.blockedCells));
          }
        }
      } catch (err) {
        alert("Invalid JSON format");
      }
      if (fileImportRef.current) fileImportRef.current.value = "";
    };
    reader.readAsText(file);
  };

  const clearAll = () => {
    if (window.confirm("Clear all nodes and routes?")) {
      setNodes([]);
      setEdges([]);
      setBlockedCells(new Set());
      setActiveRouteStart(null);
    }
  };

  const optimizeRoute = () => {
    if (nodes.length < 2) return;
    
    // Quick nearest-neighbor TSP approximation
    const dist = (n1: LocationNode, n2: LocationNode) => 
      Math.sqrt(Math.pow(n1.x - n2.x, 2) + Math.pow(n1.y - n2.y, 2));

    // Try starting from spawn point if available, else first node created
    let startIdx = nodes.findIndex(n => n.type === 'spawn');
    if (startIdx === -1) startIdx = 0;

    let unvisited = [...nodes];
    let current = unvisited.splice(startIdx, 1)[0];
    const newEdges: RouteEdge[] = [];

    while (unvisited.length > 0) {
      let nearestIdx = 0;
      let minDist = dist(current, unvisited[0]);
      
      for (let i = 1; i < unvisited.length; i++) {
        const d = dist(current, unvisited[i]);
        if (d < minDist) {
          minDist = d;
          nearestIdx = i;
        }
      }
      
      const next = unvisited[nearestIdx];
      
      const pathPoints = calculateRoutePath(current, next, gridCols, gridRows, blockedCells);

      newEdges.push({
        id: Math.random().toString(36).substring(2, 9),
        startNodeId: current.id,
        endNodeId: next.id,
        pathPoints
      });
      
      current = next;
      unvisited.splice(nearestIdx, 1);
    }
    
    setEdges(newEdges);
    setMode('select');
  };

  return (
    <div className="flex h-screen bg-[#050505] text-slate-300 font-sans antialiased overflow-hidden selection:bg-blue-500/30">
      {/* Sidebar Panel */}
      <aside className="w-80 flex-shrink-0 bg-[#0a0a0a] border-r border-slate-800/60 flex flex-col items-stretch z-20 shadow-2xl overflow-y-auto">
        <div className="p-6 border-b border-slate-800/60">
          <h1 className="text-xl font-medium tracking-tight text-white flex items-center gap-2">
            <Layers className="w-5 h-5 text-blue-500" />
            Tactical Planner
          </h1>
          <p className="text-xs text-slate-500 mt-2 font-mono">Map coordination tool</p>
        </div>

        {/* Map Setup */}
        <div className="p-6 border-b border-slate-800/60 flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-mono text-slate-400 uppercase tracking-wider flex justify-between items-center">
              Base Map
              {baseImage && <span className="text-[10px] text-green-500 px-1.5 py-0.5 rounded bg-green-500/10">Loaded</span>}
            </label>
            <button 
              onClick={() => baseInputRef.current?.click()}
              className="flex items-center justify-center gap-2 w-full py-2.5 px-3 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 hover:bg-slate-800/60 transition-all text-sm group"
            >
              <ImageIcon className="w-4 h-4 text-slate-500 group-hover:text-amber-500 transition-colors" />
              {baseImage ? 'Change Base Map' : 'Upload Base Map'}
            </button>
            <input type="file" accept="image/*" className="hidden" ref={baseInputRef} onChange={(e) => handleImageUpload(e, setBaseImage)} />
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-mono text-slate-400 uppercase tracking-wider flex items-center gap-2">
                Grid Overlay
                {gridImage && <span className="text-[10px] text-green-500 px-1.5 py-0.5 rounded bg-green-500/10">Loaded</span>}
              </label>
            </div>
            <button 
              onClick={() => gridInputRef.current?.click()}
              className="flex items-center justify-center gap-2 w-full py-2.5 px-3 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 hover:bg-slate-800/60 transition-all text-sm group"
            >
              <Grid className="w-4 h-4 text-slate-500 group-hover:text-blue-500 transition-colors" />
              {gridImage ? 'Change Grid Image' : 'Upload Grid Image'}
            </button>
            <input type="file" accept="image/*" className="hidden" ref={gridInputRef} onChange={(e) => handleImageUpload(e, setGridImage)} />
            
            {gridImage && (
              <div className="mt-3 flex flex-col gap-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-mono">Grid Opacity</span>
                  <span className="text-slate-300 font-mono">{gridOpacity}%</span>
                </div>
                <input 
                  type="range" 
                  min="0" max="100" 
                  value={gridOpacity} 
                  onChange={(e) => setGridOpacity(Number(e.target.value))}
                  className="w-full accent-blue-500 h-1.5 bg-slate-800 rounded-full appearance-none outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>
            )}
            
            <div className="mt-4 pt-4 border-t border-slate-800/60 flex flex-col gap-3">
              <label className="flex items-center justify-between text-xs font-mono text-slate-400 cursor-pointer group">
                <span className="uppercase tracking-wider group-hover:text-blue-400 transition-colors">Snap to Grid</span>
                <div className={`relative w-8 h-4 rounded-full transition-colors ${snapToGrid ? 'bg-blue-500' : 'bg-slate-700'}`}>
                  <input type="checkbox" className="absolute opacity-0 w-full h-full cursor-pointer" checked={snapToGrid} onChange={e => setSnapToGrid(e.target.checked)} />
                  <div className={`absolute left-0.5 top-0.5 w-3 h-3 bg-white rounded-full transition-transform shadow-sm ${snapToGrid ? 'translate-x-4' : 'translate-x-0'}`} />
                </div>
              </label>
              
              {snapToGrid && (
                <div className="flex gap-2">
                  <div className="flex-1 flex flex-col gap-1">
                    <span className="text-[10px] text-slate-500 font-mono uppercase tracking-wider">Columns</span>
                    <input type="number" min="1" max="200" value={gridCols} onChange={e => setGridCols(Number(e.target.value))} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-300 font-mono focus:border-blue-500 outline-none" />
                  </div>
                  <div className="flex-1 flex flex-col gap-1">
                    <span className="text-[10px] text-slate-500 font-mono uppercase tracking-wider">Rows</span>
                    <input type="number" min="1" max="200" value={gridRows} onChange={e => setGridRows(Number(e.target.value))} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-300 font-mono focus:border-blue-500 outline-none" />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Tools Panel */}
        <div className="p-6 flex-1 flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <label className="text-xs font-mono text-slate-400 uppercase tracking-wider">Canvas Tools</label>
            <span className="text-[10px] text-slate-500 font-mono">Scroll to Zoom</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <ToolButton active={mode === 'select'} onClick={() => { setMode('select'); setActiveRouteStart(null); }} icon={<MousePointer2 className="w-4 h-4" />} label="Select" />
            <ToolButton active={mode === 'point'} onClick={() => { setMode('point'); setActiveRouteStart(null); }} icon={<Target className="w-4 h-4" />} label="Marker" />
            <ToolButton active={mode === 'route'} onClick={() => setMode('route')} icon={<Waypoints className="w-4 h-4" />} label="Route" />
            <ToolButton active={mode === 'obstacle'} onClick={() => { setMode('obstacle'); setActiveRouteStart(null); }} icon={<BrickWall className="w-4 h-4" />} label="Wall" />
            <ToolButton active={mode === 'erase'} onClick={() => { setMode('erase'); setActiveRouteStart(null); }} icon={<Eraser className="w-4 h-4" />} label="Erase" />
          </div>

          {mode === 'point' && (
            <div className="mt-1 flex gap-1.5 p-1.5 bg-slate-900 rounded-lg border border-slate-800">
              <MarkerTypeButton type="default" active={markerType === 'default'} onClick={() => setMarkerType('default')} color="bg-slate-300" label="Def" />
              <MarkerTypeButton type="spawn" active={markerType === 'spawn'} onClick={() => setMarkerType('spawn')} color="bg-green-500" label="Spwn" />
              <MarkerTypeButton type="loot" active={markerType === 'loot'} onClick={() => setMarkerType('loot')} color="bg-purple-500" label="Loot" />
              <MarkerTypeButton type="extract" active={markerType === 'extract'} onClick={() => setMarkerType('extract')} color="bg-red-500" label="Ext" />
            </div>
          )}

          <button 
            onClick={optimizeRoute} 
            disabled={nodes.length < 2} 
            className="mt-2 flex items-center justify-center gap-2 py-2.5 bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 disabled:opacity-30 disabled:cursor-not-allowed text-[11px] uppercase tracking-wider font-medium rounded-lg border border-blue-500/20 hover:border-blue-500/40 transition-all"
          >
            <Wand2 className="w-3.5 h-3.5" /> Optimize Route
          </button>

          <div className="flex justify-between items-center mt-4 p-4 bg-slate-900/50 rounded-xl border border-slate-800/50">
            <div className="flex flex-col">
              <span className="text-2xl font-light text-white">{nodes.length}</span>
              <span className="text-[10px] uppercase tracking-wider text-slate-500 font-mono">Markers</span>
            </div>
            <div className="w-px h-8 bg-slate-800"></div>
            <div className="flex flex-col text-right">
              <span className="text-2xl font-light text-white">{edges.length}</span>
              <span className="text-[10px] uppercase tracking-wider text-slate-500 font-mono">Routes</span>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-6 border-t border-slate-800/60 bg-slate-900/30 flex flex-col gap-3">
          <div className="flex gap-2">
            <button onClick={handleExport} className="flex-1 flex items-center justify-center gap-2 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded transition-colors">
              <Download className="w-3.5 h-3.5" /> Export
            </button>
            <button onClick={() => fileImportRef.current?.click()} className="flex-1 flex items-center justify-center gap-2 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded transition-colors">
              <Upload className="w-3.5 h-3.5" /> Import
            </button>
            <input type="file" accept=".json" className="hidden" ref={fileImportRef} onChange={handleImport} />
          </div>
          
          <button 
            onClick={clearAll}
            disabled={nodes.length === 0}
            className="flex items-center justify-center gap-2 py-2 w-full text-red-400 hover:text-red-300 hover:bg-red-950/30 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed text-xs font-medium rounded transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" /> Clear Data
          </button>
        </div>
      </aside>

      {/* Main Canvas Area */}
      <main className="flex-1 relative cursor-crosshair bg-[url('https://www.transparenttextures.com/patterns/dark-matter.png')] bg-opacity-30">
        <MapStage 
          baseImage={baseImage} 
          gridImage={gridImage} 
          gridOpacity={gridOpacity} 
          mode={mode} 
          nodes={nodes} 
          edges={edges} 
          activeRouteStart={activeRouteStart}
          snapToGrid={snapToGrid}
          gridCols={gridCols}
          gridRows={gridRows}
          blockedCells={blockedCells}
          onToggleObstacle={handleToggleObstacle}
          onAddNode={handleAddNode}
          onNodeClick={handleNodeClick}
          onEdgeClick={handleEdgeClick}
        />

        {/* Status bar */}
        <div className="absolute bottom-4 left-4 right-4 flex justify-between items-center pointer-events-none">
          <div className="bg-[#0a0a0a]/80 backdrop-blur-md px-3 py-1.5 rounded-full border border-slate-800 flex items-center gap-2">
             <div className={`w-2 h-2 rounded-full ${mode === 'obstacle' ? 'bg-indigo-500 animate-pulse' : mode === 'point' ? 'bg-amber-400 animate-pulse' : mode === 'route' ? 'bg-blue-400 animate-pulse' : mode === 'erase' ? 'bg-red-500' : 'bg-green-500'}`} />
             <span className="text-xs text-slate-400 font-mono tracking-wide capitalize">
               {mode} Mode ACTIVE {activeRouteStart && '— SELECT DESTINATION'} {mode === 'obstacle' && '— PAINT ON GRID'}
             </span>
          </div>
        </div>
      </main>
    </div>
  );
}

// Subcomponent for Sidebar Toll Buttons
function ToolButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-2 p-3 text-xs font-mono font-medium rounded-xl transition-all duration-200 border
        ${active 
          ? 'bg-blue-500/10 text-blue-400 border-blue-500/30 shadow-[0_0_15px_rgba(59,130,246,0.1)]' 
          : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
        }
      `}
    >
      {icon}
      {label}
    </button>
  );
}

function MarkerTypeButton({ active, onClick, color, label }: { active: boolean, onClick: () => void, color: string, label: string; type: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center justify-center gap-1.5 flex-1 py-1.5 rounded-md transition-all ${active ? 'bg-slate-800 shadow-inner' : 'hover:bg-slate-800/50'}`}
    >
      <div className={`w-2 h-2 rounded-full ${color} ${active ? 'ring-2 ring-offset-2 ring-offset-[#0a0a0a] ring-slate-400' : ''}`} />
      <span className={`text-[8px] uppercase tracking-wider ${active ? 'text-slate-300' : 'text-slate-500'}`}>{label}</span>
    </button>
  );
}

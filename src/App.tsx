import React, { useState, useRef, ChangeEvent, useMemo, useEffect, useCallback } from 'react';
import { get, set } from 'idb-keyval';
import { MapStage } from './components/MapStage';
import { LocationNode, RouteEdge, ToolMode, MarkerType, LayerData } from './types';
import { calculateRoutePath } from './utils/pathfinding';
import { calculateHeatmapAsync } from './utils/heatmap';
import { Layers, Target, Waypoints, Eraser, Download, Upload, Image as ImageIcon, Trash2, MousePointer2, Grid, Wand2, BrickWall, Battery, Eye, EyeOff, Plus, Radar, Undo2, Redo2 } from 'lucide-react';

export default function App() {
  const [baseImage, setBaseImage] = useState<string | null>(null);
  const [gridImage, setGridImage] = useState<string | null>(null);
  const [gridOpacity, setGridOpacity] = useState<number>(50);
  const [snapToGrid, setSnapToGrid] = useState(false);
  const [gridCols, setGridCols] = useState(20);
  const [gridRows, setGridRows] = useState(20);
  
  const [mode, setMode] = useState<ToolMode>('select');
  const [markerType, setMarkerType] = useState<MarkerType>('default');
  
  const [layers, setLayers] = useState<LayerData[]>([
    { id: 'layer-1', name: 'Phase 1', nodes: [], edges: [], isVisible: true }
  ]);
  const [activeLayerId, setActiveLayerId] = useState<string>('layer-1');
  
  const [activeRouteStart, setActiveRouteStart] = useState<string | null>(null);
  const [blockedCells, setBlockedCells] = useState<Set<string>>(new Set());
  const [isLoaded, setIsLoaded] = useState(false);
  
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [heatmapData, setHeatmapData] = useState<Record<string, number> | null>(null);
  const [isCalculatingHeatmap, setIsCalculatingHeatmap] = useState(false);

  // Undo/Redo State
  const [pastStates, setPastStates] = useState<{layers: LayerData[], activeLayerId: string, blockedCells: string[]}[]>([]);
  const [futureStates, setFutureStates] = useState<{layers: LayerData[], activeLayerId: string, blockedCells: string[]}[]>([]);

  const layersRef = useRef(layers);
  const activeLayerIdRef = useRef(activeLayerId);
  const blockedCellsRef = useRef(blockedCells);
  const pastStatesRef = useRef(pastStates);
  const futureStatesRef = useRef(futureStates);

  useEffect(() => {
    layersRef.current = layers;
    activeLayerIdRef.current = activeLayerId;
    blockedCellsRef.current = blockedCells;
    pastStatesRef.current = pastStates;
    futureStatesRef.current = futureStates;
  }, [layers, activeLayerId, blockedCells, pastStates, futureStates]);

  const commitToHistory = useCallback(() => {
    setPastStates(prev => {
      const stateToSave = {
        layers: JSON.parse(JSON.stringify(layersRef.current)),
        activeLayerId: activeLayerIdRef.current,
        blockedCells: Array.from(blockedCellsRef.current)
      };
      const newPast = [...prev, stateToSave];
      return newPast.slice(-10); // Keep last 10 states
    });
    setFutureStates([]);
  }, []);

  const handleUndo = useCallback(() => {
    const pStates = pastStatesRef.current;
    if (pStates.length === 0) return;
    
    const previousState = pStates[pStates.length - 1];
    const newPast = pStates.slice(0, -1);
    
    const currentState = {
      layers: JSON.parse(JSON.stringify(layersRef.current)),
      activeLayerId: activeLayerIdRef.current,
      blockedCells: Array.from(blockedCellsRef.current)
    };
    
    setPastStates(newPast);
    setFutureStates(prev => [currentState, ...prev]);
    
    setLayers(previousState.layers);
    setActiveLayerId(previousState.activeLayerId);
    setBlockedCells(new Set(previousState.blockedCells));
  }, []);

  const handleRedo = useCallback(() => {
    const fStates = futureStatesRef.current;
    if (fStates.length === 0) return;
    
    const nextState = fStates[0];
    const newFuture = fStates.slice(1);
    
    const currentState = {
      layers: JSON.parse(JSON.stringify(layersRef.current)),
      activeLayerId: activeLayerIdRef.current,
      blockedCells: Array.from(blockedCellsRef.current)
    };
    
    setPastStates(prev => [...prev, currentState]);
    setFutureStates(newFuture);
    
    setLayers(nextState.layers);
    setActiveLayerId(nextState.activeLayerId);
    setBlockedCells(new Set(nextState.blockedCells));
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo]);

  const activeLayer = layers.find(l => l.id === activeLayerId) || layers[0];
  const nodes = activeLayer.nodes;
  const edges = activeLayer.edges;
  
  const handleToggleHeatmap = async () => {
    if (showHeatmap) {
      setShowHeatmap(false);
      return;
    }
    
    setIsCalculatingHeatmap(true);
    setShowHeatmap(true);
    // calculate
    try {
      const data = await calculateHeatmapAsync(gridCols, gridRows, blockedCells);
      setHeatmapData(data);
    } catch(err) {
      console.error(err);
    } finally {
      setIsCalculatingHeatmap(false);
    }
  };

  const updateActiveLayer = (updates: Partial<LayerData>, skipHistory = false) => {
    if (!skipHistory) commitToHistory();
    setLayers(prev => prev.map(l => l.id === activeLayerId ? { ...l, ...updates } : l));
  };

  const baseInputRef = useRef<HTMLInputElement>(null);
  const gridInputRef = useRef<HTMLInputElement>(null);
  const fileImportRef = useRef<HTMLInputElement>(null);

  // Load from local storage on initial mount
  useEffect(() => {
    const loadState = async () => {
      try {
        const json = await get('tactical-planner-save');
        if (json) {
          if (json.layers) {
            setLayers(json.layers);
            if (json.activeLayerId) setActiveLayerId(json.activeLayerId);
          } else if (json.nodes && json.edges) {
            // Legacy check
            setLayers([{ id: 'layer-1', name: 'Phase 1', nodes: json.nodes, edges: json.edges, isVisible: true }]);
          }
          
          if (json.blockedCells) setBlockedCells(new Set(json.blockedCells));
          if (json.gridCols) setGridCols(json.gridCols);
          if (json.gridRows) setGridRows(json.gridRows);
          if (json.snapToGrid !== undefined) setSnapToGrid(json.snapToGrid);
          if (json.gridOpacity !== undefined) setGridOpacity(json.gridOpacity);
          if (json.baseImage) setBaseImage(json.baseImage);
          if (json.gridImage) setGridImage(json.gridImage);
        }
      } catch (e) {
        console.error("Failed to load save", e);
      }
      setIsLoaded(true);
    };
    
    // Attempt to migrate from localStorage if IndexedDB is empty
    const migrateFromLocal = async () => {
      const localSaved = localStorage.getItem('tactical-planner-save');
      if (localSaved) {
        try {
          const parsed = JSON.parse(localSaved);
          await set('tactical-planner-save', parsed);
          localStorage.removeItem('tactical-planner-save');
        } catch (e) {
          console.error("Migration failed", e);
        }
      }
      loadState();
    };

    migrateFromLocal();
  }, []);

  // Auto-save to local storage when state changes
  useEffect(() => {
    if (!isLoaded) return;
    const data = {
      layers,
      activeLayerId,
      blockedCells: Array.from(blockedCells),
      gridCols,
      gridRows,
      snapToGrid,
      gridOpacity,
      baseImage,
      gridImage
    };
    
    set('tactical-planner-save', data).catch(e => {
      console.warn("Storage quota exceeded or error saving", e);
    });
  }, [layers, activeLayerId, blockedCells, gridCols, gridRows, snapToGrid, gridOpacity, baseImage, gridImage, isLoaded]);

  const handleImageUpload = (e: ChangeEvent<HTMLInputElement>, setter: React.Dispatch<React.SetStateAction<string | null>>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setter(event.target?.result as string);
      };
      reader.readAsDataURL(file);
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
    updateActiveLayer({ nodes: [...nodes, newNode] });
  };

  const handleToggleObstacle = (cellKey: string, isAdding: boolean) => {
    commitToHistory();
    setBlockedCells(prev => {
      const next = new Set(prev);
      if (isAdding) next.add(cellKey);
      else next.delete(cellKey);
      return next;
    });
  };

  const handleNodeClick = (id: string) => {
    if (mode === 'erase') {
      updateActiveLayer({
        nodes: nodes.filter(n => n.id !== id),
        edges: edges.filter(e => e.startNodeId !== id && e.endNodeId !== id)
      });
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

            updateActiveLayer({
              edges: [...edges, {
                id: Math.random().toString(36).substring(2, 9),
                startNodeId: activeRouteStart,
                endNodeId: id,
                pathPoints
              }]
            });
          }
        }
        setActiveRouteStart(null); // click again or link closes the link action
      }
    }
  };

  const handleEdgeClick = (id: string) => {
    if (mode === 'erase') {
      updateActiveLayer({ edges: edges.filter(e => e.id !== id) });
    }
  };

  const handleExport = () => {
    const data = { 
      layers,
      activeLayerId,
      blockedCells: Array.from(blockedCells),
      gridCols,
      gridRows,
      gridOpacity,
      snapToGrid,
      baseImage,
      gridImage
    };
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
        commitToHistory();
        if (json.layers) {
          setLayers(json.layers);
          if (json.activeLayerId) setActiveLayerId(json.activeLayerId);
        } else if (json.nodes && json.edges) {
          setLayers([{ id: 'layer-1', name: 'Phase 1', nodes: json.nodes, edges: json.edges, isVisible: true }]);
        }
        
        if (json.blockedCells) {
          setBlockedCells(new Set(json.blockedCells));
        }
        if (json.gridCols) setGridCols(json.gridCols);
        if (json.gridRows) setGridRows(json.gridRows);
        if (json.gridOpacity !== undefined) setGridOpacity(json.gridOpacity);
        if (json.snapToGrid !== undefined) setSnapToGrid(json.snapToGrid);
        if (json.baseImage) setBaseImage(json.baseImage);
        if (json.gridImage) setGridImage(json.gridImage);
      } catch (err) {
        alert("Invalid JSON format");
      }
      if (fileImportRef.current) fileImportRef.current.value = "";
    };
    reader.readAsText(file);
  };

  const clearAll = () => {
    if (window.confirm("Clear all layers and walls?")) {
      commitToHistory();
      setLayers([{ id: 'layer-1', name: 'Phase 1', nodes: [], edges: [], isVisible: true }]);
      setActiveLayerId('layer-1');
      setBlockedCells(new Set());
      setActiveRouteStart(null);
    }
  };

  const optimizeRoute = () => {
    if (nodes.length < 2) return;
    
    commitToHistory();
    // Quick nearest-neighbor TSP approximation
    const dist = (n1: LocationNode, n2: LocationNode) => 
      Math.sqrt(Math.pow(n1.x - n2.x, 2) + Math.pow(n1.y - n2.y, 2));

    // Try starting from spawn point if available, else first node created
    let startIdx = nodes.findIndex(n => n.type === 'workbench');
    if (startIdx === -1) startIdx = 0;

    const optStartNode = nodes[startIdx];

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
    
    // Auto-complete the loop back to the first node (workbench)
    if (nodes.length > 2) {
      const returnPathPoints = calculateRoutePath(current, optStartNode, gridCols, gridRows, blockedCells);
      newEdges.push({
        id: Math.random().toString(36).substring(2, 9),
        startNodeId: current.id,
        endNodeId: optStartNode.id,
        pathPoints: returnPathPoints
      });
    }

    updateActiveLayer({ edges: newEdges });
    setMode('select');
  };

  const totalDistance = useMemo(() => {
    let dist = 0;
    edges.forEach(edge => {
      if (edge.pathPoints && edge.pathPoints.length > 1) {
        for (let i = 1; i < edge.pathPoints.length; i++) {
          const p1 = edge.pathPoints[i-1];
          const p2 = edge.pathPoints[i];
          dist += Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
        }
      } else {
        const startNode = nodes.find(n => n.id === edge.startNodeId);
        const endNode = nodes.find(n => n.id === edge.endNodeId);
        if (startNode && endNode) {
          dist += Math.sqrt(Math.pow(startNode.x - endNode.x, 2) + Math.pow(startNode.y - endNode.y, 2));
        }
      }
    });
    return dist;
  }, [edges, nodes]);

  return (
    <div className="flex flex-col h-screen bg-[#050505] text-slate-300 font-sans antialiased overflow-hidden selection:bg-blue-500/30">
      {/* Header / Top Toolbar */}
      <header className="bg-[#0a0a0a] border-b border-slate-800/60 flex flex-col z-20 flex-shrink-0 shadow-lg relative">
        {/* Top Row: Title and Global Action */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800/60">
          <div className="flex items-center gap-3">
            <Layers className="w-5 h-5 text-blue-500" />
            <h1 className="text-base font-medium tracking-tight text-white hidden sm:block">Tactical Planner</h1>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleExport} className="flex items-center gap-1.5 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] uppercase tracking-wider font-medium rounded transition-colors">
              <Download className="w-3.5 h-3.5" /> Export
            </button>
            <button onClick={() => fileImportRef.current?.click()} className="flex items-center gap-1.5 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] uppercase tracking-wider font-medium rounded transition-colors">
              <Upload className="w-3.5 h-3.5" /> Import
            </button>
            <input type="file" accept=".json" className="hidden" ref={fileImportRef} onChange={handleImport} />
            <div className="w-px h-4 bg-slate-700 mx-1"></div>
            <button onClick={clearAll} disabled={nodes.length === 0} className="flex items-center gap-1.5 px-3 py-1 text-red-400 hover:text-red-300 hover:bg-red-950/30 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed text-[11px] uppercase tracking-wider font-medium rounded transition-colors">
              <Trash2 className="w-3.5 h-3.5" /> Clear
            </button>
          </div>
        </div>

        {/* Bottom Row: Tools and Configuration */}
        <div className="flex items-center gap-4 px-4 py-2.5 overflow-x-auto hide-scrollbar">
          
          {/* Map & Grid Config */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={() => baseInputRef.current?.click()} className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-slate-900 border border-slate-800 hover:border-slate-700 hover:bg-slate-800/60 transition-all font-mono text-[11px] uppercase text-slate-300">
               <ImageIcon className="w-3.5 h-3.5 text-slate-500" />
               <span className="hidden xl:inline">{baseImage ? 'Map Loaded' : 'Base Map'}</span>
            </button>
            <input type="file" accept="image/*" className="hidden" ref={baseInputRef} onChange={(e) => handleImageUpload(e, setBaseImage)} />

            <button onClick={() => gridInputRef.current?.click()} className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-slate-900 border border-slate-800 hover:border-slate-700 hover:bg-slate-800/60 transition-all font-mono text-[11px] uppercase text-slate-300">
               <Grid className="w-3.5 h-3.5 text-slate-500" />
               <span className="hidden xl:inline">{gridImage ? 'Grid Loaded' : 'Grid Map'}</span>
            </button>
            <input type="file" accept="image/*" className="hidden" ref={gridInputRef} onChange={(e) => handleImageUpload(e, setGridImage)} />
            
            {gridImage && (
              <div className="flex items-center gap-2 w-20 ml-1">
                <input type="range" min="0" max="100" value={gridOpacity} onChange={(e) => setGridOpacity(Number(e.target.value))} className="w-full accent-blue-500 h-1 bg-slate-800 rounded-full appearance-none outline-none" />
              </div>
            )}
          </div>

          <div className="w-px h-5 bg-slate-800"></div>

          {/* Snap Config */}
          <div className="flex items-center gap-2 flex-shrink-0 px-2 py-1 rounded bg-slate-900/50 border border-slate-800/40">
            <label className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-slate-400 cursor-pointer">
               <div className={`relative w-6 h-3 rounded-full transition-colors ${snapToGrid ? 'bg-blue-500' : 'bg-slate-700'}`}>
                 <input type="checkbox" className="absolute opacity-0 w-full h-full cursor-pointer" checked={snapToGrid} onChange={e => setSnapToGrid(e.target.checked)} />
                 <div className={`absolute left-[2px] top-[2px] w-2 h-2 bg-white rounded-full transition-transform shadow-sm ${snapToGrid ? 'translate-x-3' : 'translate-x-0'}`} />
               </div>
               Snap
            </label>
            {snapToGrid && (
              <div className="flex items-center gap-1 text-[11px] font-mono text-slate-400 ml-1">
                <input type="number" min="1" max="200" value={gridCols} onChange={e => setGridCols(Number(e.target.value))} className="w-9 h-5 bg-slate-900 border border-slate-700 rounded text-center px-0.5 focus:border-blue-500 outline-none" />
                <span>x</span>
                <input type="number" min="1" max="200" value={gridRows} onChange={e => setGridRows(Number(e.target.value))} className="w-9 h-5 bg-slate-900 border border-slate-700 rounded text-center px-0.5 focus:border-blue-500 outline-none" />
              </div>
            )}
          </div>

          <div className="w-px h-5 bg-slate-800"></div>

          {/* Drawing Tools */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <ToolButton active={mode === 'select'} onClick={() => { setMode('select'); setActiveRouteStart(null); }} icon={<MousePointer2 className="w-4 h-4" />} label="Select" />
            <ToolButton active={mode === 'point'} onClick={() => { setMode('point'); setActiveRouteStart(null); }} icon={<Target className="w-4 h-4" />} label="Marker" />
            <ToolButton active={mode === 'route'} onClick={() => setMode('route')} icon={<Waypoints className="w-4 h-4" />} label="Route" />
            <ToolButton active={mode === 'obstacle'} onClick={() => { setMode('obstacle'); setActiveRouteStart(null); }} icon={<BrickWall className="w-4 h-4" />} label="Wall" />
            <ToolButton active={mode === 'erase'} onClick={() => { setMode('erase'); setActiveRouteStart(null); }} icon={<Eraser className="w-4 h-4" />} label="Erase" />
          </div>

          {mode === 'point' && (
            <>
              <div className="w-px h-5 bg-slate-800"></div>
              <div className="flex items-center gap-1 p-1 bg-slate-900/80 rounded border border-slate-800 flex-shrink-0">
                <MarkerTypeButton type="default" active={markerType === 'default'} onClick={() => setMarkerType('default')} color="bg-slate-300" label="Def" />
                <MarkerTypeButton type="workbench" active={markerType === 'workbench'} onClick={() => setMarkerType('workbench')} color="bg-blue-500" label="Bench" />
                <MarkerTypeButton type="bitecoin" active={markerType === 'bitecoin'} onClick={() => setMarkerType('bitecoin')} color="bg-amber-500" label="Coin" />
                <MarkerTypeButton type="recipe" active={markerType === 'recipe'} onClick={() => setMarkerType('recipe')} color="bg-purple-500" label="Recp" />
                <MarkerTypeButton type="booster" active={markerType === 'booster'} onClick={() => setMarkerType('booster')} color="bg-green-400" label="Boost" />
              </div>
            </>
          )}

          <div className="w-px h-5 bg-slate-800 ml-auto"></div>

          {/* Undo Tools */}
          <div className="flex items-center gap-1 flex-shrink-0 bg-slate-900/50 px-1 py-1 rounded-lg border border-slate-800">
             <button
                onClick={handleUndo}
                disabled={pastStates.length === 0}
                title="Undo (Ctrl+Z)"
                className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400"
             >
                <Undo2 className="w-3.5 h-3.5" />
             </button>
             <button
                onClick={handleRedo}
                disabled={futureStates.length === 0}
                title="Redo (Ctrl+Shift+Z)"
                className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400"
             >
                <Redo2 className="w-3.5 h-3.5" />
             </button>
          </div>

          <div className="w-px h-5 bg-slate-800"></div>

          {/* Layer Controls */}
          <div className="flex items-center gap-1.5 flex-shrink-0 bg-slate-900/50 px-2 py-1.5 rounded-lg border border-slate-800">
            <div className="flex items-center gap-2 mr-1">
              <select
                value={activeLayerId}
                onChange={(e) => {
                  // Not strictly a map modification, but useful to save history when switching layers.
                  commitToHistory();
                  setActiveLayerId(e.target.value);
                }}
                className="bg-[#0a0a0a] border border-slate-700 rounded text-[10px] text-white px-2 py-1 outline-none focus:border-blue-500 font-mono tracking-wider uppercase appearance-none"
              >
                {layers.map(l => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>
            
            <button 
              onClick={() => updateActiveLayer({ isVisible: !activeLayer.isVisible })}
              title={activeLayer.isVisible ? "Hide Layer" : "Show Layer"}
              className={`p-1 rounded hover:bg-slate-800 transition-colors ${activeLayer.isVisible ? 'text-blue-400' : 'text-slate-600'}`}
            >
              {activeLayer.isVisible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            </button>

            <button 
              onClick={() => {
                commitToHistory();
                const newId = `layer-${Date.now()}`;
                setLayers([...layers, { id: newId, name: `Phase ${layers.length + 1}`, nodes: [], edges: [], isVisible: true }]);
                setActiveLayerId(newId);
              }}
              title="Add Layer"
              className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="w-px h-5 bg-slate-800"></div>

          {/* Heatmap Tool */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={handleToggleHeatmap}
              disabled={isCalculatingHeatmap}
              className={`px-3 py-1.5 rounded-lg border flex items-center gap-2 text-xs font-mono transition-colors ${
                showHeatmap 
                  ? 'bg-amber-500/20 border-amber-500/50 text-amber-500' 
                  : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'
              } ${(isCalculatingHeatmap) && 'opacity-50 cursor-wait'}`}
            >
              <Radar className={`w-4 h-4 ${isCalculatingHeatmap ? 'animate-spin' : ''}`} />
              {isCalculatingHeatmap ? 'CALCULATING...' : 'SPAWN HEATMAP'}
            </button>
          </div>

          <div className="w-px h-5 bg-slate-800"></div>

          {/* Stats & Actions */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="flex items-center gap-3 text-[11px] uppercase tracking-widest font-mono bg-slate-900/50 px-2.5 py-1.5 rounded-lg border border-slate-800">
               <div className="flex items-center gap-1.5"><span className="text-white text-xs">{nodes.length}</span><span className="text-slate-500">M</span></div>
               <div className="w-px h-2.5 bg-slate-700"></div>
               <div className="flex items-center gap-1.5"><span className="text-white text-xs">{edges.length}</span><span className="text-slate-500">R</span></div>
               <div className="w-px h-2.5 bg-slate-700"></div>
               <div className="flex items-center gap-1 text-emerald-400"><Battery className="w-3 h-3 text-emerald-500" /><span className="text-xs">{Math.round(totalDistance * 10)}</span><span className="text-emerald-700">u</span></div>
            </div>
            
            <button 
              onClick={optimizeRoute} 
              disabled={nodes.length < 2} 
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 disabled:opacity-30 disabled:cursor-not-allowed text-[11px] uppercase tracking-wider font-medium rounded-lg border border-blue-500/20 hover:border-blue-500/40 transition-all font-mono"
            >
              <Wand2 className="w-3.5 h-3.5" /> Optimize
            </button>
          </div>
        </div>
      </header>

      {/* Main Canvas Area */}
      <main className="flex-1 relative cursor-crosshair bg-[url('https://www.transparenttextures.com/patterns/dark-matter.png')] bg-opacity-30">
        <MapStage 
          baseImage={baseImage} 
          gridImage={gridImage} 
          gridOpacity={gridOpacity} 
          mode={mode} 
          layers={layers} 
          activeLayerId={activeLayerId} 
          activeRouteStart={activeRouteStart}
          snapToGrid={snapToGrid}
          gridCols={gridCols}
          gridRows={gridRows}
          blockedCells={blockedCells}
          heatmapData={showHeatmap ? heatmapData : null}
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
      className={`flex items-center gap-1.5 px-2 py-1.5 text-[11px] uppercase tracking-wider font-mono font-medium rounded-md transition-all duration-200 border
        ${active 
          ? 'bg-blue-500/10 text-blue-400 border-blue-500/30' 
          : 'bg-transparent border-transparent text-slate-400 hover:bg-slate-800 hover:text-slate-200'
        }
      `}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function MarkerTypeButton({ active, onClick, color, label }: { active: boolean, onClick: () => void, color: string, label: string; type: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-2 py-1 rounded transition-all ${active ? 'bg-slate-800 shadow-inner' : 'hover:bg-slate-800/50'}`}
    >
      <div className={`w-2 h-2 rounded-full ${color} flex-shrink-0 ${active ? 'ring-2 ring-offset-2 ring-offset-[#0a0a0a] ring-slate-400' : ''}`} />
      <span className={`text-[9px] uppercase tracking-wider font-mono hidden md:inline ${active ? 'text-slate-300' : 'text-slate-500'}`}>{label}</span>
    </button>
  );
}

export interface Point { x: number; y: number; }

export function calculateRoutePath(
  startNode: Point,
  endNode: Point,
  gridCols: number,
  gridRows: number,
  blockedCells: Set<string>
): Point[] {
  // Edge case safety
  if (gridCols <= 0 || gridRows <= 0) return [startNode, endNode];

  const stepX = 100 / gridCols;
  const stepY = 100 / gridRows;

  const getColRow = (x: number, y: number) => {
    let col = Math.floor(x / stepX);
    let row = Math.floor(y / stepY);
    col = Math.max(0, Math.min(gridCols - 1, col));
    row = Math.max(0, Math.min(gridRows - 1, row));
    return { col, row };
  };

  const startCell = getColRow(startNode.x, startNode.y);
  const endCell = getColRow(endNode.x, endNode.y);

  const openSet = new Set<string>();
  const closedSet = new Set<string>();
  const cameFrom = new Map<string, string>();
  const gScore = new Map<string, number>();
  const fScore = new Map<string, number>();

  const cellKey = (c: number, r: number) => `${c},${r}`;
  const startKey = cellKey(startCell.col, startCell.row);
  const endKey = cellKey(endCell.col, endCell.row);

  openSet.add(startKey);
  gScore.set(startKey, 0);

  const heuristic = (c1: number, c2: number, r1: number, r2: number) => {
    const dx = Math.abs(c1 - c2);
    const dy = Math.abs(r1 - r2);
    return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
  };

  fScore.set(startKey, heuristic(startCell.col, endCell.col, startCell.row, endCell.row));

  while (openSet.size > 0) {
    let currentKey = "";
    let lowestF = Infinity;
    for (const key of openSet) {
      const score = fScore.get(key) ?? Infinity;
      if (score < lowestF) {
        lowestF = score;
        currentKey = key;
      }
    }

    if (currentKey === endKey) {
      const pathKeys = [currentKey];
      let curr = currentKey;
      while (cameFrom.has(curr)) {
        curr = cameFrom.get(curr)!;
        pathKeys.unshift(curr);
      }

      const result: Point[] = [];
      result.push({ x: startNode.x, y: startNode.y });

      // Add middle waypoints going through grid cell centers
      for (let i = 1; i < pathKeys.length - 1; i++) {
        const [c, r] = pathKeys[i].split(',').map(Number);
        result.push({ x: (c + 0.5) * stepX, y: (r + 0.5) * stepY });
      }

      if (pathKeys.length > 0) {
        result.push({ x: endNode.x, y: endNode.y });
      }
      
      return result;
    }

    openSet.delete(currentKey);
    closedSet.add(currentKey);

    const [c, r] = currentKey.split(',').map(Number);

    const dirs = [
      [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]
    ];

    for (const [dc, dr] of dirs) {
      const nc = c + dc;
      const nr = r + dr;
      const nKey = cellKey(nc, nr);

      if (nc < 0 || nc >= gridCols || nr < 0 || nr >= gridRows) continue;
      if (closedSet.has(nKey)) continue;

      if (blockedCells.has(nKey) && nKey !== endKey && nKey !== startKey) continue;

      // Prevent moving diagonally through a wall corner directly
      if (Math.abs(dc) === 1 && Math.abs(dr) === 1) {
        if (blockedCells.has(cellKey(nc, r)) && blockedCells.has(cellKey(c, nr))) {
          continue;
        }
      }

      const moveCost = (dc === 0 || dr === 0) ? 1 : Math.SQRT2;
      const tentativeG = (gScore.get(currentKey) ?? Infinity) + moveCost;

      if (tentativeG < (gScore.get(nKey) ?? Infinity)) {
        cameFrom.set(nKey, currentKey);
        gScore.set(nKey, tentativeG);
        fScore.set(nKey, tentativeG + heuristic(nc, endCell.col, nr, endCell.row));
        if (!openSet.has(nKey)) {
          openSet.add(nKey);
        }
      }
    }
  }

  // Fallback to a straight line if completely walled off/unreachable
  return [startNode, endNode];
}

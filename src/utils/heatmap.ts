export function calculateHeatmap(
  gridCols: number,
  gridRows: number,
  blockedCells: Set<string>
): Record<string, number> {
  const getNeighbors = (c: number, r: number) => {
    const neighbors = [];
    if (c > 0 && !blockedCells.has(`${c - 1},${r}`)) neighbors.push({ c: c - 1, r });
    if (c < gridCols - 1 && !blockedCells.has(`${c + 1},${r}`)) neighbors.push({ c: c + 1, r });
    if (r > 0 && !blockedCells.has(`${c},${r - 1}`)) neighbors.push({ c, r: r - 1 });
    if (r < gridRows - 1 && !blockedCells.has(`${c},${r + 1}`)) neighbors.push({ c, r: r + 1 });
    return neighbors;
  };

  const openCells: {c: number, r: number}[] = [];
  for (let c = 0; c < gridCols; c++) {
    for (let r = 0; r < gridRows; r++) {
      if (!blockedCells.has(`${c},${r}`)) {
        openCells.push({c, r});
      }
    }
  }

  if (openCells.length === 0) return {};

  const averageDistances: Record<string, number> = {};
  let minAvgDist = Infinity;
  let maxAvgDist = -Infinity;

  for (const startCell of openCells) {
    const startKey = `${startCell.c},${startCell.r}`;
    
    const distances: Record<string, number> = {};
    const queue: {c: number, r: number, d: number}[] = [];
    
    queue.push({c: startCell.c, r: startCell.r, d: 0});
    distances[startKey] = 0;
    
    let head = 0;
    let sumDistances = 0;
    let reachableCount = 0;
    
    while (head < queue.length) {
      const {c, r, d} = queue[head++];
      
      const neighbors = getNeighbors(c, r);
      for (const n of neighbors) {
        const nKey = `${n.c},${n.r}`;
        if (distances[nKey] === undefined) {
          distances[nKey] = d + 1;
          queue.push({c: n.c, r: n.r, d: d + 1});
          sumDistances += d + 1;
          reachableCount++;
        }
      }
    }
    
    const avgDist = reachableCount > 0 ? sumDistances / reachableCount : 0;
    averageDistances[startKey] = avgDist;
    
    if (reachableCount > 0) {
      if (avgDist < minAvgDist) minAvgDist = avgDist;
      if (avgDist > maxAvgDist) maxAvgDist = avgDist;
    }
  }

  const heatmap: Record<string, number> = {};
  const range = maxAvgDist - minAvgDist;
  
  if (range === 0) {
    for (const startCell of openCells) {
      heatmap[`${startCell.c},${startCell.r}`] = 1;
    }
  } else {
    for (const startCell of openCells) {
      const key = `${startCell.c},${startCell.r}`;
      if (averageDistances[key] !== undefined) {
        // Higher score (1) is better (shorter average distance)
        heatmap[key] = 1 - ((averageDistances[key] - minAvgDist) / range);
      }
    }
  }

  return heatmap;
}

export function calculateHeatmapAsync(
  gridCols: number,
  gridRows: number,
  blockedCells: Set<string>
): Promise<Record<string, number>> {
  return new Promise((resolve) => {
    // We use setTimeout to yield the main thread so the UI can show a "Calculating..." state
    setTimeout(() => {
      resolve(calculateHeatmap(gridCols, gridRows, blockedCells));
    }, 50);
  });
}

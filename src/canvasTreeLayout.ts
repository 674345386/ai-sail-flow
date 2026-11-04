type LayoutNode = { id: string; width: number; height: number };
type LayoutEdge = { source: string; target: string };
type Point = { x: number; y: number };

// Reserve each subtree's full width, then center each parent over its children.
export function layoutCanvasTree(nodes: LayoutNode[], edges: LayoutEdge[]): Record<string, Point> {
  const horizontalGap = 100, verticalGap = 120, origin = 100;
  const footer = nodes.find(node => node.id === 'timeline');
  const treeNodes = nodes.filter(node => node !== footer);
  const byId = new Map(treeNodes.map(node => [node.id, node]));
  const children = new Map(treeNodes.map(node => [node.id, [] as string[]]));
  const parents = new Map<string, string>();

  for (const { source, target } of edges) {
    if (!byId.has(source) || !byId.has(target) || source === target || parents.has(target)) continue;
    let ancestor: string | undefined = source;
    while (ancestor && ancestor !== target) ancestor = parents.get(ancestor);
    if (ancestor === target) continue;
    parents.set(target, source);
    children.get(source)!.push(target);
  }

  const roots = treeNodes.filter(node => !parents.has(node.id));
  const widths = new Map<string, number>();
  const levelHeights: number[] = [];
  function measure(id: string, depth: number): number {
    const node = byId.get(id)!;
    levelHeights[depth] = Math.max(levelHeights[depth] || 0, node.height);
    const childIds = children.get(id)!;
    const childrenWidth = childIds.reduce((sum, child) => sum + measure(child, depth + 1), 0) + Math.max(0, childIds.length - 1) * horizontalGap;
    const width = Math.max(node.width, childrenWidth);
    widths.set(id, width);
    return width;
  }
  roots.forEach(root => measure(root.id, 0));
  const levelY: number[] = [];
  levelHeights.forEach((height, depth) => { levelY[depth] = depth ? levelY[depth - 1] + levelHeights[depth - 1] + verticalGap : origin; });

  const positions: Record<string, Point> = {};
  function place(id: string, left: number, depth: number) {
    const node = byId.get(id)!, childIds = children.get(id)!, width = widths.get(id)!;
    positions[id] = { x: left + (width - node.width) / 2, y: levelY[depth] };
    const childrenWidth = childIds.reduce((sum, child) => sum + widths.get(child)!, 0) + Math.max(0, childIds.length - 1) * horizontalGap;
    let childLeft = left + (width - childrenWidth) / 2;
    for (const child of childIds) { place(child, childLeft, depth + 1); childLeft += widths.get(child)! + horizontalGap; }
  }
  let left = origin;
  for (const root of roots) { place(root.id, left, 0); left += widths.get(root.id)! + horizontalGap; }
  if (footer) {
    const forestWidth = roots.length ? left - origin - horizontalGap : footer.width;
    const bottom = levelHeights.length ? levelY.at(-1)! + levelHeights.at(-1)! : origin - verticalGap;
    positions[footer.id] = { x: origin + (forestWidth - footer.width) / 2, y: bottom + verticalGap };
  }
  return positions;
}

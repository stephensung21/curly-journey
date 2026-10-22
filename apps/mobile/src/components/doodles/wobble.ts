/** Deterministic PRNG so a doodle looks the same on every render. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MIDLINE = 7; // path box is 14 high
const round = (n: number) => Number(n.toFixed(2));

/**
 * A hand-drawn horizontal stroke as an SVG path `d`. Joins 5 points with
 * horizontal-tangent cubics, so control points never leave the ±amplitude band.
 */
export function wobblePath(width: number, opts: { seed: number; amplitude?: number }): string {
  const amplitude = opts.amplitude ?? 3;
  const rand = mulberry32(opts.seed);
  const x0 = 3;
  const x1 = width - 3;
  const points = Array.from({ length: 5 }, (_, i) => ({
    x: round(x0 + ((x1 - x0) * i) / 4),
    y: round(MIDLINE + (rand() * 2 - 1) * amplitude),
  }));
  let d = `M${points[0]!.x},${points[0]!.y}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]!;
    const p = points[i]!;
    const dx = (p.x - prev.x) / 3;
    d += ` C${round(prev.x + dx)},${prev.y} ${round(p.x - dx)},${p.y} ${p.x},${p.y}`;
  }
  return d;
}

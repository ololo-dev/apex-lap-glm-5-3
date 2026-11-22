// Rectangle-rectangle overlap (SAT) for two cars on the flat ground: each
// car is an oriented box, half long and half wide. Returns the smallest push
// that separates them, or null when they do not touch. Deterministic.

export interface OBB {
  x: number
  z: number
  heading: number
  hx: number
  hz: number
}

export interface Push {
  /** Unit normal pointing from a to b. */
  nx: number
  nz: number
  /** Penetration depth in metres. */
  pen: number
}

/** Half-extent of a box along an axis. */
function extent(box: OBB, ux: number, uz: number): number {
  const f = Math.abs(Math.cos(box.heading) * ux + Math.sin(box.heading) * uz)
  const r = Math.abs(-Math.sin(box.heading) * ux + Math.cos(box.heading) * uz)
  return f * box.hx + r * box.hz
}

export function satPush(a: OBB, b: OBB): Push | null {
  const dx = b.x - a.x
  const dz = b.z - a.z
  if (dx === 0 && dz === 0) {
    // Cars exactly stacked (never in practice): push a's forward.
    return { nx: Math.cos(a.heading), nz: Math.sin(a.heading), pen: a.hx + b.hx }
  }
  const axes: [number, number][] = [
    [Math.cos(a.heading), Math.sin(a.heading)],
    [-Math.sin(a.heading), Math.cos(a.heading)],
    [Math.cos(b.heading), Math.sin(b.heading)],
    [-Math.sin(b.heading), Math.cos(b.heading)],
  ]
  let best: Push | null = null
  for (const [ux, uz] of axes) {
    const dist = dx * ux + dz * uz
    const overlap = extent(a, ux, uz) + extent(b, ux, uz) - Math.abs(dist)
    if (overlap <= 0) return null
    if (!best || overlap < best.pen) {
      const s = dist < 0 ? -1 : 1
      best = { nx: ux * s, nz: uz * s, pen: overlap }
    }
  }
  return best
}

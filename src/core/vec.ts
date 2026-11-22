// Minimal 2D vector math for the ground plane. x runs east, z runs south.

export interface Vec2 {
  x: number
  z: number
}

export const vec = (x: number, z: number): Vec2 => ({ x, z })

export const add = (a: Vec2, b: Vec2): Vec2 => vec(a.x + b.x, a.z + b.z)
export const sub = (a: Vec2, b: Vec2): Vec2 => vec(a.x - b.x, a.z - b.z)
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.z * b.z
export const len = (a: Vec2): number => Math.hypot(a.x, a.z)
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.z - b.z)
export const scale = (a: Vec2, s: number): Vec2 => vec(a.x * s, a.z * s)

/** Unit vector, or (1, 0) for the zero vector. */
export const norm = (a: Vec2): Vec2 => {
  const l = len(a)
  return l < 1e-9 ? vec(1, 0) : scale(a, 1 / l)
}

/** Rotate a heading by +90 degrees: the right-hand side of the direction. */
export const perp = (a: Vec2): Vec2 => vec(-a.z, a.x)

export const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

export const wrapAngle = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a))

export const lerpAngle = (a: number, b: number, t: number): number => a + wrapAngle(b - a) * t

/** Deterministic PRNG for the scenery; the rules themselves never use chance. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

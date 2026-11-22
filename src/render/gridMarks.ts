import * as THREE from 'three'
import { gridPose } from '../core/race'
import type { Track } from '../core/track'

// The grid: white slot frames behind the start line, two by two — the four
// cars stand in them during the countdown.

const SLOT_LONG = 4.8
const SLOT_HALF_WIDE = 1.2

export function buildGridMarks(track: Track, slots: number): THREE.Group {
  const group = new THREE.Group()
  const mat = new THREE.MeshBasicMaterial({ color: 0xe9e9e9 })

  const bar = (x: number, z: number, w: number, d: number, rotY: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.02, d), mat)
    m.position.set(x, 0.13, z)
    m.rotation.y = rotY
    group.add(m)
  }

  for (let slot = 0; slot < slots; slot++) {
    const pose = gridPose(track, slot)
    const cos = Math.cos(pose.heading)
    const sin = Math.sin(pose.heading)
    // local (alongTrack, lateral) -> world
    const at = (fwd: number, lat: number) => ({
      x: pose.x + cos * fwd - sin * lat,
      z: pose.z + sin * fwd + cos * lat,
    })
    // front bar across the slot, plus two side bars.
    const front = at(SLOT_LONG / 2, 0)
    bar(front.x, front.z, 0.12, 2 * SLOT_HALF_WIDE, -pose.heading)
    for (const side of [-1, 1]) {
      const mid = at(0, side * SLOT_HALF_WIDE)
      bar(mid.x, mid.z, SLOT_LONG, 0.12, -pose.heading)
    }
  }
  return group
}

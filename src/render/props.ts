import * as THREE from 'three'
import type { Track } from '../core/track'
import { mulberry32, perp } from '../core/vec'

// Things beside the road: striped poles close to the kerb and trees further
// out, placed by a seeded PRNG (the scenery never uses chance in the rules).
// They strobe past the window and show how fast the car is going.

const POLE_SPACING = 25
const POLE_OFFSET = 8.6
const TREE_COUNT = 260

export function buildProps(track: Track): THREE.Group {
  const group = new THREE.Group()
  const n = track.sampleCount

  // Poles: both sides of the road, alternating orange and white.
  const poleGeo = new THREE.BoxGeometry(0.16, 1.6, 0.16)
  const poleMat = new THREE.MeshStandardMaterial({ roughness: 0.7 })
  const poleCount = 2 * Math.ceil(track.length / POLE_SPACING)
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, poleCount)
  const orange = new THREE.Color(0xff5a1f)
  const white = new THREE.Color(0xf3f3f3)
  const m = new THREE.Matrix4()
  let p = 0
  for (let i = 0; i < poleCount / 2; i++) {
    const j = Math.round((i * POLE_SPACING) / track.spacing) % n
    const pt = track.pointAt(j)
    const right = perp(track.tangentAt(j))
    for (const side of [-1, 1]) {
      m.makeTranslation(pt.x + right.x * side * POLE_OFFSET, 0.8, pt.z + right.z * side * POLE_OFFSET)
      poles.setMatrixAt(p, m)
      poles.setColorAt(p, i % 2 === 0 ? orange : white)
      p++
    }
  }
  poles.castShadow = true
  poles.instanceMatrix.needsUpdate = true
  if (poles.instanceColor) poles.instanceColor.needsUpdate = true
  group.add(poles)

  // Trees: trunks and canopies, scattered with a margin off the road.
  const rand = mulberry32(0xc0ffee)
  const trunkGeo = new THREE.CylinderGeometry(0.18, 0.26, 1.4, 6)
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 1 })
  const canopyGeo = new THREE.ConeGeometry(2.3, 6.2, 7)
  const canopyMat = new THREE.MeshStandardMaterial({ color: 0x2e6b31, roughness: 1 })
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, TREE_COUNT)
  const canopies = new THREE.InstancedMesh(canopyGeo, canopyMat, TREE_COUNT)
  let placed = 0
  let guard = 0
  while (placed < TREE_COUNT && guard++ < TREE_COUNT * 20) {
    const j = Math.floor(rand() * n)
    const side = rand() < 0.5 ? -1 : 1
    const d = 13 + rand() * 80
    const pt = track.pointAt(j)
    const right = perp(track.tangentAt(j))
    const x = pt.x + right.x * side * d
    const z = pt.z + right.z * side * d
    // Keep clear of every part of the road, not just the nearest sample.
    let clear = true
    for (let k = j - 100; k <= j + 100; k += 2) {
      const q = track.pointAt(k)
      if (Math.hypot(q.x - x, q.z - z) < 11.5) {
        clear = false
        break
      }
    }
    if (!clear) continue
    if (Math.abs(x - 20) > 600 || Math.abs(z - 100) > 600) continue
    const s = 0.7 + rand() * 0.9
    m.makeScale(s, s, s)
    m.setPosition(x, 0.7 * s, z)
    trunks.setMatrixAt(placed, m)
    m.makeScale(s, s, s)
    m.setPosition(x, (1.4 + 3.1) * s, z)
    canopies.setMatrixAt(placed, m)
    placed++
  }
  trunks.count = placed
  canopies.count = placed
  trunks.castShadow = true
  canopies.castShadow = true
  trunks.instanceMatrix.needsUpdate = true
  canopies.instanceMatrix.needsUpdate = true
  group.add(trunks, canopies)

  return group
}

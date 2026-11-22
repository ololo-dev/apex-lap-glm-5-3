import * as THREE from 'three'
import type { Track } from '../core/track'
import { perp } from '../core/vec'

// The road drawn from the rules: a 12 m ribbon on the smooth centreline,
// white edges, red-white curbs where the corners are tight, the checkered
// start band at A, and a gantry so the line is told apart at a glance.

const ROAD_Y = 0.04
const LINE_Y = 0.12
const CURB_Y = 0.11

/** Build a ribbon between two lateral offsets of the centreline. */
function ribbon(
  track: Track,
  from: number,
  to: number,
  y: number,
  stripe: (i: number) => THREE.Color | null,
): THREE.BufferGeometry {
  const n = track.sampleCount
  const cols = n + 1 // duplicate the first column at the end to close the loop
  const positions = new Float32Array(cols * 2 * 3)
  const colors = new Float32Array(cols * 2 * 3)
  const uvs = new Float32Array(cols * 2 * 2)
  let hasColors = false
  for (let i = 0; i < cols; i++) {
    const j = i % n
    const p = track.pointAt(j)
    const right = perp(track.tangentAt(j))
    const a = i * 6
    positions[a] = p.x + right.x * from
    positions[a + 1] = y
    positions[a + 2] = p.z + right.z * from
    positions[a + 3] = p.x + right.x * to
    positions[a + 4] = y
    positions[a + 5] = p.z + right.z * to
    const c = stripe(j)
    if (c) {
      hasColors = true
      colors[a] = c.r
      colors[a + 1] = c.g
      colors[a + 2] = c.b
      colors[a + 3] = c.r
      colors[a + 4] = c.g
      colors[a + 5] = c.b
    }
    const u = (i * track.spacing) / 8
    uvs[i * 4] = u
    uvs[i * 4 + 1] = 0
    uvs[i * 4 + 2] = u
    uvs[i * 4 + 3] = 1
  }
  const indices: number[] = []
  for (let i = 0; i < n; i++) {
    const v0 = i * 2
    indices.push(v0, v0 + 1, v0 + 2, v0 + 1, v0 + 3, v0 + 2)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  if (hasColors) geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return geo
}

function checkerTexture(): THREE.Texture {
  const c = document.createElement('canvas')
  c.width = 240
  c.height = 40
  const g = c.getContext('2d')!
  const cols = 12
  const rows = 2
  for (let x = 0; x < cols; x++) {
    for (let y = 0; y < rows; y++) {
      g.fillStyle = (x + y) % 2 === 0 ? '#f2f2f2' : '#15181d'
      g.fillRect((x * 240) / cols, (y * 40) / rows, 240 / cols, 40 / rows)
    }
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function bannerTexture(): THREE.Texture {
  const c = document.createElement('canvas')
  c.width = 1024
  c.height = 128
  const g = c.getContext('2d')!
  g.fillStyle = '#15181d'
  g.fillRect(0, 0, 1024, 128)
  for (let x = 0; x < 8; x++) {
    for (let y = 0; y < 2; y++) {
      g.fillStyle = (x + y) % 2 === 0 ? '#f2f2f2' : '#15181d'
      g.fillRect(x * 32, y * 64, 32, 64)
      g.fillRect(1024 - 256 + x * 32, y * 64, 32, 64)
    }
  }
  g.fillStyle = '#ff6a1a'
  g.font = '700 72px system-ui, sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.letterSpacing = '14px'
  g.fillText('OXBOW RING', 512, 68)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export function buildTrackMeshes(track: Track): THREE.Group {
  const group = new THREE.Group()
  const half = 6 // road half width
  const white = new THREE.Color(0xe9e9e9)
  const red = new THREE.Color(0xc8372d)
  const plain = () => null

  const road = new THREE.Mesh(
    ribbon(track, -half, half, ROAD_Y, plain),
    new THREE.MeshStandardMaterial({ color: 0x33363c, roughness: 0.94 }),
  )
  road.receiveShadow = true
  group.add(road)

  for (const side of [-1, 1]) {
    const line = new THREE.Mesh(
      ribbon(track, side * (half - 0.4), side * half, LINE_Y, plain),
      new THREE.MeshStandardMaterial({ color: 0xe9e9e9, roughness: 0.8 }),
    )
    line.receiveShadow = true
    group.add(line)
  }

  // Red-white curbs where the corners bite (both sides, every second sample).
  const CURB_K = 0.018
  const onCurb = (i: number) => Math.abs(track.curvatureAt(i)) > CURB_K
  const curbStripe = (i: number) => {
    if (!onCurb(i) && !onCurb(i - 1) && !onCurb(i + 1)) return null
    return (i >> 1) % 2 === 0 ? white : red
  }
  for (const side of [-1, 1]) {
    const curb = new THREE.Mesh(
      ribbon(track, side * half, side * (half + 1.1), CURB_Y, curbStripe),
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }),
    )
    curb.receiveShadow = true
    group.add(curb)
  }

  // Start line: a checkered band across the road at A.
  const start = new THREE.Mesh(
    new THREE.PlaneGeometry(12, 1.5),
    new THREE.MeshStandardMaterial({ map: checkerTexture(), roughness: 0.8 }),
  )
  start.rotation.x = -Math.PI / 2
  const angle = Math.atan2(track.startNormal.z, track.startNormal.x)
  start.rotation.z = -angle // align the band across the road
  start.position.set(track.startPos.x, LINE_Y + 0.01, track.startPos.z)
  group.add(start)

  // Gantry over the line.
  const postMat = new THREE.MeshStandardMaterial({ color: 0x1c2026, roughness: 0.6, metalness: 0.4 })
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 7, 12), postMat)
    post.position.set(
      track.startPos.x + track.startNormal.x * side * 8.2,
      3.5,
      track.startPos.z + track.startNormal.z * side * 8.2,
    )
    post.castShadow = true
    group.add(post)
  }
  const crossbar = new THREE.Mesh(new THREE.BoxGeometry(16.4, 0.5, 0.5), postMat)
  crossbar.rotation.y = -Math.atan2(track.startNormal.z, track.startNormal.x)
  crossbar.position.set(track.startPos.x, 7, track.startPos.z)
  crossbar.castShadow = true
  group.add(crossbar)
  const banner = new THREE.Mesh(
    new THREE.PlaneGeometry(16, 1.15),
    new THREE.MeshStandardMaterial({ map: bannerTexture(), side: THREE.DoubleSide, roughness: 0.7 }),
  )
  banner.rotation.y = -Math.atan2(track.startTangent.z, track.startTangent.x)
  banner.position.set(track.startPos.x, 6.1, track.startPos.z)
  group.add(banner)

  return group
}

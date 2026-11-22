import * as THREE from 'three'
import { clamp } from '../core/vec'

// The Vantor GT-12: a low wedge with a racing stripe, glass cabin, tail
// wing, lights, and wheels that spin with the speed and turn with the
// steering. The body leans out of corners and pitches under braking.

export interface CarPose {
  x: number
  z: number
  heading: number
  speed: number
  steer: number
  omega: number
}

export interface CarVisual {
  group: THREE.Group
  update: (pose: CarPose, dt: number) => void
}

const WHEEL_R = 0.34

export function buildCar(color: number = 0xff6a1a): CarVisual {
  const group = new THREE.Group()
  const body = new THREE.Group()
  group.add(body)

  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.32, metalness: 0.55 })
  const dark = new THREE.MeshStandardMaterial({ color: 0x15181d, roughness: 0.6, metalness: 0.3 })
  const glass = new THREE.MeshStandardMaterial({ color: 0x0d1420, roughness: 0.12, metalness: 0.7 })
  const white = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.4 })

  const hull = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.52, 1.9), paint)
  hull.position.set(-0.15, 0.52, 0)
  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.36, 1.72), paint)
  nose.position.set(2.2, 0.44, 0)
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.44, 1.42), glass)
  cabin.position.set(-0.25, 0.98, 0)
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.03, 0.5), white)
  stripe.position.set(-0.15, 0.79, 0)
  const wing = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.07, 1.8), dark)
  wing.position.set(-2.0, 1.1, 0)
  for (const z of [-0.6, 0.6]) {
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.32, 0.09), dark)
    strut.position.set(-1.85, 0.9, z)
    body.add(strut)
  }
  body.add(hull, nose, cabin, stripe, wing)

  for (const z of [-0.55, 0.55]) {
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.07, 0.15, 0.34),
      new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff6d8, emissiveIntensity: 1.6 }),
    )
    head.position.set(2.86, 0.5, z)
    body.add(head)
  }
  const tail = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 0.13, 1.5),
    new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff2211, emissiveIntensity: 1.4 }),
  )
  tail.position.set(-1.94, 0.66, 0)
  body.add(tail)

  body.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = true
  })

  // Wheels: cylinder geometry pre-rotated so the axle lies along z (lateral).
  const wheelGeo = new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.32, 18)
  wheelGeo.rotateX(Math.PI / 2)
  const rimMat = new THREE.MeshStandardMaterial({ color: 0x101216, roughness: 0.55, metalness: 0.5 })
  const hubGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.34, 8)
  hubGeo.rotateX(Math.PI / 2)
  const hubMat = new THREE.MeshStandardMaterial({ color: 0xb9c0c8, roughness: 0.3, metalness: 0.8 })

  const wheels: { pivot: THREE.Group; mesh: THREE.Mesh; front: boolean }[] = []
  for (const [x, z, front] of [
    [1.45, 0.95, true],
    [1.45, -0.95, true],
    [-1.35, 0.95, false],
    [-1.35, -0.95, false],
  ] as const) {
    const pivot = new THREE.Group()
    pivot.position.set(x, WHEEL_R, z)
    const mesh = new THREE.Mesh(wheelGeo, rimMat)
    mesh.castShadow = true
    mesh.add(new THREE.Mesh(hubGeo, hubMat))
    pivot.add(mesh)
    group.add(pivot)
    wheels.push({ pivot, mesh, front })
  }

  let roll = 0
  let lastSpeed = 0

  const update = (pose: CarPose, dt: number): void => {
    group.position.set(pose.x, 0, pose.z)
    group.rotation.y = -pose.heading
    roll += (pose.speed / WHEEL_R) * dt
    const accel = dt > 0 ? (pose.speed - lastSpeed) / dt : 0
    lastSpeed = pose.speed
    for (const w of wheels) {
      w.mesh.rotation.z = roll
      if (w.front) w.pivot.rotation.y = -pose.steer * 0.42
    }
    body.rotation.x = clamp(-pose.omega * Math.abs(pose.speed) * 0.0022, -0.05, 0.05)
    body.rotation.z = clamp(accel * 0.0026, -0.045, 0.045)
  }

  return { group, update }
}

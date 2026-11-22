import * as THREE from 'three'
import { clamp } from '../core/vec'

// The chase camera: behind and above the car, easing through the corners,
// pulling back and lifting a little with speed, with a mild speed-widened
// field of view. Follows the interpolated render pose, never the sim.

export class ChaseCamera {
  private pos = new THREE.Vector3()
  private look = new THREE.Vector3()
  private fov = 64

  constructor(private readonly camera: THREE.PerspectiveCamera) {}

  snap(x: number, z: number, heading: number): void {
    this.pos.set(x - Math.cos(heading) * 8, 3, z - Math.sin(heading) * 8)
  }

  update(x: number, z: number, heading: number, speed: number, dt: number): void {
    const f = { x: Math.cos(heading), z: Math.sin(heading) }
    const dist = 6.2 + clamp(speed, 0, 60) * 0.035
    const height = 2.5 + clamp(speed, 0, 60) * 0.02
    const desiredX = x - f.x * dist
    const desiredZ = z - f.z * dist
    const k = 1 - Math.exp(-5.5 * Math.max(dt, 1e-4))
    this.pos.x += (desiredX - this.pos.x) * k
    this.pos.y += (height - this.pos.y) * k
    this.pos.z += (desiredZ - this.pos.z) * k
    this.camera.position.copy(this.pos)

    this.look.set(x + f.x * 7, 1.25, z + f.z * 7)
    this.camera.lookAt(this.look)

    const fov = 62 + clamp(speed, 0, 60) * 0.28
    if (Math.abs(fov - this.fov) > 0.05) {
      this.fov = fov
      this.camera.fov = fov
      this.camera.updateProjectionMatrix()
    }
  }
}

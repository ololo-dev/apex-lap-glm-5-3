import * as THREE from 'three'

// The world in three dimensions: renderer, scene, sky, sun, and the flat
// measured ground with a faint 10-metre grid. Reads nothing from core; the
// track meshes and props are added on top.

export interface World {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  sun: THREE.DirectionalLight
  sunTarget: THREE.Object3D
}

export const GROUND_CENTER = { x: 20, z: 100 }

export const SKY = 0x9fc7e8
export const GROUND = 0x4d8044

function groundTexture(): THREE.Texture {
  // One tile is 50 m: five 10-metre grid cells, lines slightly darker green.
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')!
  g.fillStyle = '#4d8044'
  g.fillRect(0, 0, 256, 256)
  g.strokeStyle = 'rgba(0, 0, 0, 0.10)'
  g.lineWidth = 2
  for (let i = 0; i <= 5; i++) {
    const p = (i * 256) / 5
    g.beginPath()
    g.moveTo(p, 0)
    g.lineTo(p, 256)
    g.moveTo(0, p)
    g.lineTo(256, p)
    g.stroke()
  }
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(60, 60) // 3000 m / 50 m
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

export function createWorld(container: HTMLElement, opts: { preserveDrawingBuffer?: boolean }): World {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    preserveDrawingBuffer: opts.preserveDrawingBuffer ?? false,
  })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  container.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(SKY)
  scene.fog = new THREE.Fog(SKY, 300, 1100)

  const camera = new THREE.PerspectiveCamera(64, window.innerWidth / window.innerHeight, 0.6, 2000)

  const hemi = new THREE.HemisphereLight(0xcfe6ff, 0x3a5f33, 1.1)
  scene.add(hemi)

  const sun = new THREE.DirectionalLight(0xfff3dd, 2.2)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  const cam = sun.shadow.camera
  cam.left = -80
  cam.right = 80
  cam.top = 80
  cam.bottom = -80
  cam.near = 10
  cam.far = 500
  sun.shadow.bias = -0.0006
  const sunTarget = new THREE.Object3D()
  scene.add(sunTarget)
  sun.target = sunTarget
  scene.add(sun)

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(3000, 3000),
    new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 1 }),
  )
  ground.rotation.x = -Math.PI / 2
  ground.position.set(GROUND_CENTER.x, 0, GROUND_CENTER.z)
  ground.receiveShadow = true
  scene.add(ground)

  const onResize = () => {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
  }
  window.addEventListener('resize', onResize)

  return { renderer, scene, camera, sun, sunTarget }
}

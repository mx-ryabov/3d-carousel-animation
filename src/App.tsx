import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import './App.css'

const SQUARE_COUNT = 40
const SQUARE_SIZE = 1.35
// Compressed ellipse: narrow in X, deep in Z (matches the top-view sketch).
const RING_RADIUS_X = 2.5
const RING_RADIUS_Z = 9
const MAX_ANGLE = Math.PI * 0.52
const ANGULAR_SPEED = 0.3
const SPAWN_INTERVAL = 500
// Camera stays where it was — near the ellipse center, looking toward the far arc.
const CAMERA_Z = RING_RADIUS_Z * 0.25

const COLORS = [
  '#ef4444',
  '#f97316',
  '#eab308',
  '#84cc16',
  '#22c55e',
  '#14b8a6',
  '#06b6d4',
  '#0ea5e9',
  '#3b82f6',
  '#6366f1',
  '#8b5cf6',
  '#a855f7',
  '#d946ef',
  '#ec4899',
  '#f43f5e',
  '#fb7185',
  '#fdba74',
  '#a3e635',
  '#2dd4bf',
  '#818cf8',
]

type Square = {
  mesh: THREE.Mesh
  angle: number
  direction: 1 | -1
  active: boolean
}

function placeOnRing(mesh: THREE.Mesh, angle: number) {
  mesh.position.set(
    Math.sin(angle) * RING_RADIUS_X,
    0,
    -Math.cos(angle) * RING_RADIUS_Z,
  )
  // Face the ellipse center so we see the inside of the compressed ring.
  mesh.lookAt(0, 0, 0)
}

function createSquare(index: number, geometry: THREE.PlaneGeometry): Square {
  const material = new THREE.MeshBasicMaterial({
    color: new THREE.Color(COLORS[index % COLORS.length]),
    side: THREE.DoubleSide,
  })
  const mesh = new THREE.Mesh(geometry, material)

  mesh.visible = false
  placeOnRing(mesh, 0)

  return {
    mesh,
    angle: 0,
    direction: index % 2 === 0 ? 1 : -1,
    active: false,
  }
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current

    if (!canvas) {
      return
    }

    let renderer: THREE.WebGLRenderer

    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
      })
    } catch {
      return
    }

    renderer.setClearColor(0x060815, 1)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100)
    camera.position.set(0, 0.15, CAMERA_Z)
    camera.lookAt(0, 0, -RING_RADIUS_Z)

    const sharedGeometry = new THREE.PlaneGeometry(SQUARE_SIZE, SQUARE_SIZE)
    const squares: Square[] = Array.from({ length: SQUARE_COUNT }, (_, index) =>
      createSquare(index, sharedGeometry),
    )

    for (const square of squares) {
      scene.add(square.mesh)
    }

    // Separate queues per direction so each stream has perfectly even gaps.
    const rightQueue: Square[] = []
    const leftQueue: Square[] = []

    for (const square of squares) {
      if (square.direction === 1) {
        rightQueue.push(square)
      } else {
        leftQueue.push(square)
      }
    }

    let lastSpawnTimeRight = 0
    let lastSpawnTimeLeft = 0

    let frameId = 0
    let previousTime = performance.now()

    const resize = () => {
      const { width, height } = canvas.getBoundingClientRect()
      const displayWidth = Math.max(1, Math.floor(width))
      const displayHeight = Math.max(1, Math.floor(height))

      renderer.setSize(displayWidth, displayHeight, false)
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))

      camera.aspect = displayWidth / displayHeight
      camera.updateProjectionMatrix()
    }

    const spawn = (queue: Square[], lastTime: number, time: number) => {
      if (queue.length > 0 && time - lastTime >= SPAWN_INTERVAL) {
        const square = queue.shift()!
        square.active = true
        square.mesh.visible = true
        square.angle = 0
        placeOnRing(square.mesh, 0)
        return time
      }
      return lastTime
    }

    const render = (time: number) => {
      const delta = Math.min((time - previousTime) / 1000, 0.05)
      previousTime = time

      lastSpawnTimeRight = spawn(rightQueue, lastSpawnTimeRight, time)
      lastSpawnTimeLeft = spawn(leftQueue, lastSpawnTimeLeft, time)

      for (const square of squares) {
        if (!square.active) {
          continue
        }

        square.angle += square.direction * ANGULAR_SPEED * delta
        placeOnRing(square.mesh, square.angle)

        if (Math.abs(square.angle) > MAX_ANGLE) {
          square.active = false
          square.mesh.visible = false
          square.angle = 0
          if (square.direction === 1) {
            rightQueue.push(square)
          } else {
            leftQueue.push(square)
          }
        }
      }

      renderer.render(scene, camera)
      frameId = window.requestAnimationFrame(render)
    }

    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(canvas)
    resize()
    frameId = window.requestAnimationFrame(render)

    return () => {
      resizeObserver.disconnect()
      window.cancelAnimationFrame(frameId)

      for (const square of squares) {
        scene.remove(square.mesh)
          ; (square.mesh.material as THREE.MeshBasicMaterial).dispose()
      }

      sharedGeometry.dispose()
      renderer.dispose()
    }
  }, [])

  return (
    <main className="test-page">
      <canvas
        ref={canvasRef}
        className="webgl-canvas"
        aria-label="Animated Three.js square carousel"
      />
    </main>
  )
}

export default App

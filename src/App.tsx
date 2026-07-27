import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import './App.css'

const SQUARE_COUNT = 40
const SQUARE_SIZE = 0.25
// Compressed ellipse: narrow in X, deep in Z (matches the top-view sketch).
const RING_RADIUS_X = 2.77
const RING_RADIUS_Z = 3.4
const MAX_ANGLE = Math.PI
const ANGULAR_SPEED = 0.225
const SPAWN_INTERVAL = 800
// Camera stays where it was — near the ellipse center, looking toward the far arc.
const CAMERA_Z = RING_RADIUS_Z * 0.4
const INTRO_DELAY_MS = 200
const INTRO_GROW_MS = 300
const INTRO_HOLD_MS = 1500
const SCALE_START = 0.1
const SCALE_HOLD = 1.5
const SCALE_AT_EDGE = 16
const CORNER_RADIUS = 0.005// Local Z offset at the left/right edges of a square when fully bent.
const BEND_AT_EDGE = 0.14
const BEND_SEGMENTS = 52
// Spawn each stream one square-width past center in the opposite direction
// so left/right chains overlap at the middle.
const SPAWN_ANGLE_OFFSET =
  (SQUARE_SIZE * 2 * SCALE_HOLD) / RING_RADIUS_X

const imageModules = import.meta.glob('./assets/carousel-images/*.webp', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

const IMAGE_URLS = Object.keys(imageModules)
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  .map((key) => imageModules[key])

type BendUniform = { value: number }

type BendMaterial = THREE.MeshBasicMaterial & {
  userData: {
    bendUniform: BendUniform
  }
}

type Square = {
  mesh: THREE.Mesh
  angle: number
  startAngle: number
  direction: 1 | -1
  active: boolean
  activatedAt: number
}

function getStartAngle(direction: 1 | -1) {
  return -direction * SPAWN_ANGLE_OFFSET
}

function applyCoverCrop(texture: THREE.Texture) {
  const image = texture.image as HTMLImageElement | ImageBitmap
  const aspect = image.width / image.height

  // object-fit: cover onto a square mesh
  if (aspect > 1) {
    texture.repeat.set(1 / aspect, 1)
    texture.offset.set((1 - 1 / aspect) / 2, 0)
  } else {
    texture.repeat.set(1, aspect)
    texture.offset.set(0, (1 - aspect) / 2)
  }
}

function configureTexture(
  texture: THREE.Texture,
  anisotropy: number,
): THREE.Texture {
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.generateMipmaps = true
  texture.anisotropy = anisotropy
  applyCoverCrop(texture)
  texture.needsUpdate = true
  return texture
}

function loadTextures(anisotropy: number): Promise<THREE.Texture[]> {
  const loader = new THREE.TextureLoader()

  return Promise.all(
    IMAGE_URLS.map(
      (url) =>
        new Promise<THREE.Texture>((resolve, reject) => {
          loader.load(
            url,
            (texture) => resolve(configureTexture(texture, anisotropy)),
            undefined,
            reject,
          )
        }),
    ),
  )
}

function createBendMaterial(
  texture: THREE.Texture,
  direction: 1 | -1,
): BendMaterial {
  const bendUniform: BendUniform = { value: 0 }
  // Hide the overlapping half: right chain only draws for world x >= 0,
  // left chain only for world x <= 0 — so each stream appears to start at center.
  const clipPlane = new THREE.Plane(new THREE.Vector3(direction, 0, 0), 0)
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    color: 0xffffff,
    side: THREE.DoubleSide,
    toneMapped: false,
    clippingPlanes: [clipPlane],
  }) as BendMaterial

  material.userData.bendUniform = bendUniform
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uBend = bendUniform

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        uniform float uBend;
        varying vec2 vSquareUv;
        `,
      )
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `
        #include <begin_vertex>
        float halfSize = ${(SQUARE_SIZE / 2).toFixed(6)};
        vSquareUv = vec2(transformed.x, transformed.y) / ${SQUARE_SIZE.toFixed(6)} + 0.5;
        float nx = transformed.x / halfSize;
        // Vertical bend (around Y): edges curl toward the camera.
        transformed.z += uBend * nx * nx;
        `,
      )

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        varying vec2 vSquareUv;
        `,
      )
      .replace(
        '#include <opaque_fragment>',
        /* glsl */ `
        float corner = ${(CORNER_RADIUS / SQUARE_SIZE).toFixed(6)};
        vec2 p = abs(vSquareUv - 0.5) - (0.5 - corner);
        float outside = length(max(p, 0.0)) + min(max(p.x, p.y), 0.0) - corner;
        if (outside > 0.0) discard;
        #include <opaque_fragment>
        `,
      )
  }
  // Keep all bent squares on one compiled program variant.
  material.customProgramCacheKey = () => 'paper-bend-square-textured-clipped'

  return material
}

function getSquareScale(angle: number, startAngle: number, ageMs: number) {
  if (ageMs < INTRO_DELAY_MS) {
    return SCALE_START
  }

  const growAgeMs = ageMs - INTRO_DELAY_MS

  if (growAgeMs < INTRO_GROW_MS) {
    return THREE.MathUtils.lerp(SCALE_START, SCALE_HOLD, growAgeMs / INTRO_GROW_MS)
  }

  if (growAgeMs < INTRO_GROW_MS + INTRO_HOLD_MS) {
    return SCALE_HOLD
  }

  // After the intro, grow linearly from hold → edge over the remaining arc.
  const introAngle =
    ANGULAR_SPEED *
    ((INTRO_DELAY_MS + INTRO_GROW_MS + INTRO_HOLD_MS) / 1000)
  const traveled = Math.abs(angle - startAngle)
  const totalTravel = MAX_ANGLE + Math.abs(startAngle)
  const remaining = Math.max(totalTravel - introAngle, Number.EPSILON)
  const progress = THREE.MathUtils.clamp(
    (traveled - introAngle) / remaining,
    0,
    1,
  )

  return THREE.MathUtils.lerp(SCALE_HOLD, SCALE_AT_EDGE, progress)
}

function getBendAmount(angle: number, startAngle: number) {
  const traveled = Math.abs(angle - startAngle)
  const totalTravel = MAX_ANGLE + Math.abs(startAngle)
  const progress = Math.min(traveled / totalTravel, 1)
  // Ease in so the paper wrap appears mostly near the sides.
  return BEND_AT_EDGE * progress * progress
}

function placeOnRing(square: Square, ageMs: number) {
  const { mesh, angle, startAngle } = square

  mesh.position.set(
    Math.sin(angle) * RING_RADIUS_X,
    0,
    -Math.cos(angle) * RING_RADIUS_Z,
  )
  // Face the ellipse center so we see the inside of the compressed ring.
  mesh.lookAt(0, 0, 0)
  mesh.scale.setScalar(getSquareScale(angle, startAngle, ageMs))
    ; (mesh.material as BendMaterial).userData.bendUniform.value =
      getBendAmount(angle, startAngle)
}

function createSquare(
  index: number,
  geometry: THREE.BufferGeometry,
  textures: THREE.Texture[],
): Square {
  const texture = textures[index % textures.length]
  const direction: 1 | -1 = index % 2 === 0 ? 1 : -1
  const material = createBendMaterial(texture, direction)
  const mesh = new THREE.Mesh(geometry, material)
  const startAngle = getStartAngle(direction)

  mesh.visible = false

  const square: Square = {
    mesh,
    angle: startAngle,
    startAngle,
    direction,
    active: false,
    activatedAt: 0,
  }

  placeOnRing(square, 0)

  return square
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current

    if (!canvas) {
      return
    }

    let cancelled = false
    let renderer: THREE.WebGLRenderer | undefined
    let sharedGeometry: THREE.PlaneGeometry | undefined
    let textures: THREE.Texture[] = []
    let squares: Square[] = []
    let frameId = 0
    let resizeObserver: ResizeObserver | undefined

    const cleanup = () => {
      resizeObserver?.disconnect()
      window.cancelAnimationFrame(frameId)

      for (const square of squares) {
        square.mesh.removeFromParent()
          ; (square.mesh.material as THREE.MeshBasicMaterial).dispose()
      }

      for (const texture of textures) {
        texture.dispose()
      }

      sharedGeometry?.dispose()
      renderer?.dispose()
    }

    const start = async () => {
      try {
        renderer = new THREE.WebGLRenderer({
          canvas,
          antialias: true,
          alpha: true,
          powerPreference: 'high-performance',
        })
      } catch {
        return
      }

      if (cancelled) {
        renderer.dispose()
        return
      }

      renderer.setClearColor(0x000000, 0)
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
      renderer.localClippingEnabled = true

      const anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy())

      try {
        textures = await loadTextures(anisotropy)
      } catch (error) {
        console.error('Failed to load carousel images', error)
        renderer.dispose()
        return
      }

      if (cancelled || textures.length === 0) {
        cleanup()
        return
      }

      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100)
      camera.position.set(0, 0.15, CAMERA_Z)
      camera.lookAt(0, 0, -RING_RADIUS_Z)

      // Subdivide in X so the vertical paper bend has enough vertices to curve.
      sharedGeometry = new THREE.PlaneGeometry(
        SQUARE_SIZE,
        SQUARE_SIZE,
        BEND_SEGMENTS,
        1,
      )
      squares = Array.from({ length: SQUARE_COUNT }, (_, index) =>
        createSquare(index, sharedGeometry!, textures),
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

      // Stagger left/right so a new square appears in the center while the
      // previous pair is separating. Without this, both sides spawn together and
      // the center gap grows to ~2x the side spacing.
      let lastSpawnTimeRight = -SPAWN_INTERVAL / 2
      let lastSpawnTimeLeft = -SPAWN_INTERVAL / 2
      let previousTime = performance.now()

      const resize = () => {
        if (!renderer) {
          return
        }

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
          square.angle = getStartAngle(square.direction)
          square.startAngle = square.angle
          square.activatedAt = time
          placeOnRing(square, 0)
          return time
        }
        return lastTime
      }

      const render = (time: number) => {
        if (!renderer) {
          return
        }

        const delta = Math.min((time - previousTime) / 1000, 0.05)
        previousTime = time

        lastSpawnTimeRight = spawn(rightQueue, lastSpawnTimeRight, time)
        lastSpawnTimeLeft = spawn(leftQueue, lastSpawnTimeLeft, time)

        for (const square of squares) {
          if (!square.active) {
            continue
          }

          square.angle += square.direction * ANGULAR_SPEED * delta
          placeOnRing(square, time - square.activatedAt)

          if (Math.abs(square.angle) > MAX_ANGLE) {
            square.active = false
            square.mesh.visible = false
            square.angle = getStartAngle(square.direction)
            square.startAngle = square.angle
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

      resizeObserver = new ResizeObserver(resize)
      resizeObserver.observe(canvas)
      resize()
      frameId = window.requestAnimationFrame(render)
    }

    void start()

    return () => {
      cancelled = true
      cleanup()
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

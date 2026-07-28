import * as THREE from 'three'
import { createBendMaterial } from './bendMaterial'
import type { BendMaterial } from './bendMaterial'
import {
  BEND_AT_EDGE,
  SCALE_AT_EDGE,
  SCALE_HOLD,
  SCALE_HOLD_PATH_FRACTION,
  SCALE_START,
  TRANSITION_SPEED_MULTIPLIER,
  TRANSITION_ZONE,
} from './constants'
import { getTrajectory } from './trajectory'
import type { Direction, Trajectory } from './trajectory'

export type CarouselSquare = {
  mesh: THREE.Mesh<THREE.BufferGeometry, BendMaterial>
  progress: number
  direction: Direction
}

function getSquareScale(progress: number, trajectory: Trajectory) {
  if (progress < trajectory.growStartProgress) {
    return SCALE_START
  }

  if (progress < trajectory.forkProgress) {
    const growProgress = THREE.MathUtils.inverseLerp(
      trajectory.growStartProgress,
      trajectory.forkProgress,
      progress,
    )
    return THREE.MathUtils.lerp(SCALE_START, SCALE_HOLD, growProgress)
  }

  const edgeGrowthStart = Math.min(
    trajectory.forkProgress + SCALE_HOLD_PATH_FRACTION,
    1,
  )

  if (progress < edgeGrowthStart) {
    return SCALE_HOLD
  }

  const sideProgress = THREE.MathUtils.inverseLerp(
    edgeGrowthStart,
    1,
    progress,
  )
  return THREE.MathUtils.lerp(SCALE_HOLD, SCALE_AT_EDGE, sideProgress)
}

function getBendAmount(progress: number, trajectory: Trajectory) {
  const sideProgress = THREE.MathUtils.clamp(
    THREE.MathUtils.inverseLerp(trajectory.forkProgress, 1, progress),
    0,
    1,
  )
  return BEND_AT_EDGE * sideProgress * sideProgress
}

export function getSpeedMultiplier(
  progress: number,
  trajectory: Trajectory,
) {
  const distanceFromFork =
    Math.abs(progress - trajectory.forkProgress) / TRANSITION_ZONE

  if (distanceFromFork >= 1) {
    return 1
  }

  const transitionInfluence =
    1 - THREE.MathUtils.smoothstep(distanceFromFork, 0, 1)

  return THREE.MathUtils.lerp(
    1,
    TRANSITION_SPEED_MULTIPLIER,
    transitionInfluence,
  )
}

export function placeSquareOnPath(
  square: CarouselSquare,
  trajectory = getTrajectory(square.direction),
  reveal = 1,
) {
  const { mesh, progress } = square

  trajectory.curve.getPointAt(progress, mesh.position)
  mesh.lookAt(0, 0, 0)
  mesh.scale.setScalar(getSquareScale(progress, trajectory) * reveal)
  mesh.material.userData.bendUniform.value = getBendAmount(
    progress,
    trajectory,
  )
}

export function createCarouselSquare(
  index: number,
  geometry: THREE.BufferGeometry,
  textures: THREE.Texture[],
): CarouselSquare {
  const texture = textures[index % textures.length]
  const direction: Direction = index % 2 === 0 ? 1 : -1
  const mesh = new THREE.Mesh(geometry, createBendMaterial(texture))

  mesh.visible = false

  const square: CarouselSquare = {
    mesh,
    progress: 0,
    direction,
  }

  placeSquareOnPath(square)
  return square
}

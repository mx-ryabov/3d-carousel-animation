import * as THREE from 'three'
import {
  FEEDER_DEPTH,
  FEEDER_HOLD_FRACTION,
  FEEDER_OUTWARD_SPREAD,
  MAX_ANGLE,
  PATH_ARC_LENGTH_DIVISIONS,
  RING_JOIN_ANGLE,
  RING_PATH_SAMPLES,
  RING_RADIUS_X,
  RING_RADIUS_Z,
  RING_VISIBLE_FRACTION,
  SCALE_HOLD,
  SCALE_START,
  SQUARE_SIZE,
} from './constants'

export type Direction = -1 | 1

export type Trajectory = {
  curve: THREE.CatmullRomCurve3
  growStartProgress: number
  forkProgress: number
  sideProgress: number
}

function getRingPoint(angle: number) {
  return new THREE.Vector3(
    Math.sin(angle) * RING_RADIUS_X,
    0,
    -Math.cos(angle) * RING_RADIUS_Z,
  )
}

function createTrajectory(direction: Direction): Trajectory {
  const joinAngle = direction * RING_JOIN_ANGLE
  const ringAngleStep =
    (MAX_ANGLE - RING_JOIN_ANGLE) / RING_PATH_SAMPLES
  const preJoinAngle =
    direction * Math.max(0, RING_JOIN_ANGLE - ringAngleStep)
  const laneOffset = SQUARE_SIZE * SCALE_START * 0.55
  const feederSpread =
    SQUARE_SIZE * SCALE_HOLD * FEEDER_OUTWARD_SPREAD
  const preJoinPoint = getRingPoint(preJoinAngle)
  preJoinPoint.x =
    direction *
    Math.max(Math.abs(preJoinPoint.x), feederSpread * 0.9)

  const approachPoints = [
    new THREE.Vector3(
      direction * laneOffset,
      0,
      -RING_RADIUS_Z - FEEDER_DEPTH,
    ),
    new THREE.Vector3(
      direction * Math.max(laneOffset * 1.4, feederSpread * 0.18),
      0,
      -RING_RADIUS_Z - FEEDER_DEPTH * 0.66,
    ),
    new THREE.Vector3(
      direction * feederSpread * 0.55,
      0,
      -RING_RADIUS_Z - FEEDER_DEPTH * 0.3,
    ),
    preJoinPoint,
    getRingPoint(joinAngle),
  ]

  const ringPoints = Array.from(
    { length: RING_PATH_SAMPLES + 1 },
    (_, index) => {
      const progress = index / RING_PATH_SAMPLES
      const angle =
        joinAngle + direction * (MAX_ANGLE - RING_JOIN_ANGLE) * progress
      return getRingPoint(angle)
    },
  )

  // One spline keeps the tangent continuous through the feeder/ring join.
  const curve = new THREE.CatmullRomCurve3(
    [...approachPoints, ...ringPoints.slice(1)],
    false,
    'centripetal',
  )
  curve.arcLengthDivisions = PATH_ARC_LENGTH_DIVISIONS
  curve.updateArcLengths()

  const joinPoint = getRingPoint(joinAngle)
  let forkProgress = 0
  let closestDistanceSquared = Number.POSITIVE_INFINITY

  // Find the physical join in arc-length space after merging the curves.
  for (let index = 0; index <= PATH_ARC_LENGTH_DIVISIONS; index += 1) {
    const progress = index / PATH_ARC_LENGTH_DIVISIONS
    const distanceSquared = curve
      .getPointAt(progress)
      .distanceToSquared(joinPoint)

    if (distanceSquared < closestDistanceSquared) {
      closestDistanceSquared = distanceSquared
      forkProgress = progress
    }
  }

  return {
    curve,
    growStartProgress: forkProgress * FEEDER_HOLD_FRACTION,
    forkProgress,
    sideProgress:
      forkProgress + (1 - forkProgress) * RING_VISIBLE_FRACTION,
  }
}

const TRAJECTORIES: Record<Direction, Trajectory> = {
  [-1]: createTrajectory(-1),
  [1]: createTrajectory(1),
}

export function getTrajectory(direction: Direction) {
  return TRAJECTORIES[direction]
}

export const SQUARE_COUNT = 40;
export const SQUARE_SIZE = 0.25;

export const RING_RADIUS_X = 2.5;
export const RING_RADIUS_Z = 2.8;
export const MAX_ANGLE = Math.PI;
export const ANGULAR_SPEED = 0.25;
export const RING_JOIN_ANGLE = 0.1;
export const RING_PATH_SAMPLES = 40;
export const PATH_ARC_LENGTH_DIVISIONS = 640;
export const RING_VISIBLE_FRACTION = 1 / 1.8;

export const SPAWN_INTERVAL = 850;
export const CAMERA_Z = RING_RADIUS_Z * 0.35;

// Desktop framing reference (~1024×486). Narrower canvases zoom out so the
// same horizontal card span remains visible under the fixed vertical FOV.
export const REFERENCE_ASPECT = 1024 / 486;
export const MIN_CAMERA_ZOOM = 0.35;

// GSAP opening choreography (seconds).
export const CHOREO_HOLD_DURATION = 0.15;
export const CHOREO_BUILD_DURATION = 1.3;
export const CHOREO_REVEAL_DURATION = 0.5;
export const CHOREO_PAUSE_DURATION = 0;
export const CHOREO_SETTLE_DURATION = 1;
export const CHOREO_BUILD_SPEED = 6;
export const CHOREO_CAMERA_Z_START = CAMERA_Z * 1.35;
export const CHOREO_GROUP_SCALE_START = 0.82;

export const SCALE_START = 0.1;
export const SCALE_HOLD = 1.7;
export const SCALE_HOLD_MIN_MS = 850;
export const SCALE_AT_EDGE = 16;
// Remaining width at the left/right side: 1 keeps a square, 0.8 removes 20%.
export const SQUARE_WIDTH_AT_SIDE = 0.5;

export const CORNER_RADIUS = 0.005;
export const BEND_AT_EDGE = 0.15;
export const BEND_SEGMENTS = 200;

export const FEEDER_DEPTH = 0.75;
export const FEEDER_HOLD_FRACTION = 0.25;
export const FEEDER_OUTWARD_SPREAD = 0.5;

export const TRANSITION_SPEED_MULTIPLIER = 0.6;
export const TRANSITION_ZONE = 0.12;

export const PATH_DURATION_SECONDS = MAX_ANGLE / ANGULAR_SPEED;

// The fork slowdown extends this distance beyond SCALE_HOLD_MIN_MS.
export const SCALE_HOLD_PATH_FRACTION =
  SCALE_HOLD_MIN_MS / 1000 / PATH_DURATION_SECONDS;

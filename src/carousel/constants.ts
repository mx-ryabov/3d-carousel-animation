export const SQUARE_COUNT = 40;
export const SQUARE_SIZE = 0.25;

export const RING_RADIUS_X = 2.7;
export const RING_RADIUS_Z = 3.5;
export const MAX_ANGLE = Math.PI;
export const ANGULAR_SPEED = 0.25;
export const RING_JOIN_ANGLE = 0.1;
export const RING_PATH_SAMPLES = 40;
export const PATH_ARC_LENGTH_DIVISIONS = 640;

export const SPAWN_INTERVAL = 850;
export const CAMERA_Z = RING_RADIUS_Z * 0.4;
export const INTRO_ACCELERATION_DURATION_MS = 1000;
export const INTRO_ACCELERATION_SPEED = 9;

export const SCALE_START = 0.1;
export const SCALE_HOLD = 2;
export const SCALE_HOLD_MIN_MS = 750;
export const SCALE_AT_EDGE = 14;

export const CORNER_RADIUS = 0.005;
export const BEND_AT_EDGE = 0.18;
export const BEND_SEGMENTS = 52;

export const FEEDER_DEPTH = 0.75;
export const FEEDER_HOLD_FRACTION = 0.25;
export const FEEDER_OUTWARD_SPREAD = 0.5;

export const TRANSITION_SPEED_MULTIPLIER = 0.6;
export const TRANSITION_ZONE = 0.12;

export const PATH_DURATION_SECONDS = MAX_ANGLE / ANGULAR_SPEED;

// The fork slowdown extends this distance beyond SCALE_HOLD_MIN_MS.
export const SCALE_HOLD_PATH_FRACTION =
  SCALE_HOLD_MIN_MS / 1000 / PATH_DURATION_SECONDS;

import gsap from "gsap";
import {
  CAMERA_Z,
  CHOREO_BUILD_DURATION,
  CHOREO_BUILD_SPEED,
  CHOREO_CAMERA_Z_START,
  CHOREO_GROUP_SCALE_START,
  CHOREO_HOLD_DURATION,
  CHOREO_PAUSE_DURATION,
  CHOREO_REVEAL_DURATION,
  CHOREO_SETTLE_DURATION,
} from "./constants";

export type CarouselControls = {
  speed: number;
  reveal: number;
  spawnEnabled: number;
  cameraZ: number;
  groupScale: number;
};

export function createCarouselControls(): CarouselControls {
  return {
    speed: 0,
    reveal: 0,
    spawnEnabled: 0,
    cameraZ: CHOREO_CAMERA_Z_START,
    groupScale: CHOREO_GROUP_SCALE_START,
  };
}

/**
 * Finite opening timeline that writes only shared control values.
 * Per-card progress, placement, and recycling stay in the Three.js update.
 */
export function createOpeningTimeline(controls: CarouselControls) {
  const timeline = gsap.timeline({ paused: true });

  // Hidden hold: simulation frozen, cards globally concealed.
  timeline.set(controls, {
    speed: 0,
    reveal: 0,
    spawnEnabled: 0,
    cameraZ: CHOREO_CAMERA_Z_START,
    groupScale: CHOREO_GROUP_SCALE_START,
  });
  timeline.to({}, { duration: CHOREO_HOLD_DURATION });

  // Fast build: spawn + advance while still concealed.
  timeline.set(controls, { spawnEnabled: 1 });
  timeline.to(controls, {
    speed: CHOREO_BUILD_SPEED,
    duration: CHOREO_BUILD_DURATION,
    ease: "power3.out",
  });

  // Reveal: fade cards in via reveal factor while dollying camera / group scale.
  timeline.to(
    controls,
    {
      reveal: 1,
      cameraZ: CAMERA_Z,
      groupScale: 1,
      duration: CHOREO_REVEAL_DURATION,
      ease: "power2.in",
    },
    "-=0.25",
  );

  // Optional pause only when configured — never force a speed→0 dip otherwise.
  // That hardcoded freeze was the post-acceleration lag.
  if (CHOREO_PAUSE_DURATION > 0) {
    timeline.to(controls, {
      speed: 0,
      duration: 0.2,
      ease: "power2.out",
    });
    timeline.to({}, { duration: CHOREO_PAUSE_DURATION });
  }

  // Settle from current build speed straight into continuous 1× motion.
  if (CHOREO_SETTLE_DURATION > 0) {
    timeline.to(controls, {
      speed: 1,
      duration: CHOREO_SETTLE_DURATION,
      ease: "power2.out",
    });
  } else {
    timeline.set(controls, { speed: 1 });
  }

  return timeline;
}

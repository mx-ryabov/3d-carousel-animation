import { useEffect } from "react";
import type { RefObject } from "react";
import gsap from "gsap";
import * as THREE from "three";
import {
  BEND_SEGMENTS,
  MIN_CAMERA_ZOOM,
  PATH_DURATION_SECONDS,
  REFERENCE_ASPECT,
  RING_RADIUS_Z,
  SPAWN_INTERVAL,
  SQUARE_COUNT,
  SQUARE_SIZE,
} from "./constants";
import { createCarouselControls, createOpeningTimeline } from "./choreography";
import {
  createCarouselSquare,
  getSpeedMultiplier,
  placeSquareOnPath,
} from "./square";
import type { CarouselSquare } from "./square";
import { loadCarouselTextures } from "./textures";
import { getTrajectory } from "./trajectory";

export function useCarouselScene(
  canvasRef: RefObject<HTMLCanvasElement | null>,
) {
  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    let cancelled = false;
    let renderer: THREE.WebGLRenderer | undefined;
    let sharedGeometry: THREE.PlaneGeometry | undefined;
    let textures: THREE.Texture[] = [];
    let squares: CarouselSquare[] = [];
    let resizeObserver: ResizeObserver | undefined;
    let openingTimeline: gsap.core.Timeline | undefined;
    let tickCallback: gsap.TickerCallback | undefined;

    const cleanup = () => {
      resizeObserver?.disconnect();
      resizeObserver = undefined;

      if (tickCallback) {
        gsap.ticker.remove(tickCallback);
        tickCallback = undefined;
      }

      openingTimeline?.kill();
      openingTimeline = undefined;

      for (const square of squares) {
        square.mesh.removeFromParent();
        square.mesh.material.dispose();
      }
      squares = [];

      for (const texture of textures) {
        texture.dispose();
      }
      textures = [];

      sharedGeometry?.dispose();
      sharedGeometry = undefined;
      renderer?.dispose();
      renderer = undefined;
    };

    const start = async () => {
      let sceneRenderer: THREE.WebGLRenderer;

      try {
        sceneRenderer = new THREE.WebGLRenderer({
          canvas,
          antialias: true,
          alpha: true,
          powerPreference: "high-performance",
        });
      } catch (error) {
        console.error("Unable to create the carousel WebGL renderer", error);
        return;
      }

      renderer = sceneRenderer;

      if (cancelled) {
        cleanup();
        return;
      }

      sceneRenderer.setClearColor(0x000000, 0);
      sceneRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

      const anisotropy = Math.min(
        4,
        sceneRenderer.capabilities.getMaxAnisotropy(),
      );

      try {
        textures = await loadCarouselTextures(anisotropy);
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to load carousel images", error);
        }
        cleanup();
        return;
      }

      if (cancelled || textures.length === 0) {
        cleanup();
        return;
      }

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
      const cardGroup = new THREE.Group();
      scene.add(cardGroup);

      const controls = createCarouselControls();
      camera.position.set(0, 0, controls.cameraZ);
      camera.lookAt(0, 0, -RING_RADIUS_Z);
      cardGroup.scale.setScalar(controls.groupScale);

      const geometry = new THREE.PlaneGeometry(
        SQUARE_SIZE,
        SQUARE_SIZE,
        BEND_SEGMENTS,
        1,
      );
      sharedGeometry = geometry;
      squares = Array.from({ length: SQUARE_COUNT }, (_, index) =>
        createCarouselSquare(index, geometry, textures),
      );

      for (const square of squares) {
        cardGroup.add(square.mesh);
      }

      // Mirrored queues make each dispatch add one card to both paths.
      const rightQueue: CarouselSquare[] = [];
      const leftQueue: CarouselSquare[] = [];

      for (const square of squares) {
        if (square.direction === 1) {
          rightQueue.push(square);
        } else {
          leftQueue.push(square);
        }
      }

      let spawnElapsed = SPAWN_INTERVAL;

      const resize = () => {
        const { width, height } = canvas.getBoundingClientRect();
        const displayWidth = Math.max(1, Math.floor(width));
        const displayHeight = Math.max(1, Math.floor(height));
        const aspect = displayWidth / displayHeight;

        sceneRenderer.setSize(displayWidth, displayHeight, false);
        sceneRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

        // Zoom out on narrow canvases so horizontal FOV matches the desktop
        // reference span; never zoom in past 1 so wide screens stay unchanged.
        camera.aspect = aspect;
        camera.zoom = Math.max(
          MIN_CAMERA_ZOOM,
          Math.min(1, aspect / REFERENCE_ASPECT),
        );
        camera.updateProjectionMatrix();
      };

      const activateSquare = (square: CarouselSquare) => {
        square.mesh.visible = true;
        square.progress = 0;
        placeSquareOnPath(square, undefined, controls.reveal);
      };

      const spawnPair = () => {
        if (rightQueue.length === 0 || leftQueue.length === 0) {
          return false;
        }

        const rightSquare = rightQueue.shift();
        const leftSquare = leftQueue.shift();

        if (!rightSquare || !leftSquare) {
          return false;
        }

        activateSquare(rightSquare);
        activateSquare(leftSquare);
        return true;
      };

      const update = (_time: number, deltaTime: number) => {
        if (cancelled) {
          return;
        }

        // GSAP ticker delta is in milliseconds; clamp like the previous RAF loop.
        const delta = Math.min(deltaTime / 1000, 0.05);
        const animationSpeed = controls.speed;

        camera.position.z = controls.cameraZ;
        camera.lookAt(0, 0, -RING_RADIUS_Z);
        cardGroup.scale.setScalar(controls.groupScale);

        // Advance the spawn clock at the same speed as the cards so spacing
        // remains stable while the chain builds outward from the center.
        if (controls.spawnEnabled > 0) {
          spawnElapsed += delta * 1000 * animationSpeed;

          while (spawnElapsed >= SPAWN_INTERVAL) {
            if (!spawnPair()) {
              spawnElapsed = SPAWN_INTERVAL;
              break;
            }

            spawnElapsed -= SPAWN_INTERVAL;
          }
        }

        for (const square of squares) {
          if (!square.mesh.visible) {
            continue;
          }

          const trajectory = getTrajectory(square.direction);
          square.progress +=
            (delta / PATH_DURATION_SECONDS) *
            animationSpeed *
            getSpeedMultiplier(square.progress, trajectory);

          // Recycle at the configured visible endpoint of the ring.
          if (square.progress >= trajectory.sideProgress) {
            square.mesh.visible = false;
            square.progress = 0;

            if (square.direction === 1) {
              rightQueue.push(square);
            } else {
              leftQueue.push(square);
            }
            continue;
          }

          placeSquareOnPath(square, trajectory, controls.reveal);
        }

        sceneRenderer.render(scene, camera);
      };

      openingTimeline = createOpeningTimeline(controls);
      tickCallback = update;
      gsap.ticker.add(update);
      // Keep GSAP from also driving a second lagSmoothing path that fights us.
      gsap.ticker.lagSmoothing(0);

      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(canvas);
      resize();
      openingTimeline.play(0);
    };

    void start();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [canvasRef]);
}

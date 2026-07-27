import { useEffect } from "react";
import type { RefObject } from "react";
import * as THREE from "three";
import {
  BEND_SEGMENTS,
  CAMERA_Z,
  INTRO_ACCELERATION_DURATION_MS,
  INTRO_ACCELERATION_SPEED,
  PATH_DURATION_SECONDS,
  RING_RADIUS_Z,
  SPAWN_INTERVAL,
  SQUARE_COUNT,
  SQUARE_SIZE,
} from "./constants";
import {
  createCarouselSquare,
  getSpeedMultiplier,
  placeSquareOnPath,
} from "./square";
import type { CarouselSquare } from "./square";
import { loadCarouselTextures } from "./textures";
import { getTrajectory } from "./trajectory";

function power3InOut(progress: number) {
  return progress < 0.5
    ? 8 * Math.pow(progress, 4)
    : 1 - Math.pow(-2 * progress + 2, 4) / 2;
}

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
    let frameId: number | undefined;
    let resizeObserver: ResizeObserver | undefined;

    const cleanup = () => {
      resizeObserver?.disconnect();
      resizeObserver = undefined;

      if (frameId !== undefined) {
        window.cancelAnimationFrame(frameId);
        frameId = undefined;
      }

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
      camera.position.set(0, 0.15, CAMERA_Z);
      camera.lookAt(0, 0, -RING_RADIUS_Z);

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
        scene.add(square.mesh);
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
      let previousTime = performance.now();
      let animationStartedAt: number | undefined;

      const resize = () => {
        const { width, height } = canvas.getBoundingClientRect();
        const displayWidth = Math.max(1, Math.floor(width));
        const displayHeight = Math.max(1, Math.floor(height));

        sceneRenderer.setSize(displayWidth, displayHeight, false);
        sceneRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

        camera.aspect = displayWidth / displayHeight;
        camera.updateProjectionMatrix();
      };

      const activateSquare = (square: CarouselSquare) => {
        square.mesh.visible = true;
        square.progress = 0;
        placeSquareOnPath(square);
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

      const render = (time: number) => {
        if (cancelled) {
          return;
        }

        const delta = Math.min((time - previousTime) / 1000, 0.05);
        previousTime = time;

        animationStartedAt ??= time;
        const introTimeProgress = THREE.MathUtils.clamp(
          (time - animationStartedAt) / INTRO_ACCELERATION_DURATION_MS,
          0,
          1,
        );
        const introEasedProgress = power3InOut(introTimeProgress);
        const isAccelerating =
          time - animationStartedAt <
          INTRO_ACCELERATION_DURATION_MS;
        const animationSpeed = isAccelerating
          ? THREE.MathUtils.lerp(
              1,
              INTRO_ACCELERATION_SPEED,
              introEasedProgress,
            )
          : 1;

        // Advance the spawn clock at the same speed as the cards so spacing
        // remains stable while the chain builds outward from the center.
        spawnElapsed += delta * 1000 * animationSpeed;

        while (spawnElapsed >= SPAWN_INTERVAL) {
          if (!spawnPair()) {
            spawnElapsed = SPAWN_INTERVAL;
            break;
          }

          spawnElapsed -= SPAWN_INTERVAL;
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

          // Recycle before sampling the curve outside its valid range.
          if (square.progress >= 1) {
            square.mesh.visible = false;
            square.progress = 0;

            if (square.direction === 1) {
              rightQueue.push(square);
            } else {
              leftQueue.push(square);
            }
            continue;
          }

          placeSquareOnPath(square, trajectory);
        }

        sceneRenderer.render(scene, camera);
        frameId = window.requestAnimationFrame(render);
      };

      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(canvas);
      resize();
      frameId = window.requestAnimationFrame(render);
    };

    void start();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [canvasRef]);
}

import * as THREE from 'three'
import { CORNER_RADIUS, SQUARE_SIZE } from './constants'

type BendUniform = { value: number }

export type BendMaterial = THREE.MeshBasicMaterial & {
  userData: {
    bendUniform: BendUniform
  }
}

export function createBendMaterial(texture: THREE.Texture): BendMaterial {
  const bendUniform: BendUniform = { value: 0 }
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    color: 0xffffff,
    side: THREE.DoubleSide,
    toneMapped: false,
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

  // Share one compiled shader variant across every card.
  material.customProgramCacheKey = () => 'paper-bend-square-textured'

  return material
}

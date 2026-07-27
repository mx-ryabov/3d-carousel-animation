import * as THREE from 'three'

const imageModules = import.meta.glob<string>(
  '../assets/carousel-images/*.webp',
  {
    eager: true,
    query: '?url',
    import: 'default',
  },
)

const IMAGE_URLS = Object.keys(imageModules)
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  .map((key) => imageModules[key])

function applyCoverCrop(texture: THREE.Texture) {
  const image = texture.image as HTMLImageElement | ImageBitmap
  const aspect = image.width / image.height

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

export async function loadCarouselTextures(anisotropy: number) {
  const loader = new THREE.TextureLoader()

  return Promise.all(
    IMAGE_URLS.map(async (url) =>
      configureTexture(await loader.loadAsync(url), anisotropy),
    ),
  )
}

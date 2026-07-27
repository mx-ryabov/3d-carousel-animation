import { useRef } from 'react'
import { useCarouselScene } from '../carousel/useCarouselScene'
import './CarouselAnimation.css'

export function CarouselAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useCarouselScene(canvasRef)

  return (
    <canvas
      ref={canvasRef}
      className="carousel-animation"
      aria-label="Animated Three.js square carousel"
    />
  )
}

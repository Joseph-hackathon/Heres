'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'

export default function Hero3D() {
  const mountRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const animationIdRef = useRef<number | null>(null)
  const meshRefs = useRef<THREE.Mesh[]>([])

  useEffect(() => {
    if (!mountRef.current) return

    // Scene setup
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0a0f1e)
    sceneRef.current = scene

    // Camera setup
    const camera = new THREE.PerspectiveCamera(
      75,
      mountRef.current.clientWidth / mountRef.current.clientHeight,
      0.1,
      1000
    )
    camera.position.set(0, 0, 10)
    cameraRef.current = camera

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    mountRef.current.appendChild(renderer.domElement)
    rendererRef.current = renderer

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x60a5fa, 0.3)
    scene.add(ambientLight)

    const directionalLight1 = new THREE.DirectionalLight(0x38bdf8, 0.8)
    directionalLight1.position.set(5, 5, 5)
    scene.add(directionalLight1)

    const directionalLight2 = new THREE.DirectionalLight(0x0ea5e9, 0.5)
    directionalLight2.position.set(-5, -5, 5)
    scene.add(directionalLight2)

    const pointLight = new THREE.PointLight(0x60a5fa, 1, 100)
    pointLight.position.set(0, 0, 10)
    scene.add(pointLight)

    // Create floating geometric shapes
    const geometries = [
      new THREE.IcosahedronGeometry(1, 0),
      new THREE.OctahedronGeometry(1, 0),
      new THREE.TetrahedronGeometry(1, 0),
      new THREE.DodecahedronGeometry(1, 0),
    ]

    geometries.forEach((geometry, index) => {
      const material = new THREE.MeshStandardMaterial({
        color: [0x60a5fa, 0x38bdf8, 0x0ea5e9, 0x0284c7][index],
        metalness: 0.7,
        roughness: 0.3,
        emissive: [0x1e40af, 0x1e3a8a, 0x1e3a8a, 0x1e3a8a][index],
        emissiveIntensity: 0.2,
        transparent: true,
        opacity: 0.8,
      })

      const mesh = new THREE.Mesh(geometry, material)
      const angle = (index / geometries.length) * Math.PI * 2
      const radius = 3
      mesh.position.x = Math.cos(angle) * radius
      mesh.position.y = Math.sin(angle) * radius
      mesh.position.z = (Math.random() - 0.5) * 5
      mesh.rotation.set(
        Math.random() * Math.PI,
        Math.random() * Math.PI,
        Math.random() * Math.PI
      )
      scene.add(mesh)
      meshRefs.current.push(mesh)
    })

    // Create particle system
    const particleGeometry = new THREE.BufferGeometry()
    const particleCount = 500
    const positions = new Float32Array(particleCount * 3)
    const colors = new Float32Array(particleCount * 3)

    for (let i = 0; i < particleCount * 3; i += 3) {
      positions[i] = (Math.random() - 0.5) * 20
      positions[i + 1] = (Math.random() - 0.5) * 20
      positions[i + 2] = (Math.random() - 0.5) * 20

      const color = new THREE.Color()
      color.setHSL(0.55 + Math.random() * 0.1, 0.7, 0.6)
      colors[i] = color.r
      colors[i + 1] = color.g
      colors[i + 2] = color.b
    }

    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    particleGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))

    const particleMaterial = new THREE.PointsMaterial({
      size: 0.1,
      vertexColors: true,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
    })

    const particles = new THREE.Points(particleGeometry, particleMaterial)
    scene.add(particles)

    // Animation loop
    const clock = new THREE.Clock()
    const animate = () => {
      animationIdRef.current = requestAnimationFrame(animate)
      const elapsedTime = clock.getElapsedTime()

      // Animate meshes
      meshRefs.current.forEach((mesh, index) => {
        mesh.rotation.x += 0.005
        mesh.rotation.y += 0.005

        // Floating animation
        const angle = elapsedTime * 0.5 + index
        mesh.position.y = Math.sin(angle) * 0.5
        mesh.position.x = Math.cos(angle * 0.7) * 0.3

        // Pulsing scale
        const scale = 1 + Math.sin(elapsedTime * 2 + index) * 0.1
        mesh.scale.set(scale, scale, scale)
      })

      // Animate particles
      particles.rotation.y = elapsedTime * 0.1

      // Animate lights
      pointLight.position.x = Math.sin(elapsedTime * 0.5) * 5
      pointLight.position.y = Math.cos(elapsedTime * 0.5) * 5

      // Camera animation
      camera.position.x = Math.sin(elapsedTime * 0.2) * 2
      camera.position.y = Math.cos(elapsedTime * 0.2) * 2
      camera.lookAt(0, 0, 0)

      renderer.render(scene, camera)
    }

    animate()

    // Handle resize
    const handleResize = () => {
      if (!mountRef.current || !cameraRef.current || !rendererRef.current) return

      cameraRef.current.aspect = mountRef.current.clientWidth / mountRef.current.clientHeight
      cameraRef.current.updateProjectionMatrix()
      rendererRef.current.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight)
    }

    window.addEventListener('resize', handleResize)

    // Store refs in variables for cleanup
    const mountElement = mountRef.current
    const rendererInstance = rendererRef.current
    const meshes = [...meshRefs.current]
    const animationId = animationIdRef.current

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize)
      if (animationId) {
        cancelAnimationFrame(animationId)
      }
      if (mountElement && rendererInstance) {
        try {
          mountElement.removeChild(rendererInstance.domElement)
        } catch (e) {
          // Element might already be removed
        }
      }
      rendererInstance?.dispose()
      meshes.forEach((mesh) => {
        mesh.geometry.dispose()
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((mat) => mat.dispose())
        } else {
          mesh.material.dispose()
        }
      })
      particleGeometry.dispose()
      particleMaterial.dispose()
    }
  }, [])

  return (
    <div
      ref={mountRef}
      className="absolute inset-0 w-full h-full"
      style={{ zIndex: 0 }}
    />
  )
}

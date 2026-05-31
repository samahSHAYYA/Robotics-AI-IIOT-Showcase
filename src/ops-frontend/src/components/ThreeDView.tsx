import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { RobotStatus } from '../types/telemetry'

// ---------------------------------------------------------------------------
// Colour helpers – mirrors the logic in DigitalTwinMap.tsx
// ---------------------------------------------------------------------------

function robotColor(
  robotId: string,
  status: string,
  customColors?: Record<string, string>,
): string {
  const base = (customColors && customColors[robotId]) ?? '#6b7280'
  switch (status) {
    case 'moving':
    case 'active':
      return base
    case 'idle':
      return '#6b7280'
    case 'error':
    case 'critical':
      return '#ef4444'
    case 'maintenance':
    case 'warning':
      return '#eab308'
    case 'offline':
      return '#6b7280'
    default:
      return base
  }
}

function hexToThree(hex: string): THREE.Color {
  return new THREE.Color(hex)
}

// ---------------------------------------------------------------------------
// 3D robot mesh factory
// ---------------------------------------------------------------------------

function createRobotMesh(
  robotId: string,
  status: string,
  customColors?: Record<string, string>,
): THREE.Group {
  const group = new THREE.Group()
  const color = hexToThree(robotColor(robotId, status, customColors))

  // Cylinder body
  const bodyGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.3, 16)
  const bodyMat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.3,
    metalness: 0.6,
  })
  const body = new THREE.Mesh(bodyGeo, bodyMat)
  body.position.y = 0.15
  body.castShadow = true
  body.receiveShadow = true
  body.name = 'body'
  group.add(body)

  // White band highlight
  const bandGeo = new THREE.TorusGeometry(0.41, 0.03, 6, 24)
  const bandMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.2,
    metalness: 0.1,
    transparent: true,
    opacity: 0.15,
  })
  const band = new THREE.Mesh(bandGeo, bandMat)
  band.position.y = 0.25
  band.rotation.x = Math.PI / 2
  band.name = 'band'
  group.add(band)

  // Glow ring (shown for warning / critical statuses)
  const ringGeo = new THREE.TorusGeometry(0.5, 0.04, 8, 24)
  const ringMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0,
    emissive: 0xffffff,
    emissiveIntensity: 0,
    depthWrite: false,
  })
  const ring = new THREE.Mesh(ringGeo, ringMat)
  ring.position.y = 0.02
  ring.rotation.x = -Math.PI / 2
  ring.name = 'ring'
  group.add(ring)

  return group
}

function updateRobotColor(
  group: THREE.Group,
  robotId: string,
  status: string,
  customColors?: Record<string, string>,
) {
  const colorStr = robotColor(robotId, status, customColors)
  const color = hexToThree(colorStr)

  group.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return

    const mat = child.material as THREE.MeshStandardMaterial
    switch (child.name) {
      case 'body':
        mat.color.copy(color)
        break
      case 'ring': {
        const glowLevel =
          status === 'error' || status === 'critical'
            ? 'critical'
            : status === 'maintenance' || status === 'warning'
              ? 'warning'
              : 'none'
        if (glowLevel === 'critical') {
          mat.color.setHex(0xef4444)
          mat.emissive.setHex(0xef4444)
          mat.emissiveIntensity = 0.6
          mat.opacity = 0.7
          mat.visible = true
        } else if (glowLevel === 'warning') {
          mat.color.setHex(0xf59e0b)
          mat.emissive.setHex(0xf59e0b)
          mat.emissiveIntensity = 0.35
          mat.opacity = 0.5
          mat.visible = true
        } else {
          mat.opacity = 0
          mat.emissiveIntensity = 0
          mat.visible = false
        }
        break
      }
    }
  })
}

// ---------------------------------------------------------------------------
// Interpolated robot snapshot used inside the animation loop
// ---------------------------------------------------------------------------

interface LerpRobot {
  robot_id: string
  x: number
  y: number
  theta: number
  status: string
}

// ---------------------------------------------------------------------------
// ThreeDView component
// ---------------------------------------------------------------------------

interface ThreeDViewProps {
  active: boolean
  robots: RobotStatus[]
  customColors?: Record<string, string>
  onRobotSelect?: (id: string, clientX: number, clientY: number) => void
}

export default function ThreeDView({
  active,
  robots,
  customColors,
  onRobotSelect,
}: ThreeDViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  // Scene internals (only valid while active)
  const sceneRef = useRef<{
    scene: THREE.Scene
    camera: THREE.PerspectiveCamera
    renderer: THREE.WebGLRenderer
    controls: OrbitControls
    robotMeshes: Map<string, THREE.Group>
    animFrame: number
    dispose: () => void
  } | null>(null)

  // Interpolation state
  const lerpRef = useRef<LerpRobot[]>([])
  const targetRef = useRef<LerpRobot[]>([])

  // Mutable refs to avoid stale closures inside the animation / event loop
  const colorsRef = useRef(customColors)
  colorsRef.current = customColors

  const onSelectRef = useRef(onRobotSelect)
  onSelectRef.current = onRobotSelect

  // ---- update targets whenever robot data arrives -------------------------
  useEffect(() => {
    targetRef.current = robots.map((r) => ({
      robot_id: r.robot_id,
      x: r.pose.x,
      y: r.pose.y,
      theta: r.pose.theta,
      status: r.status,
    }))
  }, [robots])

  // ---- create / destroy scene when active toggles -------------------------
  useEffect(() => {
    if (!active || !containerRef.current) return

    const container = containerRef.current

    // ---------- initialise lerp from current targets ----------
    lerpRef.current = targetRef.current.map((r) => ({ ...r }))

    // ---------- scene ----------
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0b1121)

    // ---------- camera ----------
    const rect = container.getBoundingClientRect()
    const width = rect.width || 600
    const height = rect.height || 400

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100)
    camera.position.set(8, 8, 8)
    camera.lookAt(0, 0, 0)

    // ---------- renderer ----------
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    container.appendChild(renderer.domElement)

    // ---------- controls ----------
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.minDistance = 3
    controls.maxDistance = 25
    controls.maxPolarAngle = Math.PI / 2.1
    controls.target.set(0, 0, 0)
    controls.update()

    // ---------- lighting ----------
    const ambient = new THREE.AmbientLight(0x404060, 1.5)
    scene.add(ambient)

    const hemi = new THREE.HemisphereLight(0x4488ff, 0x002244, 0.8)
    scene.add(hemi)

    const dirLight = new THREE.DirectionalLight(0xffffff, 2.5)
    dirLight.position.set(5, 12, 8)
    dirLight.castShadow = true
    dirLight.shadow.mapSize.width = 1024
    dirLight.shadow.mapSize.height = 1024
    dirLight.shadow.camera.near = 0.5
    dirLight.shadow.camera.far = 25
    dirLight.shadow.camera.left = -10
    dirLight.shadow.camera.right = 10
    dirLight.shadow.camera.top = 10
    dirLight.shadow.camera.bottom = -10
    scene.add(dirLight)

    const fillLight = new THREE.DirectionalLight(0x8888ff, 0.5)
    fillLight.position.set(-4, 6, -6)
    scene.add(fillLight)

    // ---------- factory floor ----------
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x1a2a40,
      roughness: 0.7,
      metalness: 0.15,
    })
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), floorMat)
    floor.rotation.x = -Math.PI / 2
    floor.position.set(0, 0, 0)
    floor.receiveShadow = true
    scene.add(floor)

    // Subtle grid
    const grid = new THREE.GridHelper(10, 10, 0x334155, 0x334155)
    grid.position.y = 0.015
    ;(grid.material as THREE.Material).transparent = true
    ;(grid.material as THREE.Material).opacity = 0.25
    scene.add(grid)

    // ---------- extruded walls (perimeter) ----------
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x1e2d4a,
      roughness: 0.6,
      metalness: 0.2,
    })
    const wallH = 0.3
    const wallT = 0.12

    const wallDefs = [
      { x: 0, z: -5, sx: 10, sz: wallT },
      { x: 0, z: 5, sx: 10, sz: wallT },
      { x: -5, z: 0, sx: wallT, sz: 10 },
      { x: 5, z: 0, sx: wallT, sz: 10 },
    ]
    for (const w of wallDefs) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(w.sx, wallH, w.sz),
        wallMat,
      )
      mesh.position.set(w.x, wallH / 2, w.z)
      mesh.castShadow = true
      mesh.receiveShadow = true
      scene.add(mesh)
    }

    // ---------- zone sections (coloured floor strips) ----------
    const zones = [
      { x: -3.33, z: 0, w: 3.23, d: 9.9, color: 0x14305a, label: 'Assembly A' },
      { x: 0, z: 0, w: 3.23, d: 9.9, color: 0x2a3a1c, label: 'Welding Bay' },
      { x: 3.33, z: 0, w: 3.23, d: 9.9, color: 0x2a1a4a, label: 'Inspection' },
    ]
    for (const zs of zones) {
      const zoneMat = new THREE.MeshStandardMaterial({
        color: zs.color,
        transparent: true,
        opacity: 0.12,
        roughness: 0.9,
        metalness: 0.05,
        side: THREE.DoubleSide,
      })
      const zone = new THREE.Mesh(
        new THREE.PlaneGeometry(zs.w, zs.d),
        zoneMat,
      )
      zone.rotation.x = -Math.PI / 2
      zone.position.set(zs.x, 0.008, zs.z)
      scene.add(zone)
    }

    // Zone divider lines
    for (let i = 1; i < 3; i++) {
      const divX = -5 + (10 / 3) * i
      const pts = [
        new THREE.Vector3(divX, 0.012, -5),
        new THREE.Vector3(divX, 0.012, 5),
      ]
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({
          color: 0x334155,
          transparent: true,
          opacity: 0.35,
        }),
      )
      scene.add(line)
    }

    // ---------- robot meshes ----------
    const robotMeshes = new Map<string, THREE.Group>()

    // ---------- raycaster for click ----------
    const raycaster = new THREE.Raycaster()
    const mouse = new THREE.Vector2()

    function getClickableMeshes(): THREE.Object3D[] {
      const list: THREE.Object3D[] = []
      for (const group of robotMeshes.values()) {
        group.traverse((child) => {
          if (child instanceof THREE.Mesh) list.push(child)
        })
      }
      return list
    }

    function handleClick(event: MouseEvent) {
      const rect = renderer.domElement.getBoundingClientRect()
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

      raycaster.setFromCamera(mouse, camera)
      const meshes = getClickableMeshes()
      const hits = raycaster.intersectObjects(meshes)

      if (hits.length > 0) {
        // Walk up to find the robot group
        let obj: THREE.Object3D | null = hits[0].object
        while (obj && !obj.userData?.robot_id_) {
          obj = obj.parent
        }
        if (obj?.userData?.robot_id_) {
          onSelectRef.current?.(
            obj.userData.robot_id_,
            event.clientX,
            event.clientY,
          )
        }
      }
    }

    renderer.domElement.addEventListener('click', handleClick)

    // ---------- resize observer ----------
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: w, height: h } = entry.contentRect
        if (w > 0 && h > 0) {
          camera.aspect = w / h
          camera.updateProjectionMatrix()
          renderer.setSize(w, h)
        }
      }
    })
    resizeObserver.observe(container)

    // ---------- store refs for cleanup ----------
    sceneRef.current = {
      scene,
      camera,
      renderer,
      controls,
      robotMeshes,
      animFrame: 0,
      dispose() {
        cancelAnimationFrame(this.animFrame)
        renderer.dispose()
        renderer.domElement.remove()
        resizeObserver.disconnect()
        renderer.domElement.removeEventListener('click', handleClick)

        // Dispose all robot geometries
        for (const group of robotMeshes.values()) {
          group.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.geometry.dispose()
              if (Array.isArray(child.material)) {
                child.material.forEach((m) => m.dispose())
              } else {
                child.material.dispose()
              }
            }
          })
        }
        robotMeshes.clear()
      },
    }

    // ---------- animation loop ----------
    const LERP_FACTOR = 0.08

    function animate() {
      const s = sceneRef.current
      if (!s) return
      const { scene, camera, renderer, controls, robotMeshes } = s

      // Interpolate toward targets
      const lerp = lerpRef.current
      const target = targetRef.current

      for (const t of target) {
        let existing = lerp.find((l) => l.robot_id === t.robot_id)
        if (existing) {
          existing.x += (t.x - existing.x) * LERP_FACTOR
          existing.y += (t.y - existing.y) * LERP_FACTOR
          // Angle lerp — handle wrap-around
          let dTheta = t.theta - existing.theta
          if (dTheta > Math.PI) dTheta -= Math.PI * 2
          if (dTheta < -Math.PI) dTheta += Math.PI * 2
          existing.theta += dTheta * LERP_FACTOR
          existing.status = t.status
        } else {
          lerp.push({ ...t })
        }
      }

      // Remove stale entries
      const targetIds = new Set(target.map((t) => t.robot_id))
      for (let i = lerp.length - 1; i >= 0; i--) {
        if (!targetIds.has(lerp[i].robot_id)) {
          lerp.splice(i, 1)
        }
      }

      // Sync 3D mesh transforms
      const usedIds = new Set<string>()
      const colors = colorsRef.current
      for (const r of lerp) {
        usedIds.add(r.robot_id)
        const threeX = r.x - 5
        const threeZ = r.y - 5

        let group = robotMeshes.get(r.robot_id)
        if (!group) {
          group = createRobotMesh(r.robot_id, r.status, colors)
          group.userData.robot_id_ = r.robot_id
          scene.add(group)
          robotMeshes.set(r.robot_id, group)
        } else {
          updateRobotColor(group, r.robot_id, r.status, colors)
        }

        // Smooth interpolation for mesh transform too
        group.position.x += (threeX - group.position.x) * LERP_FACTOR * 2
        group.position.z += (threeZ - group.position.z) * LERP_FACTOR * 2
        group.rotation.y = r.theta
      }

      // Remove meshes for gone robots
      for (const [id, group] of robotMeshes) {
        if (!usedIds.has(id)) {
          scene.remove(group)
          // Dispose geometry / materials
          group.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.geometry.dispose()
              if (Array.isArray(child.material)) {
                child.material.forEach((m) => m.dispose())
              } else {
                child.material.dispose()
              }
            }
          })
          robotMeshes.delete(id)
        }
      }

      controls.update()
      renderer.render(scene, camera)
      s.animFrame = requestAnimationFrame(animate)
    }

    sceneRef.current!.animFrame = requestAnimationFrame(animate)

    // ---------- cleanup ----------
    return () => {
      sceneRef.current?.dispose()
      sceneRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  // ---- render ------------------------------------------------------------
  if (!active) return null

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        borderRadius: '0.5rem',
        overflow: 'hidden',
        position: 'relative',
      }}
    />
  )
}

import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { RobotStatus, RobotJoints, WorkerStatus } from '../types/telemetry'

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
// Label sprite helpers – canvas-based text sprite
// ---------------------------------------------------------------------------

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

function createLabelSprite(text: string, scale = 1.4): THREE.Sprite {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 128
  const ctx = canvas.getContext('2d')!

  // Background pill
  ctx.fillStyle = 'rgba(0,0,0,0.55)'
  drawRoundedRect(ctx, 16, 16, 224, 96, 16)
  ctx.fill()

  // Border accent
  ctx.strokeStyle = 'rgba(148,163,184,0.3)'
  ctx.lineWidth = 2
  drawRoundedRect(ctx, 16, 16, 224, 96, 16)
  ctx.stroke()

  // Text
  ctx.fillStyle = '#e2e8f0'
  ctx.font = 'bold 40px monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 128, 64)

  const texture = new THREE.CanvasTexture(canvas)
  texture.needsUpdate = true
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    sizeAttenuation: true,
  })
  const sprite = new THREE.Sprite(material)
  sprite.scale.set(scale, scale * 0.5, 1)
  return sprite
}

// ---------------------------------------------------------------------------
// Robot joint references for articulation animation
// ---------------------------------------------------------------------------

interface RobotJoints3D {
  shoulder?: THREE.Object3D
  elbow?: THREE.Object3D
  wrist?: THREE.Object3D
  head?: THREE.Object3D
  gripper?: THREE.Object3D
}

interface RobotArticulation {
  group: THREE.Group
  joints: RobotJoints3D
}

// ---------------------------------------------------------------------------
// Articulated robot builders
// ---------------------------------------------------------------------------

function buildArticulatedWelder(color: THREE.Color): RobotArticulation {
  const group = new THREE.Group()
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.6 })
  const jointMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.2, metalness: 0.8 })
  const torchMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.4, metalness: 0.7 })

  // Circular base platform
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.6, 0.06, 24), mat)
  base.position.y = 0.03
  base.castShadow = true
  base.receiveShadow = true
  base.name = 'body'
  group.add(base)

  // Base ring detail
  const baseRing = new THREE.Mesh(new THREE.TorusGeometry(0.57, 0.02, 6, 24), mat)
  baseRing.position.y = 0.06
  baseRing.rotation.x = Math.PI / 2
  baseRing.name = 'body'
  group.add(baseRing)

  // Vertical pillar
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.15, 0.5, 12), mat)
  pillar.position.y = 0.31
  pillar.castShadow = true
  pillar.receiveShadow = true
  pillar.name = 'body'
  group.add(pillar)

  // Shoulder group — pitch (X) and roll (Z)
  const shoulderGroup = new THREE.Group()
  shoulderGroup.position.set(0, 0.56, 0)
  group.add(shoulderGroup)

  // Shoulder joint sphere
  const shoulderJoint = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 12), jointMat)
  shoulderJoint.position.set(0, 0, 0)
  shoulderJoint.castShadow = true
  shoulderGroup.add(shoulderJoint)

  // Upper arm (horizontal segment along +z)
  const upperArm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.4), mat)
  upperArm.position.set(0, 0, 0.2)
  upperArm.castShadow = true
  upperArm.receiveShadow = true
  upperArm.name = 'body'
  shoulderGroup.add(upperArm)

  // Elbow group — rotates with elbow angle (X)
  const elbowGroup = new THREE.Group()
  elbowGroup.position.set(0, 0, 0.4)
  shoulderGroup.add(elbowGroup)

  // Elbow joint sphere
  const elbowJoint = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 12), jointMat)
  elbowJoint.position.set(0, 0, 0)
  elbowJoint.castShadow = true
  elbowGroup.add(elbowJoint)

  // Forearm segment (angled down)
  const forearm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.3), mat)
  forearm.position.set(0, -0.14, 0.15)
  forearm.rotation.x = -0.5
  forearm.castShadow = true
  forearm.receiveShadow = true
  forearm.name = 'body'
  elbowGroup.add(forearm)

  // Wrist group — rotates with wrist (X)
  const wristGroup = new THREE.Group()
  wristGroup.position.set(0, -0.28, 0.3)
  elbowGroup.add(wristGroup)

  // Wrist joint sphere
  const wristJoint = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 10), jointMat)
  wristJoint.position.set(0, 0, 0)
  wristGroup.add(wristJoint)

  // Welding torch body (small cylinder)
  const torchBody = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.045, 0.12, 8), torchMat)
  torchBody.position.set(0, -0.06, 0.03)
  torchBody.rotation.x = -0.3
  torchBody.castShadow = true
  torchBody.name = 'body'
  wristGroup.add(torchBody)

  // Torch tip (sphere)
  const torchTip = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), torchMat)
  torchTip.position.set(0, -0.11, 0.06)
  wristGroup.add(torchTip)

  // Torch flame glow (small emissive sphere)
  const flameMat = new THREE.MeshStandardMaterial({
    color: 0xff6600,
    emissive: 0xff4400,
    emissiveIntensity: 0.8,
    transparent: true,
    opacity: 0.5,
  })
  const flame = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 6), flameMat)
  flame.position.set(0, -0.14, 0.08)
  wristGroup.add(flame)

  // Add a subtle point light at flame tip when active (controlled separately)
  const flameLight = new THREE.PointLight(0xff6600, 0.4, 0.5)
  flameLight.position.set(0, -0.14, 0.08)
  wristGroup.add(flameLight)

  return {
    group,
    joints: {
      shoulder: shoulderGroup,
      elbow: elbowGroup,
      wrist: wristGroup,
    },
  }
}

function buildArticulatedHumanoid(color: THREE.Color): RobotArticulation {
  const group = new THREE.Group()
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.4 })
  const accentMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.5, metalness: 0.3 })
  const visorMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x38bdf8,
    emissiveIntensity: 0.2,
  })

  // Waist / base
  const waist = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.35, 0.08, 16), mat)
  waist.position.y = 0.04
  waist.castShadow = true
  waist.receiveShadow = true
  waist.name = 'body'
  group.add(waist)

  // Torso (slightly wider box) — gentle lean via torsoGroup
  const torsoGroup = new THREE.Group()
  torsoGroup.position.y = 0.305
  group.add(torsoGroup)

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.45, 0.25), mat)
  torso.position.y = 0
  torso.castShadow = true
  torso.receiveShadow = true
  torso.name = 'body'
  torsoGroup.add(torso)

  // Chest accent plate
  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.15, 0.06), accentMat)
  chest.position.set(0, 0.035, 0.155)
  torsoGroup.add(chest)

  // Head group — pan (Y) and tilt (X)
  const headGroup = new THREE.Group()
  headGroup.position.set(0, 0.6, 0)
  group.add(headGroup)

  // Head sphere
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 16), mat)
  head.position.set(0, 0, 0)
  head.castShadow = true
  head.name = 'body'
  headGroup.add(head)

  // Visor (glowing eye strip)
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.04), visorMat)
  visor.position.set(0, 0.02, 0.14)
  headGroup.add(visor)

  // ---------- LEFT ARM ----------
  const leftShoulderGroup = new THREE.Group()
  leftShoulderGroup.position.set(-0.28, 0.5, 0)
  group.add(leftShoulderGroup)

  // Shoulder joint sphere
  const lShoulderJoint = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.2, metalness: 0.7 }),
  )
  lShoulderJoint.position.set(0, 0, 0)
  leftShoulderGroup.add(lShoulderJoint)

  // Upper arm (extends down from shoulder)
  const leftUpperArm = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.25, 0.07), mat)
  leftUpperArm.position.set(0, -0.125, 0)
  leftUpperArm.castShadow = true
  leftUpperArm.receiveShadow = true
  leftUpperArm.name = 'body'
  leftShoulderGroup.add(leftUpperArm)

  // Left elbow group
  const leftElbowGroup = new THREE.Group()
  leftElbowGroup.position.set(0, -0.25, 0)
  leftShoulderGroup.add(leftElbowGroup)

  // Forearm
  const leftForearm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.06), mat)
  leftForearm.position.set(0, -0.1, 0)
  leftForearm.castShadow = true
  leftForearm.receiveShadow = true
  leftForearm.name = 'body'
  leftElbowGroup.add(leftForearm)

  // Left gripper hand (small)
  const leftGripper = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 0.08), accentMat)
  leftGripper.position.set(0, -0.2, 0)
  leftGripper.name = 'gripper'
  leftElbowGroup.add(leftGripper)

  // ---------- RIGHT ARM (mirrored) ----------
  const rightShoulderGroup = new THREE.Group()
  rightShoulderGroup.position.set(0.28, 0.5, 0)
  group.add(rightShoulderGroup)

  // Shoulder joint sphere
  const rShoulderJoint = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.2, metalness: 0.7 }),
  )
  rShoulderJoint.position.set(0, 0, 0)
  rightShoulderGroup.add(rShoulderJoint)

  // Upper arm
  const rightUpperArm = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.25, 0.07), mat)
  rightUpperArm.position.set(0, -0.125, 0)
  rightUpperArm.castShadow = true
  rightUpperArm.receiveShadow = true
  rightUpperArm.name = 'body'
  rightShoulderGroup.add(rightUpperArm)

  // Right elbow group
  const rightElbowGroup = new THREE.Group()
  rightElbowGroup.position.set(0, -0.25, 0)
  rightShoulderGroup.add(rightElbowGroup)

  // Forearm
  const rightForearm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.06), mat)
  rightForearm.position.set(0, -0.1, 0)
  rightForearm.castShadow = true
  rightForearm.receiveShadow = true
  rightForearm.name = 'body'
  rightElbowGroup.add(rightForearm)

  // Right gripper hand
  const rightGripper = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 0.08), accentMat)
  rightGripper.position.set(0, -0.2, 0)
  rightGripper.name = 'gripper'
  rightElbowGroup.add(rightGripper)

  // Torso lean group — store as shoulder reference so we can lean torso with shoulder_pitch
  return {
    group,
    joints: {
      head: headGroup,
      shoulder: leftShoulderGroup,
      elbow: leftElbowGroup,
      gripper: leftGripper,
    },
  }
}

function buildArticulatedInspector(color: THREE.Color): RobotArticulation {
  const group = new THREE.Group()
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.5 })
  const accentMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.4, metalness: 0.6 })
  const eyeMat = new THREE.MeshStandardMaterial({
    color: 0x22d3ee,
    emissive: 0x22d3ee,
    emissiveIntensity: 0.4,
  })

  // Base platform
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.06, 20), mat)
  base.position.y = 0.03
  base.castShadow = true
  base.receiveShadow = true
  base.name = 'body'
  group.add(base)

  // Thin neck
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.15, 10), accentMat)
  neck.position.y = 0.135
  neck.castShadow = true
  neck.name = 'body'
  group.add(neck)

  // Head group — pan (Y) and tilt (X)
  const headGroup = new THREE.Group()
  headGroup.position.set(0, 0.31, 0)
  group.add(headGroup)

  // Rotating sensor head (sphere)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 16), mat)
  head.position.set(0, 0, 0)
  head.castShadow = true
  head.name = 'body'
  headGroup.add(head)

  // Camera eye — wrist-level rotation for independent tilt
  const wristGroup = new THREE.Group()
  wristGroup.position.set(0, 0, 0.16)
  headGroup.add(wristGroup)

  // Camera eye sphere
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 10), eyeMat)
  eye.position.set(0, 0.02, 0)
  wristGroup.add(eye)

  // Lens ring
  const lensRing = new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.015, 6, 12), accentMat)
  lensRing.position.set(0, 0.02, 0)
  lensRing.rotation.x = Math.PI / 2
  wristGroup.add(lensRing)

  // Left sensor dish / antenna
  const leftDish = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.25, 0.12), accentMat)
  leftDish.position.set(-0.3, 0.15, 0)
  leftDish.rotation.z = 0.15
  leftDish.castShadow = true
  leftDish.name = 'body'
  group.add(leftDish)

  // Left dish dome cap
  const leftDome = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.3 }),
  )
  leftDome.position.set(-0.34, 0.15, 0)
  group.add(leftDome)

  // Right sensor dish / antenna
  const rightDish = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.25, 0.12), accentMat)
  rightDish.position.set(0.3, 0.15, 0)
  rightDish.rotation.z = -0.15
  rightDish.castShadow = true
  rightDish.name = 'body'
  group.add(rightDish)

  // Right dish dome cap
  const rightDome = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.3 }),
  )
  rightDome.position.set(0.34, 0.15, 0)
  group.add(rightDome)

  // Top sensor spinner
  const spinner = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.08, 8), accentMat)
  spinner.position.y = 0.42
  spinner.name = 'body'
  group.add(spinner)

  // Spinner ball
  const spinnerBall = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), eyeMat)
  spinnerBall.position.y = 0.47
  group.add(spinnerBall)

  return {
    group,
    joints: {
      head: headGroup,
      wrist: wristGroup,
    },
  }
}

// ---------------------------------------------------------------------------
// 3D robot mesh factory — dispatches to articulated builders
// ---------------------------------------------------------------------------

function createArticulatedRobot(
  robotId: string,
  status: string,
  customColors?: Record<string, string>,
): RobotArticulation {
  const color = hexToThree(robotColor(robotId, status, customColors))

  // Determine robot type from ID prefix
  const type = robotId.startsWith('W2')
    ? 'welder'
    : robotId.startsWith('C3')
      ? 'humanoid'
      : 'inspector'

  let articulation: RobotArticulation
  switch (type) {
    case 'welder':
      articulation = buildArticulatedWelder(color)
      break
    case 'humanoid':
      articulation = buildArticulatedHumanoid(color)
      break
    case 'inspector':
    default:
      articulation = buildArticulatedInspector(color)
      break
  }

  const { group } = articulation

  // White band highlight (around base)
  const bandGeo = new THREE.TorusGeometry(0.47, 0.025, 6, 24)
  const bandMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.2,
    metalness: 0.1,
    transparent: true,
    opacity: 0.12,
  })
  const band = new THREE.Mesh(bandGeo, bandMat)
  band.position.y = 0.065
  band.rotation.x = Math.PI / 2
  band.name = 'band'
  group.add(band)

  // Glow ring (shown for warning / critical statuses)
  const ringGeo = new THREE.TorusGeometry(0.52, 0.035, 8, 24)
  const ringMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0,
    emissive: 0xffffff,
    emissiveIntensity: 0,
    depthWrite: false,
  })
  const ring = new THREE.Mesh(ringGeo, ringMat)
  ring.position.y = 0.015
  ring.rotation.x = -Math.PI / 2
  ring.name = 'ring'
  group.add(ring)

  // Label floating above the robot
  const label = createLabelSprite(robotId)
  label.position.y = type === 'inspector' ? 0.8 : 1.1
  group.add(label)

  return articulation
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
// Joint animation — apply joint angles with smooth interpolation
// ---------------------------------------------------------------------------

const JOINT_LERP = 0.1

function updateRobotJoints(
  articulation: RobotArticulation,
  joints: RobotJoints,
) {
  const { shoulder, elbow, wrist, head, gripper } = articulation.joints

  if (shoulder) {
    if (joints.shoulder_pitch !== undefined) {
      const target = joints.shoulder_pitch * Math.PI / 180
      shoulder.rotation.x += (target - shoulder.rotation.x) * JOINT_LERP
    }
    if (joints.shoulder_roll !== undefined) {
      const target = joints.shoulder_roll * Math.PI / 180
      shoulder.rotation.z += (target - shoulder.rotation.z) * JOINT_LERP
    }
  }

  if (elbow && joints.elbow !== undefined) {
    const target = joints.elbow * Math.PI / 180
    elbow.rotation.x += (target - elbow.rotation.x) * JOINT_LERP
  }

  if (wrist && joints.wrist !== undefined) {
    const target = joints.wrist * Math.PI / 180
    wrist.rotation.x += (target - wrist.rotation.x) * JOINT_LERP
  }

  if (head) {
    if (joints.head_pan !== undefined) {
      const target = joints.head_pan * Math.PI / 180
      head.rotation.y += (target - head.rotation.y) * JOINT_LERP
    }
    if (joints.head_tilt !== undefined) {
      const target = joints.head_tilt * Math.PI / 180
      head.rotation.x += (target - head.rotation.x) * JOINT_LERP
    }
  }

  if (gripper && joints.gripper !== undefined) {
    // Map 0–100 → scale 0.3–1.0 for opening/closing
    const target = 0.3 + (joints.gripper / 100) * 0.7
    gripper.scale.x += (target - gripper.scale.x) * JOINT_LERP
  }
}

// ---------------------------------------------------------------------------
// Worker 3D model — simple capsule-style humanoid (no articulation)
// ---------------------------------------------------------------------------

interface WorkerMesh {
  group: THREE.Group
  label: THREE.Sprite
}

function createWorkerMesh(workerId: string): WorkerMesh {
  const group = new THREE.Group()

  // Hi-vis orange body material
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0xf97316,
    roughness: 0.6,
    metalness: 0.1,
  })
  const headMat = new THREE.MeshStandardMaterial({
    color: 0xfbbf24,
    roughness: 0.5,
    metalness: 0.05,
  })
  const armMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    roughness: 0.5,
    metalness: 0.05,
  })

  // Torso (short cylinder)
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.12, 10), bodyMat)
  torso.position.y = 0.06
  torso.castShadow = true
  torso.name = 'worker'
  group.add(torso)

  // Head (small sphere)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), headMat)
  head.position.y = 0.14
  head.castShadow = true
  head.name = 'worker'
  group.add(head)

  // Hard hat (small flattened sphere)
  const hatMat = new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: 0.3, metalness: 0.2 })
  const hat = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8, 0, Math.PI * 2, 0, Math.PI / 2), hatMat)
  hat.position.y = 0.165
  hat.rotation.x = Math.PI
  hat.name = 'worker'
  group.add(hat)

  // Left arm
  const leftArm = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.08, 6), armMat)
  leftArm.position.set(-0.07, 0.08, 0)
  leftArm.rotation.z = 0.2
  leftArm.name = 'worker'
  group.add(leftArm)

  // Right arm
  const rightArm = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.08, 6), armMat)
  rightArm.position.set(0.07, 0.08, 0)
  rightArm.rotation.z = -0.2
  rightArm.name = 'worker'
  group.add(rightArm)

  // Label
  const label = createLabelSprite(workerId, 0.9)
  label.position.y = 0.25
  group.add(label)

  return { group, label }
}

// ---------------------------------------------------------------------------
// Conveyor belt / production line
// ---------------------------------------------------------------------------

interface ConveyorState {
  belt: THREE.Mesh
  products: THREE.Mesh[]
  productPositions: number[]
  time: number
}

function createConveyorBelt(scene: THREE.Scene): ConveyorState {
  const beltMat = new THREE.MeshStandardMaterial({
    color: 0x475569,
    roughness: 0.8,
    metalness: 0.2,
  })
  const belt = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.04, 0.35), beltMat)
  belt.position.set(-1.5, 0.02, -3.0)
  belt.receiveShadow = true
  belt.name = 'conveyor'
  scene.add(belt)

  // Belt edge rails
  const railMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.5, metalness: 0.3 })
  for (const zOff of [-0.19, 0.19]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.02, 0.02), railMat)
    rail.position.set(-1.5, 0.04, -3.0 + zOff)
    scene.add(rail)
  }

  // Products (small colored cubes)
  const products: THREE.Mesh[] = []
  const productPositions: number[] = []
  const productColors = [0x3b82f6, 0x22c55e, 0xf59e0b, 0xef4444, 0xa855f7]

  for (let i = 0; i < 8; i++) {
    const color = productColors[i % productColors.length]
    const prodMat = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.3 })
    const prod = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.06, 0.09), prodMat)
    prod.position.set(-1.5 + i * 0.35, 0.06, -3.0)
    prod.castShadow = true
    prod.name = 'product'
    scene.add(prod)
    products.push(prod)
    productPositions.push(i * 0.35)
  }

  return { belt, products, productPositions, time: 0 }
}

function updateConveyor(conveyor: ConveyorState, speed: number) {
  const { products, productPositions } = conveyor
  const beltLen = 3.0

  for (let i = 0; i < products.length; i++) {
    // Move product along belt
    productPositions[i] += speed * 0.016 // ~60fps normalization
    if (productPositions[i] > beltLen) {
      productPositions[i] = 0
    }
    const worldX = -1.5 + productPositions[i] - beltLen / 2 + 0.175
    products[i].position.x = worldX

    // Subtle bobbing
    const bob = Math.sin(productPositions[i] * 4 + i) * 0.008
    products[i].position.y = 0.06 + bob
  }
}

// ---------------------------------------------------------------------------
// Zone label sprites
// ---------------------------------------------------------------------------

function createZoneLabels(scene: THREE.Scene): THREE.Sprite[] {
  const zones = [
    { x: -3.33, z: 0, label: 'Assembly A' },
    { x: 0, z: 0, label: 'Welding Bay' },
    { x: 3.33, z: 0, label: 'Inspection' },
  ]
  const sprites: THREE.Sprite[] = []
  for (const zs of zones) {
    const sprite = createLabelSprite(zs.label, 1.6)
    sprite.position.set(zs.x, 0.55, zs.z)
    scene.add(sprite)
    sprites.push(sprite)
  }
  return sprites
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
  joints?: RobotJoints | null
}

// ---------------------------------------------------------------------------
// ThreeDView component
// ---------------------------------------------------------------------------

interface ThreeDViewProps {
  active: boolean
  robots: RobotStatus[]
  workers?: WorkerStatus[]
  customColors?: Record<string, string>
  onRobotSelect?: (id: string, clientX: number, clientY: number) => void
}

export default function ThreeDView({
  active,
  robots,
  workers,
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
    robotArticulations: Map<string, RobotArticulation>
    workerMeshes: Map<string, WorkerMesh>
    conveyor: ConveyorState
    zoneSprites: THREE.Sprite[]
    animFrame: number
    dispose: () => void
  } | null>(null)

  // Interpolation state
  const lerpRef = useRef<LerpRobot[]>([])
  const targetRef = useRef<LerpRobot[]>([])

  // Worker data ref for animation loop (no need for lerp, workers are low-priority)
  const workersRef = useRef<WorkerStatus[]>([])
  workersRef.current = workers ?? []

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
      joints: r.pose.joints ?? null,
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

    // ---------- zone label sprites ----------
    const zoneSprites = createZoneLabels(scene)

    // ---------- conveyor belt ----------
    const conveyor = createConveyorBelt(scene)

    // ---------- robot meshes & articulation ----------
    const robotMeshes = new Map<string, THREE.Group>()
    const robotArticulations = new Map<string, RobotArticulation>()

    // ---------- worker meshes ----------
    const workerMeshes = new Map<string, WorkerMesh>()

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
      robotArticulations,
      workerMeshes,
      conveyor,
      zoneSprites,
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
        robotArticulations.clear()

        // Dispose worker geometries
        for (const wm of workerMeshes.values()) {
          wm.group.traverse((child) => {
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
        workerMeshes.clear()

        // Dispose conveyor products
        for (const prod of this.conveyor.products) {
          prod.geometry.dispose()
          if (Array.isArray(prod.material)) {
            prod.material.forEach((m) => m.dispose())
          } else {
            prod.material.dispose()
          }
        }

        // Remove zone sprites
        for (const sprite of this.zoneSprites) {
          sprite.material.dispose()
          if (sprite.material.map) {
            sprite.material.map.dispose()
          }
        }
      },
    }

    // ---------- animation loop ----------
    const LERP_FACTOR = 0.08

    function animate() {
      const s = sceneRef.current
      if (!s) return
      const { scene, camera, renderer, controls, robotMeshes, robotArticulations, workerMeshes, conveyor } = s

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
          existing.joints = t.joints
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
          const articulation = createArticulatedRobot(r.robot_id, r.status, colors)
          group = articulation.group
          group.userData.robot_id_ = r.robot_id
          scene.add(group)
          robotMeshes.set(r.robot_id, group)
          robotArticulations.set(r.robot_id, articulation)
        } else {
          updateRobotColor(group, r.robot_id, r.status, colors)
        }

        // Smooth interpolation for mesh transform
        group.position.x += (threeX - group.position.x) * LERP_FACTOR * 2
        group.position.z += (threeZ - group.position.z) * LERP_FACTOR * 2
        group.rotation.y = r.theta

        // Joint animation
        if (r.joints) {
          const articulation = robotArticulations.get(r.robot_id)
          if (articulation) {
            updateRobotJoints(articulation, r.joints)
          }
        }
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
          robotArticulations.delete(id)
        }
      }

      // ---- Worker update ----
      const currentWorkers = workersRef.current
      const activeWorkerIds = new Set<string>()

      for (const w of currentWorkers) {
        if (!w.active) continue
        activeWorkerIds.add(w.worker_id)

        const threeX = w.x - 5
        const threeZ = w.y - 5

        let wMesh = workerMeshes.get(w.worker_id)
        if (!wMesh) {
          wMesh = createWorkerMesh(w.worker_id)
          scene.add(wMesh.group)
          workerMeshes.set(w.worker_id, wMesh)
        }

        // Smooth interpolation for worker position (faster response)
        wMesh.group.position.x += (threeX - wMesh.group.position.x) * LERP_FACTOR * 3
        wMesh.group.position.z += (threeZ - wMesh.group.position.z) * LERP_FACTOR * 3
      }

      // Remove stale workers
      for (const [id, wMesh] of workerMeshes) {
        if (!activeWorkerIds.has(id)) {
          scene.remove(wMesh.group)
          wMesh.group.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.geometry.dispose()
              if (Array.isArray(child.material)) {
                child.material.forEach((m) => m.dispose())
              } else {
                child.material.dispose()
              }
            }
          })
          if (wMesh.label.material.map) {
            wMesh.label.material.map.dispose()
          }
          wMesh.label.material.dispose()
          workerMeshes.delete(id)
        }
      }

      // ---- Conveyor animation ----
      updateConveyor(conveyor, 0.5)

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

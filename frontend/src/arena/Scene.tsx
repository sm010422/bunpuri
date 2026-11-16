import { Billboard, Text } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { Bloom, EffectComposer, Noise, Vignette } from '@react-three/postprocessing'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { moveVector, takeWeapons } from './input'
import {
  bagPosition,
  COOLDOWN,
  PUNCH_RANGE,
  type ArenaConnection,
  type AttackEvent,
  type Bag,
  type PlayerInfo,
  type Weapon,
} from './net'

const ARENA_RADIUS = 22
const SPEED = 6
const CAMERA_OFFSET = new THREE.Vector3(0, 10.5, 13)
const MAX_EFFECTS = 80
const POINTS: Record<Weapon, number> = { punch: 1, gun: 1, missile: 10 }

// 다크 판타지 팔레트: 검은 돌, 핏빛 룬, 보라 안개, 화로 불빛
const SKY = '#0a0610'
const RUNE = new THREE.Color('#ff1f2e').multiplyScalar(2.4)
const EMBER = new THREE.Color('#ff7a2a').multiplyScalar(3)
const BOLT = new THREE.Color('#ff3b5c').multiplyScalar(4)
const FIRE = new THREE.Color('#ff6a1a').multiplyScalar(5)
const STONE = '#17141b'

type Vec2 = { x: number; z: number }
type Effect = { key: number; weapon: Weapon; from: Vec2; to: Vec2; born: number }

/** 샌드백별 흔들림 세기. 맞을 때 올리고 매 프레임 줄인다. */
const bagShake = new Map<number, number>()
/** 가까운 폭발로 생기는 화면 흔들림 */
const camera = { shake: 0 }
/** 폭발과 내 거리로 화면 흔들림을 정하기 위해 내 위치를 모듈에 둔다. */
const myPosition: Vec2 = { x: 0, z: 0 }

function effigyColor(id: number) {
  // 낡은 천·가죽 느낌의 어두운 색. 회사마다 색조만 조금 다르게.
  return new THREE.Color().setHSL(((id * 47) % 360) / 360, 0.2, 0.13)
}

function cloakColor(hex: string) {
  const hsl = { h: 0, s: 0, l: 0 }
  new THREE.Color(hex).getHSL(hsl)
  return new THREE.Color().setHSL(hsl.h, 0.35, 0.12)
}

// ---------------- 배경 ----------------

function BloodMoon() {
  return (
    <group position={[-30, 34, -70]}>
      <mesh>
        <sphereGeometry args={[7, 32, 32]} />
        <meshBasicMaterial color={new THREE.Color('#b3121f').multiplyScalar(1.6)} toneMapped={false} fog={false} />
      </mesh>
      <mesh scale={1.35}>
        <sphereGeometry args={[7, 32, 32]} />
        <meshBasicMaterial color="#5a0710" transparent opacity={0.25} fog={false} />
      </mesh>
    </group>
  )
}

/** 광장을 둘러싼 검은 첨탑. 높은 곳의 창 몇 개만 보랏빛·불빛으로 새어 나온다. */
function Spires() {
  const spires = useMemo(
    () =>
      Array.from({ length: 18 }, (_, i) => {
        const a = (i / 18) * Math.PI * 2 + (i % 2) * 0.08
        const r = 34 + (i % 3) * 6
        const h = 16 + ((i * 37) % 26)
        const w = 3 + (i % 3) * 1.5
        return { x: Math.cos(a) * r, z: Math.sin(a) * r, h, w, glow: i % 3 === 0 ? '#b14dff' : '#ff8a3d' }
      }),
    [],
  )
  return (
    <group>
      {spires.map((s, i) => (
        <group key={i} position={[s.x, 0, s.z]}>
          <mesh position-y={s.h / 2}>
            <boxGeometry args={[s.w, s.h, s.w]} />
            <meshStandardMaterial color="#0d0b11" roughness={0.95} />
          </mesh>
          <mesh position-y={s.h + s.w * 1.2}>
            <coneGeometry args={[s.w * 0.75, s.w * 2.4, 4]} />
            <meshStandardMaterial color="#0d0b11" roughness={0.95} />
          </mesh>
          {[0.55, 0.78].map((f) => (
            <mesh key={f} position={[0, s.h * f, s.w / 2 + 0.01]}>
              <planeGeometry args={[0.35, 0.9]} />
              <meshBasicMaterial color={new THREE.Color(s.glow).multiplyScalar(2)} toneMapped={false} side={THREE.DoubleSide} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  )
}

function Brazier({ angle }: { angle: number }) {
  const light = useRef<THREE.PointLight>(null)
  const flame = useRef<THREE.Mesh>(null)
  const x = Math.cos(angle) * 15
  const z = Math.sin(angle) * 15
  const seed = angle * 13

  useFrame(() => {
    const t = performance.now() / 1000 + seed
    const flicker = 0.75 + Math.sin(t * 11) * 0.12 + Math.sin(t * 23.7) * 0.08 + Math.random() * 0.05
    if (light.current) light.current.intensity = 22 * flicker
    if (flame.current) {
      flame.current.scale.set(1, 0.85 + flicker * 0.4, 1)
      flame.current.rotation.y = t * 2
    }
  })

  return (
    <group position={[x, 0, z]}>
      <mesh position-y={0.7} castShadow>
        <cylinderGeometry args={[0.12, 0.25, 1.4, 6]} />
        <meshStandardMaterial color="#1a1614" metalness={0.7} roughness={0.5} />
      </mesh>
      <mesh position-y={1.5} castShadow>
        <cylinderGeometry args={[0.55, 0.3, 0.4, 8]} />
        <meshStandardMaterial color="#1a1614" metalness={0.7} roughness={0.5} />
      </mesh>
      <mesh ref={flame} position-y={2.05}>
        <coneGeometry args={[0.38, 1.1, 7]} />
        <meshBasicMaterial color={EMBER} toneMapped={false} />
      </mesh>
      <pointLight ref={light} position-y={2.4} color="#ff7a30" intensity={22} distance={13} decay={1.6} />
    </group>
  )
}

type Mote = { x: number; y: number; z: number; v: number; phase: number; size: number }

function makeMotes(count: number): Mote[] {
  return Array.from({ length: count }, () => ({
    x: (Math.random() - 0.5) * 50,
    y: Math.random() * 14,
    z: (Math.random() - 0.5) * 50,
    v: 0.4 + Math.random() * 1.2,
    phase: Math.random() * Math.PI * 2,
    size: 0.03 + Math.random() * 0.05,
  }))
}

/** 화로에서 피어올라 떠다니는 불씨와 재 */
function Embers({ count }: { count: number }) {
  const mesh = useRef<THREE.InstancedMesh>(null)
  const motes = useRef<Mote[]>([])
  const dummy = useMemo(() => new THREE.Object3D(), [])

  useEffect(() => {
    motes.current = makeMotes(count)
  }, [count])

  useFrame((_, dt) => {
    const m = mesh.current
    if (!m) return
    const t = performance.now() / 1000
    motes.current.forEach((d, i) => {
      d.y += d.v * dt
      if (d.y > 14) d.y = 0
      dummy.position.set(d.x + Math.sin(t * 0.7 + d.phase) * 0.6, d.y, d.z + Math.cos(t * 0.5 + d.phase) * 0.6)
      dummy.scale.setScalar(d.size * (1 - d.y / 16))
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
    })
    m.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, count]} frustumCulled={false}>
      <sphereGeometry args={[1, 6, 6]} />
      <meshBasicMaterial color={EMBER} toneMapped={false} />
    </instancedMesh>
  )
}

/** 샌드백을 둘러싼 붉은 마법진. 천천히 돌고 숨 쉬듯 밝아졌다 어두워진다. */
function RitualCircle() {
  const group = useRef<THREE.Group>(null)
  const material = useRef<THREE.MeshBasicMaterial>(null)

  useFrame(() => {
    const t = performance.now() / 1000
    if (group.current) group.current.rotation.z = t * 0.05
    if (material.current) material.current.opacity = 0.65 + Math.sin(t * 1.3) * 0.25
  })

  const runes = 24
  return (
    <group ref={group} rotation-x={-Math.PI / 2} position-y={0.025}>
      <mesh>
        <ringGeometry args={[9.3, 9.45, 96]} />
        <meshBasicMaterial ref={material} color={RUNE} toneMapped={false} transparent />
      </mesh>
      <mesh>
        <ringGeometry args={[10.1, 10.18, 96]} />
        <meshBasicMaterial color={RUNE} toneMapped={false} transparent opacity={0.6} />
      </mesh>
      <mesh>
        <ringGeometry args={[3.4, 3.48, 64]} />
        <meshBasicMaterial color={RUNE} toneMapped={false} transparent opacity={0.6} />
      </mesh>
      {/* 오각별 */}
      {Array.from({ length: 5 }, (_, i) => {
        const a1 = (i / 5) * Math.PI * 2
        const a2 = ((i + 2) / 5) * Math.PI * 2
        const r = 9.3
        const x1 = Math.cos(a1) * r
        const y1 = Math.sin(a1) * r
        const x2 = Math.cos(a2) * r
        const y2 = Math.sin(a2) * r
        const length = Math.hypot(x2 - x1, y2 - y1)
        return (
          <mesh key={i} position={[(x1 + x2) / 2, (y1 + y2) / 2, 0]} rotation-z={Math.atan2(y2 - y1, x2 - x1)}>
            <planeGeometry args={[length, 0.07]} />
            <meshBasicMaterial color={RUNE} toneMapped={false} transparent opacity={0.45} />
          </mesh>
        )
      })}
      {/* 바깥 고리의 룬 새김 */}
      {Array.from({ length: runes }, (_, i) => {
        const a = (i / runes) * Math.PI * 2
        return (
          <mesh key={i} position={[Math.cos(a) * 9.78, Math.sin(a) * 9.78, 0]} rotation-z={a + (i % 3) * 0.6}>
            <planeGeometry args={[0.32, 0.06]} />
            <meshBasicMaterial color={RUNE} toneMapped={false} transparent opacity={0.7} />
          </mesh>
        )
      })}
    </group>
  )
}

function Ground() {
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <circleGeometry args={[80, 64]} />
        <meshStandardMaterial color="#0b090e" roughness={0.95} />
      </mesh>
      {/* 광장 돌바닥: 살짝 젖은 듯 반들거리게 */}
      <mesh rotation-x={-Math.PI / 2} position-y={0.01} receiveShadow>
        <circleGeometry args={[ARENA_RADIUS + 1, 64]} />
        <meshStandardMaterial color={STONE} roughness={0.5} metalness={0.25} />
      </mesh>
      <RitualCircle />
      {/* 무너진 돌기둥 울타리 */}
      {Array.from({ length: 30 }, (_, i) => {
        const a = (i / 30) * Math.PI * 2
        const r = ARENA_RADIUS + 1.2
        const h = 0.8 + ((i * 7) % 5) * 0.45
        const broken = i % 4 === 1
        return (
          <mesh
            key={i}
            position={[Math.cos(a) * r, (broken ? h * 0.4 : h) / 2, Math.sin(a) * r]}
            rotation={[broken ? 0.25 : 0, -a, broken ? 0.2 : 0]}
            castShadow
          >
            <boxGeometry args={[0.7, broken ? h * 0.4 : h, 0.7]} />
            <meshStandardMaterial color="#1e1a22" roughness={0.9} />
          </mesh>
        )
      })}
    </group>
  )
}

// ---------------- 교수대의 샌드백 ----------------

function Chain({ length }: { length: number }) {
  const links = Math.round(length / 0.16)
  return (
    <group>
      {Array.from({ length: links }, (_, i) => (
        <mesh key={i} position-y={-i * 0.16} rotation-y={i % 2 ? Math.PI / 2 : 0}>
          <torusGeometry args={[0.06, 0.018, 6, 10]} />
          <meshStandardMaterial color="#3b3a40" metalness={1} roughness={0.35} />
        </mesh>
      ))}
    </group>
  )
}

function Sandbag({ bag, index, count, selected }: { bag: Bag; index: number; count: number; selected: boolean }) {
  const swing = useRef<THREE.Group>(null)
  const body = useRef<THREE.MeshStandardMaterial>(null)
  const glow = useRef<THREE.MeshBasicMaterial>(null)
  const [x, z] = bagPosition(index, count)
  const color = useMemo(() => effigyColor(bag.id), [bag.id])
  // 교수대가 광장 가운데를 등지고 서도록
  const facing = Math.atan2(x, z)

  useFrame((_, dt) => {
    const shake = bagShake.get(bag.id) ?? 0
    const t = performance.now() / 1000
    if (swing.current) {
      // 맞지 않아도 바람에 조금씩 흔들린다
      swing.current.rotation.z = Math.sin(t * 6) * 0.22 * shake + Math.sin(t * 0.9 + index) * 0.03
      swing.current.rotation.x = Math.cos(t * 4.8) * 0.14 * shake
    }
    if (body.current) body.current.emissiveIntensity = Math.min(shake, 1) * 1.2
    if (glow.current) glow.current.opacity = (selected ? 0.85 : 0.3) + Math.min(shake, 1) * 0.15
    if (shake > 0) bagShake.set(bag.id, Math.max(0, shake - dt * 2.5))
  })

  return (
    <group position={[x, 0, z]} rotation-y={facing}>
      <mesh rotation-x={-Math.PI / 2} position-y={0.03}>
        <ringGeometry args={[1.1, 1.5, 40]} />
        <meshBasicMaterial ref={glow} color="#7a0d18" transparent opacity={0.18} />
      </mesh>
      {/* 교수대: 나무 기둥 + 가로대 */}
      <mesh position={[0, 2.3, -0.9]} castShadow>
        <boxGeometry args={[0.22, 4.6, 0.22]} />
        <meshStandardMaterial color="#1f1712" roughness={0.95} />
      </mesh>
      <mesh position={[0, 4.5, -0.25]} castShadow>
        <boxGeometry args={[0.18, 0.18, 1.5]} />
        <meshStandardMaterial color="#1f1712" roughness={0.95} />
      </mesh>
      <mesh position={[0, 3.95, -0.62]} rotation-x={Math.PI / 4}>
        <boxGeometry args={[0.12, 0.12, 0.8]} />
        <meshStandardMaterial color="#1f1712" roughness={0.95} />
      </mesh>
      <group ref={swing} position={[0, 4.4, 0.35]}>
        <Chain length={0.75} />
        <mesh position-y={-1.75} castShadow>
          <capsuleGeometry args={[0.6, 1.4, 8, 18]} />
          <meshStandardMaterial ref={body} color={color} roughness={0.75} emissive="#ff1010" emissiveIntensity={0} />
        </mesh>
        {/* 묶은 밧줄 두 줄 */}
        {[-1.25, -2.25].map((y) => (
          <mesh key={y} position-y={y}>
            <cylinderGeometry args={[0.615, 0.615, 0.12, 20, 1, true]} />
            <meshStandardMaterial color="#3a2d1f" roughness={1} side={THREE.DoubleSide} />
          </mesh>
        ))}
      </group>
      {/* 핏빛 룬처럼 빛나는 회사 이름 */}
      <Billboard position-y={5.6}>
        <Text fontSize={0.52} maxWidth={3.2} textAlign="center" outlineWidth={0.015} outlineColor="#1a0003">
          {bag.name}
          <meshBasicMaterial color={selected ? RUNE.clone().multiplyScalar(1.5) : RUNE} toneMapped={false} />
        </Text>
      </Billboard>
      <Billboard position-y={4.98}>
        <Text fontSize={0.28} color="#a49aa8">
          {`원한 ${bag.score.toLocaleString()}`}
        </Text>
      </Billboard>
    </group>
  )
}

// ---------------- 망토 쓴 형체 ----------------

function Avatar({ color, name, me, moving }: { color: string; name: string; me?: boolean; moving: React.RefObject<number> }) {
  const bob = useRef<THREE.Group>(null)
  const cloak = useMemo(() => cloakColor(color), [color])
  const eye = useMemo(() => new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.35).multiplyScalar(3), [color])

  useFrame(() => {
    if (!bob.current) return
    const t = performance.now() / 1000
    const m = moving.current ?? 0
    bob.current.position.y = Math.abs(Math.sin(t * 9)) * 0.07 * m
    bob.current.rotation.z = Math.sin(t * 9) * 0.05 * m
    bob.current.rotation.x = 0.12 * m // 앞으로 기울어 걷는다
  })

  return (
    <group>
      {me && (
        <mesh rotation-x={-Math.PI / 2} position-y={0.03}>
          <ringGeometry args={[0.6, 0.68, 6]} />
          <meshBasicMaterial color={eye} toneMapped={false} transparent opacity={0.6} />
        </mesh>
      )}
      <group ref={bob}>
        {/* 망토: 아래로 퍼지는 원뿔 */}
        <mesh position-y={0.75} castShadow>
          <coneGeometry args={[0.55, 1.5, 10, 1, true]} />
          <meshStandardMaterial color={cloak} roughness={0.9} side={THREE.DoubleSide} />
        </mesh>
        <mesh position-y={0.75}>
          <cylinderGeometry args={[0.2, 0.32, 1.3, 8]} />
          <meshStandardMaterial color="#060507" roughness={1} />
        </mesh>
        {/* 뾰족한 후드 */}
        <mesh position-y={1.62} castShadow>
          <coneGeometry args={[0.34, 0.75, 10]} />
          <meshStandardMaterial color={cloak} roughness={0.9} />
        </mesh>
        <mesh position={[0, 1.45, -0.12]}>
          <sphereGeometry args={[0.24, 14, 14]} />
          <meshStandardMaterial color="#020203" roughness={1} />
        </mesh>
        {[-0.08, 0.08].map((ex) => (
          <mesh key={ex} position={[ex, 1.47, -0.34]}>
            <sphereGeometry args={[0.032, 8, 8]} />
            <meshBasicMaterial color={eye} toneMapped={false} />
          </mesh>
        ))}
        {/* 주먹에 감은 붉은 기운 */}
        <mesh position={[0.4, 0.95, -0.22]}>
          <sphereGeometry args={[0.11, 10, 10]} />
          <meshBasicMaterial color={new THREE.Color('#ff2a3a').multiplyScalar(1.2)} toneMapped={false} />
        </mesh>
      </group>
      <Billboard position-y={2.3}>
        <Text fontSize={0.22} color={me ? '#d9d2dc' : '#7d7482'} outlineWidth={0.012} outlineColor="#000">
          {name}
        </Text>
      </Billboard>
    </group>
  )
}

function nearestBag(pos: Vec2, bags: Bag[]) {
  let best: { bag: Bag; x: number; z: number; d: number } | null = null
  bags.forEach((bag, i) => {
    const [x, z] = bagPosition(i, bags.length)
    const d = Math.hypot(x - pos.x, z - pos.z)
    if (!best || d < best.d) best = { bag, x, z, d }
  })
  return best as { bag: Bag; x: number; z: number; d: number } | null
}

function LocalPlayer({
  conn,
  me,
  bags,
  onTarget,
  onLocalAttack,
}: {
  conn: ArenaConnection
  me: PlayerInfo
  bags: Bag[]
  onTarget: (companyId: number | null) => void
  onLocalAttack: (weapon: Weapon, from: Vec2, to: Vec2, companyId: number) => void
}) {
  const body = useRef<THREE.Group>(null)
  const position = useRef<Vec2>({ x: me.x, z: me.z })
  const rotation = useRef(me.r)
  const moving = useRef(0)
  const lastFired = useRef<Record<Weapon, number>>({ punch: 0, gun: 0, missile: 0 })
  const targetId = useRef<number | null>(null)

  useFrame(({ camera: cam }, dt) => {
    const pos = position.current
    const [mx, mz] = moveVector()
    moving.current = Math.min(1, Math.hypot(mx, mz))
    if (mx || mz) {
      pos.x += mx * SPEED * dt
      pos.z += mz * SPEED * dt
      const d = Math.hypot(pos.x, pos.z)
      if (d > ARENA_RADIUS) {
        pos.x *= ARENA_RADIUS / d
        pos.z *= ARENA_RADIUS / d
      }
      rotation.current = Math.atan2(-mx, -mz)
    }

    const target = nearestBag(pos, bags)
    const id = target?.bag.id ?? null
    if (id !== targetId.current) {
      targetId.current = id
      onTarget(id)
    }

    const now = performance.now()
    for (const weapon of takeWeapons()) {
      if (!target || now - lastFired.current[weapon] < COOLDOWN[weapon]) continue
      if (weapon === 'punch' && target.d > PUNCH_RANGE) continue
      lastFired.current[weapon] = now
      rotation.current = Math.atan2(-(target.x - pos.x), -(target.z - pos.z))
      conn.sendAttack(target.bag.id, weapon)
      onLocalAttack(weapon, { ...pos }, { x: target.x, z: target.z }, target.bag.id)
    }

    if (body.current) {
      body.current.position.set(pos.x, 0, pos.z)
      body.current.rotation.y = rotation.current
    }
    conn.sendMove(pos.x, pos.z, rotation.current)

    const desired = new THREE.Vector3(pos.x, 0, pos.z).add(CAMERA_OFFSET)
    cam.position.lerp(desired, 1 - Math.exp(-dt * 6))
    if (camera.shake > 0) {
      cam.position.x += (Math.random() - 0.5) * camera.shake
      cam.position.y += (Math.random() - 0.5) * camera.shake
      camera.shake = Math.max(0, camera.shake - dt * 2)
    }
    cam.lookAt(pos.x, 1.2, pos.z)
    myPosition.x = pos.x
    myPosition.z = pos.z
  })

  return (
    <group ref={body}>
      <Avatar color={me.color} name={me.name} me moving={moving} />
    </group>
  )
}

function RemoteAvatar({ conn, id }: { conn: ArenaConnection; id: number }) {
  const group = useRef<THREE.Group>(null)
  const moving = useRef(0)
  const p = conn.players.get(id)

  useFrame(() => {
    const player = conn.players.get(id)
    const g = group.current
    if (!player || !g) return
    const speed = Math.hypot(player.x - g.position.x, player.z - g.position.z)
    moving.current = Math.min(1, speed * 20)
    g.position.set(player.x, 0, player.z)
    g.rotation.y = player.r
  })

  if (!p) return null
  return (
    <group ref={group} position={[p.x, 0, p.z]}>
      <Avatar color={p.color} name={p.name} moving={moving} />
    </group>
  )
}

function RemotePlayers({ conn }: { conn: ArenaConnection }) {
  const [ids, setIds] = useState<number[]>([])

  useEffect(() => {
    const sync = () => setIds([...conn.players.keys()])
    sync()
    return conn.subscribe(sync)
  }, [conn])

  useFrame((_, dt) => conn.interpolate(1 - Math.exp(-dt * 10)))

  return (
    <>
      {ids.map((id) => (
        <RemoteAvatar key={id} conn={conn} id={id} />
      ))}
    </>
  )
}

// ---------------- 공격 효과 ----------------
// 총 = 붉은 마력탄, 미사일 = 떨어지는 화염 운석, 주먹 = 충격파

function EffectView({ effect, onDone }: { effect: Effect; onDone: (key: number) => void }) {
  const head = useRef<THREE.Mesh>(null)
  const trail = useRef<THREE.Group>(null)
  const boom = useRef<THREE.Mesh>(null)
  const ring = useRef<THREE.Mesh>(null)
  const light = useRef<THREE.PointLight>(null)
  const label = useRef<THREE.Group>(null)
  const shookCamera = useRef(false)
  const flight = effect.weapon === 'missile' ? 0.8 : effect.weapon === 'gun' ? 0.09 : 0.05
  const duration = effect.weapon === 'missile' ? 1.6 : 0.7

  const { from, to } = effect
  const direction = useMemo(() => Math.atan2(to.x - from.x, to.z - from.z), [from, to])

  useFrame(() => {
    const t = (performance.now() - effect.born) / 1000
    if (t > duration) {
      onDone(effect.key)
      return
    }
    const p = Math.min(t / flight, 1)
    const hit = t >= flight
    const at = (q: number) =>
      new THREE.Vector3(
        from.x + (to.x - from.x) * q,
        effect.weapon === 'missile' ? 1.2 + Math.sin(q * Math.PI) * 6 + q * 1.3 : 1.3 + q * 1.1,
        from.z + (to.z - from.z) * q,
      )

    if (head.current) {
      head.current.visible = !hit && effect.weapon !== 'punch'
      head.current.position.copy(at(p))
    }
    if (trail.current) {
      trail.current.children.forEach((child, i) => {
        const q = Math.max(0, p - (i + 1) * 0.05)
        child.visible = !hit && effect.weapon === 'missile'
        child.position.copy(at(q))
        child.scale.setScalar(0.2 + i * 0.1)
      })
    }

    const after = hit ? (t - flight) / (duration - flight) : 0
    if (boom.current) {
      boom.current.visible = hit
      const size = effect.weapon === 'missile' ? 3.4 : effect.weapon === 'punch' ? 0.8 : 0.4
      boom.current.scale.setScalar(0.3 + after * size)
      ;(boom.current.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - after * 1.6)
    }
    if (ring.current) {
      ring.current.visible = hit && effect.weapon !== 'gun'
      ring.current.scale.setScalar(0.2 + after * (effect.weapon === 'missile' ? 6 : 2))
      ;(ring.current.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.9 - after * 1.3)
    }
    if (light.current) {
      light.current.intensity = hit ? Math.max(0, 1 - after * 2) * (effect.weapon === 'missile' ? 70 : 6) : 0
    }
    if (label.current) {
      label.current.visible = hit && effect.weapon !== 'gun'
      label.current.position.y = 3.8 + after * 1.2
    }
    if (hit && effect.weapon === 'missile' && !shookCamera.current) {
      shookCamera.current = true
      const distance = Math.hypot(to.x - myPosition.x, to.z - myPosition.z)
      camera.shake = Math.max(camera.shake, Math.max(0, 0.9 - distance * 0.05))
    }
  })

  const impact: [number, number, number] = [to.x, 2.5, to.z]
  const color = effect.weapon === 'gun' ? BOLT : FIRE
  return (
    <>
      <mesh ref={head} rotation-y={direction}>
        {effect.weapon === 'gun' ? <capsuleGeometry args={[0.05, 0.7, 4, 6]} /> : <icosahedronGeometry args={[0.32, 0]} />}
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      {effect.weapon === 'missile' && (
        <group ref={trail}>
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <mesh key={i}>
              <sphereGeometry args={[1, 8, 8]} />
              <meshBasicMaterial
                color={i < 2 ? EMBER : '#2a1f24'}
                transparent
                opacity={i < 2 ? 0.8 : 0.4 - i * 0.04}
                toneMapped={i >= 2}
              />
            </mesh>
          ))}
        </group>
      )}
      <mesh ref={boom} position={impact} visible={false}>
        <sphereGeometry args={[1, 16, 16]} />
        <meshBasicMaterial color={color} transparent toneMapped={false} />
      </mesh>
      <mesh ref={ring} position={[to.x, 0.05, to.z]} rotation-x={-Math.PI / 2} visible={false}>
        <ringGeometry args={[0.8, 1, 40]} />
        <meshBasicMaterial color={RUNE} transparent toneMapped={false} />
      </mesh>
      <pointLight ref={light} position={impact} color="#ff5a2a" intensity={0} distance={effect.weapon === 'missile' ? 20 : 5} />
      <group ref={label} position={[to.x, 3.8, to.z]} visible={false}>
        <Billboard>
          <Text fontSize={effect.weapon === 'missile' ? 0.7 : 0.4} outlineWidth={0.02} outlineColor="#000">
            {`+${POINTS[effect.weapon]}`}
            <meshBasicMaterial color={effect.weapon === 'missile' ? FIRE : '#e6dce8'} toneMapped={false} />
          </Text>
        </Billboard>
      </group>
    </>
  )
}

function shake(companyId: number, weapon: Weapon) {
  const add = weapon === 'missile' ? 1.5 : weapon === 'punch' ? 0.6 : 0.3
  bagShake.set(companyId, Math.min(2, (bagShake.get(companyId) ?? 0) + add))
}

// ---------------- 장면 ----------------

const BRAZIERS = [0.4, 1.45, 2.5, 3.6, 4.7, 5.75]

export function ArenaScene({
  conn,
  me,
  bags,
  onTarget,
  lowPower,
}: {
  conn: ArenaConnection
  me: PlayerInfo
  bags: Bag[]
  onTarget: (companyId: number | null) => void
  lowPower: boolean
}) {
  const [effects, setEffects] = useState<Effect[]>([])
  const [targetId, setTargetId] = useState<number | null>(null)
  const nextKey = useRef(0)
  const bagsRef = useRef(bags)
  useEffect(() => {
    bagsRef.current = bags
  }, [bags])

  const addEffect = (weapon: Weapon, from: Vec2, to: Vec2) => {
    setEffects((list) =>
      list.length >= MAX_EFFECTS ? list : [...list, { key: nextKey.current++, weapon, from, to, born: performance.now() }],
    )
  }

  useEffect(
    () =>
      conn.onAttack((e: AttackEvent) => {
        if (e.playerId === me.id) return // 내 공격은 누를 때 바로 그렸다
        const shooter = conn.players.get(e.playerId)
        const i = bagsRef.current.findIndex((b) => b.id === e.companyId)
        if (!shooter || i < 0) return
        const [x, z] = bagPosition(i, bagsRef.current.length)
        shake(e.companyId, e.weapon)
        addEffect(e.weapon, { x: shooter.x, z: shooter.z }, { x, z })
      }),
    [conn, me.id],
  )

  return (
    <Canvas
      shadows
      camera={{ fov: 55, position: [me.x, 10.5, me.z + 13] }}
      dpr={lowPower ? [1, 1.5] : [1, 2]}
      gl={{ antialias: false, powerPreference: 'high-performance' }}
    >
      <color attach="background" args={[SKY]} />
      <fog attach="fog" args={['#120a16', 14, 62]} />
      <hemisphereLight args={['#4a2a5c', '#0a0508', 0.75]} />
      {/* 핏빛 달 쪽에서 오는 차가운 붉은빛 */}
      <directionalLight
        position={[-14, 22, -20]}
        color="#b24a5a"
        intensity={0.9}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-26}
        shadow-camera-right={26}
        shadow-camera-top={26}
        shadow-camera-bottom={-26}
      />
      {/* 마법진 위를 비추는 붉은 빛기둥 */}
      <spotLight position={[0, 16, 0]} angle={0.62} penumbra={0.9} intensity={320} color="#ff3040" distance={30} />

      <BloodMoon />
      <Spires />
      <Ground />
      {BRAZIERS.map((a) => (
        <Brazier key={a} angle={a} />
      ))}
      <Embers count={lowPower ? 180 : 450} />

      {bags.map((bag, i) => (
        <Sandbag key={bag.id} bag={bag} index={i} count={bags.length} selected={bag.id === targetId} />
      ))}
      <LocalPlayer
        conn={conn}
        me={me}
        bags={bags}
        onTarget={(id) => {
          setTargetId(id)
          onTarget(id)
        }}
        onLocalAttack={(weapon, from, to, companyId) => {
          shake(companyId, weapon)
          addEffect(weapon, from, to)
        }}
      />
      <RemotePlayers conn={conn} />
      {effects.map((effect) => (
        <EffectView
          key={effect.key}
          effect={effect}
          onDone={(key) => setEffects((list) => list.filter((e) => e.key !== key))}
        />
      ))}

      <EffectComposer multisampling={lowPower ? 0 : 4}>
        <Bloom intensity={1.2} luminanceThreshold={0.9} luminanceSmoothing={0.25} mipmapBlur />
        <Noise opacity={0.06} />
        <Vignette offset={0.2} darkness={0.9} />
      </EffectComposer>
    </Canvas>
  )
}

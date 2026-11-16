import { Billboard, Text } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
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
const CAMERA_OFFSET = new THREE.Vector3(0, 11, 13)
const MAX_EFFECTS = 80

type Vec2 = { x: number; z: number }
type Effect = { key: number; weapon: Weapon; from: Vec2; to: Vec2; born: number }

/** 샌드백별 흔들림 세기. 맞을 때 올리고 매 프레임 줄인다. */
const bagShake = new Map<number, number>()

function colorOf(id: number) {
  return new THREE.Color().setHSL(((id * 47) % 360) / 360, 0.45, 0.5)
}

function Ground() {
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <circleGeometry args={[ARENA_RADIUS + 2, 48]} />
        <meshStandardMaterial color="#c9b79c" />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={0.01}>
        <ringGeometry args={[5.5, 9, 48]} />
        <meshStandardMaterial color="#b8a284" />
      </mesh>
      {Array.from({ length: 28 }, (_, i) => {
        const a = (i / 28) * Math.PI * 2
        const r = ARENA_RADIUS + 1.2
        return (
          <mesh key={i} position={[Math.cos(a) * r, 0.6, Math.sin(a) * r]} rotation-y={-a} castShadow>
            <boxGeometry args={[0.4, 1.2, 4.6]} />
            <meshStandardMaterial color="#7a5c3e" />
          </mesh>
        )
      })}
      {[0.6, 2.2, 3.9, 5.3].map((a, i) => (
        <group key={i} position={[Math.cos(a) * 17, 0, Math.sin(a) * 17]}>
          <mesh position-y={0.8} castShadow>
            <cylinderGeometry args={[0.25, 0.3, 1.6]} />
            <meshStandardMaterial color="#6b4a2f" />
          </mesh>
          <mesh position-y={2.6} castShadow>
            <coneGeometry args={[1.4, 2.8, 8]} />
            <meshStandardMaterial color="#5f8a4f" />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function Sandbag({ bag, index, count, selected }: { bag: Bag; index: number; count: number; selected: boolean }) {
  const swing = useRef<THREE.Group>(null)
  const [x, z] = bagPosition(index, count)
  const color = useMemo(() => colorOf(bag.id), [bag.id])

  useFrame((_, dt) => {
    const shake = bagShake.get(bag.id) ?? 0
    if (swing.current) {
      const t = performance.now() / 60
      swing.current.rotation.z = Math.sin(t) * 0.25 * shake
      swing.current.rotation.x = Math.cos(t * 0.8) * 0.15 * shake
    }
    if (shake > 0) bagShake.set(bag.id, Math.max(0, shake - dt * 2.5))
  })

  return (
    <group position={[x, 0, z]}>
      <mesh position-y={2} castShadow>
        <cylinderGeometry args={[0.08, 0.08, 4]} />
        <meshStandardMaterial color="#444" />
      </mesh>
      <mesh position={[0, 4, 0.5]} rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.06, 0.06, 1]} />
        <meshStandardMaterial color="#444" />
      </mesh>
      <group ref={swing} position={[0, 4, 1]}>
        <mesh position-y={-0.3}>
          <cylinderGeometry args={[0.02, 0.02, 0.6]} />
          <meshStandardMaterial color="#222" />
        </mesh>
        <mesh position-y={-1.6} castShadow>
          <capsuleGeometry args={[0.65, 1.4, 6, 16]} />
          <meshStandardMaterial color={color} emissive={selected ? '#ff5533' : '#000'} emissiveIntensity={0.35} />
        </mesh>
      </group>
      {/* 이름표는 몸통 밖(머리 위)에 둔다: 몸통 중심에 두면 캡슐에 가려 안 보였다 */}
      <Billboard position-y={5.6}>
        <Text fontSize={0.5} color="#fff" outlineWidth={0.05} outlineColor="#000" maxWidth={3} textAlign="center">
          {bag.name}
        </Text>
      </Billboard>
      <Billboard position-y={4.9}>
        <Text fontSize={0.36} color="#ffdd55" outlineWidth={0.04} outlineColor="#000">
          {`분노 ${bag.score.toLocaleString()}`}
        </Text>
      </Billboard>
    </group>
  )
}

function Avatar({ color, name, me }: { color: string; name: string; me?: boolean }) {
  return (
    <group>
      <mesh position-y={0.8} castShadow>
        <capsuleGeometry args={[0.45, 0.6, 6, 16]} />
        <meshStandardMaterial color={color} />
      </mesh>
      {[-0.17, 0.17].map((ex) => (
        <mesh key={ex} position={[ex, 1.15, -0.4]}>
          <sphereGeometry args={[0.08, 8, 8]} />
          <meshStandardMaterial color="#111" />
        </mesh>
      ))}
      <mesh position={[0.5, 0.85, -0.2]} castShadow>
        <sphereGeometry args={[0.17, 10, 10]} />
        <meshStandardMaterial color="#d33" />
      </mesh>
      <Billboard position-y={2.1}>
        <Text fontSize={0.3} color={me ? '#ffdd55' : '#fff'} outlineWidth={0.03} outlineColor="#000">
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
  const lastFired = useRef<Record<Weapon, number>>({ punch: 0, gun: 0, missile: 0 })
  const targetId = useRef<number | null>(null)

  useFrame(({ camera }, dt) => {
    const pos = position.current
    const [mx, mz] = moveVector()
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
    camera.position.lerp(desired, 1 - Math.exp(-dt * 6))
    camera.lookAt(pos.x, 1, pos.z)
  })

  return (
    <group ref={body}>
      <Avatar color={me.color} name={me.name} me />
    </group>
  )
}

function RemotePlayers({ conn }: { conn: ArenaConnection }) {
  const [ids, setIds] = useState<number[]>([])
  const groups = useRef(new Map<number, THREE.Group>())

  useEffect(() => {
    const sync = () => setIds([...conn.players.keys()])
    sync()
    return conn.subscribe(sync)
  }, [conn])

  useFrame((_, dt) => {
    conn.interpolate(1 - Math.exp(-dt * 10))
    for (const [id, p] of conn.players) {
      const g = groups.current.get(id)
      if (g) {
        g.position.set(p.x, 0, p.z)
        g.rotation.y = p.r
      }
    }
  })

  return (
    <>
      {ids.map((id) => {
        const p = conn.players.get(id)
        if (!p) return null
        return (
          <group
            key={id}
            ref={(g) => {
              if (g) groups.current.set(id, g)
              else groups.current.delete(id)
            }}
            position={[p.x, 0, p.z]}
          >
            <Avatar color={p.color} name={p.name} />
          </group>
        )
      })}
    </>
  )
}

function EffectView({ effect, onDone }: { effect: Effect; onDone: (key: number) => void }) {
  const ref = useRef<THREE.Mesh>(null)
  const boom = useRef<THREE.Mesh>(null)
  const duration = effect.weapon === 'missile' ? 1.3 : effect.weapon === 'gun' ? 0.15 : 0.25

  useFrame(() => {
    const t = (performance.now() - effect.born) / 1000
    if (t > duration) {
      onDone(effect.key)
      return
    }
    const m = ref.current
    if (!m) return
    const { from, to } = effect
    if (effect.weapon === 'gun') {
      const p = Math.min(t / 0.1, 1)
      m.position.set(from.x + (to.x - from.x) * p, 1.6, from.z + (to.z - from.z) * p)
    } else if (effect.weapon === 'missile') {
      const flight = 0.8
      const p = Math.min(t / flight, 1)
      m.visible = p < 1
      m.position.set(from.x + (to.x - from.x) * p, 1 + Math.sin(p * Math.PI) * 5 + p * 1.5, from.z + (to.z - from.z) * p)
      if (boom.current) {
        const b = Math.max(0, (t - flight) / (duration - flight))
        boom.current.visible = t > flight
        boom.current.scale.setScalar(0.5 + b * 3)
        ;(boom.current.material as THREE.MeshBasicMaterial).opacity = 1 - b
      }
    } else {
      const p = t / duration
      m.position.set(to.x, 2.4, to.z + 1)
      m.scale.setScalar(0.3 + p * 1.5)
      ;(m.material as THREE.MeshBasicMaterial).opacity = 1 - p
    }
  })

  return (
    <>
      <mesh ref={ref}>
        <sphereGeometry args={[effect.weapon === 'missile' ? 0.3 : 0.12, 8, 8]} />
        <meshBasicMaterial
          color={effect.weapon === 'missile' ? '#555' : effect.weapon === 'gun' ? '#ffe066' : '#fff'}
          transparent
        />
      </mesh>
      {effect.weapon === 'missile' && (
        <mesh ref={boom} position={[effect.to.x, 2.4, effect.to.z + 1]} visible={false}>
          <sphereGeometry args={[1, 16, 16]} />
          <meshBasicMaterial color="#ff7b2e" transparent />
        </mesh>
      )}
    </>
  )
}

function shake(companyId: number, weapon: Weapon) {
  const add = weapon === 'missile' ? 1.5 : weapon === 'punch' ? 0.6 : 0.3
  bagShake.set(companyId, Math.min(2, (bagShake.get(companyId) ?? 0) + add))
}

export function ArenaScene({
  conn,
  me,
  bags,
  onTarget,
}: {
  conn: ArenaConnection
  me: PlayerInfo
  bags: Bag[]
  onTarget: (companyId: number | null) => void
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
    <Canvas shadows camera={{ fov: 50, position: [me.x, 11, me.z + 13] }} dpr={[1, 2]}>
      <color attach="background" args={['#9fc6e6']} />
      <fog attach="fog" args={['#9fc6e6', 30, 60]} />
      <hemisphereLight args={['#ffffff', '#8a7a5a', 0.9]} />
      <directionalLight
        position={[10, 18, 8]}
        intensity={1.4}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-25}
        shadow-camera-right={25}
        shadow-camera-top={25}
        shadow-camera-bottom={-25}
      />
      <Ground />
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
    </Canvas>
  )
}

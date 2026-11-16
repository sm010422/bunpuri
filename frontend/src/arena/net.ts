import { API_BASE } from '../api'

export type Weapon = 'punch' | 'gun' | 'missile'
export type Bag = { id: number; name: string; score: number }
export type PlayerInfo = { id: number; name: string; color: string; x: number; z: number; r: number }
export type AttackEvent = { playerId: number; companyId: number; weapon: Weapon }
export type Status = 'connecting' | 'online' | 'offline'

/** 화면(React)이 구독하는 상태. 위치처럼 초당 수십 번 바뀌는 값은 여기 넣지 않고 players 맵을 직접 읽는다. */
export type ArenaSnapshot = {
  status: Status
  me: PlayerInfo | null
  channel: number | null
  playerCount: number
  bags: Bag[]
}

export type RemotePlayer = PlayerInfo & { targetX: number; targetZ: number; targetR: number }

/** 무기별 쿨다운(ms). 서버는 이 값의 80%로 검사한다 (Weapon.java). */
export const COOLDOWN: Record<Weapon, number> = { punch: 250, gun: 120, missile: 3000 }
export const PUNCH_RANGE = 3
const SEND_INTERVAL_MS = 100

function wsUrl() {
  return API_BASE.replace(/^http/, 'ws') + '/ws/arena'
}

/**
 * 3D 마당 서버와의 연결. 끊기면 지수 백오프로 다시 붙는다.
 * 원격 플레이어 위치는 서버 틱(10Hz)으로 목표값만 갱신하고, 화면은 매 프레임 그 목표로 보간한다.
 */
export class ArenaConnection {
  readonly players = new Map<number, RemotePlayer>()
  private socket: WebSocket | null = null
  private snapshot: ArenaSnapshot = { status: 'connecting', me: null, channel: null, playerCount: 0, bags: [] }
  private listeners = new Set<() => void>()
  private attackListeners = new Set<(e: AttackEvent) => void>()
  private retry = 0
  private closed = false
  private lastSent = { x: NaN, z: NaN, r: NaN, at: 0 }

  connect() {
    this.closed = false
    const socket = new WebSocket(wsUrl())
    this.socket = socket
    this.update({ status: 'connecting' })
    socket.onmessage = (e) => this.onMessage(JSON.parse(e.data))
    socket.onclose = () => {
      if (this.socket !== socket) return
      this.players.clear()
      this.update({ status: 'offline', playerCount: 0 })
      if (!this.closed) {
        const delay = Math.min(1000 * 2 ** this.retry++, 15000)
        window.setTimeout(() => this.connect(), delay)
      }
    }
  }

  close() {
    this.closed = true
    this.socket?.close()
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** 원격 플레이어를 서버가 준 목표 위치 쪽으로 k(0~1)만큼 옮긴다. 매 프레임 호출. */
  interpolate(k: number) {
    for (const p of this.players.values()) {
      p.x += (p.targetX - p.x) * k
      p.z += (p.targetZ - p.z) * k
      p.r = p.targetR
    }
  }

  getSnapshot = () => this.snapshot

  onAttack(listener: (e: AttackEvent) => void) {
    this.attackListeners.add(listener)
    return () => {
      this.attackListeners.delete(listener)
    }
  }

  /** 매 프레임 불러도 된다. 실제 전송은 100ms마다, 움직였을 때만. */
  sendMove(x: number, z: number, r: number) {
    const now = performance.now()
    const s = this.lastSent
    if (now - s.at < SEND_INTERVAL_MS) return
    if (Math.abs(x - s.x) < 0.01 && Math.abs(z - s.z) < 0.01 && Math.abs(r - s.r) < 0.01) return
    if (this.send({ t: 'move', x: round(x), z: round(z), r: round(r) })) {
      this.lastSent = { x, z, r, at: now }
    }
  }

  sendAttack(companyId: number, weapon: Weapon) {
    this.send({ t: 'attack', c: companyId, w: weapon })
  }

  pick(companyId: number) {
    this.send({ t: 'pick', c: companyId })
  }

  private send(message: object) {
    if (this.socket?.readyState !== WebSocket.OPEN) return false
    this.socket.send(JSON.stringify(message))
    return true
  }

  private onMessage(m: ServerMessage) {
    switch (m.t) {
      case 'welcome':
        this.retry = 0
        this.players.clear()
        m.players.forEach((p) => this.players.set(p.id, remote(p)))
        this.update({ status: 'online', me: m.you, channel: m.ch, bags: m.bags, playerCount: m.players.length + 1 })
        break
      case 'join':
        this.players.set(m.p.id, remote(m.p))
        this.update({ playerCount: this.players.size + 1 })
        break
      case 'leave':
        this.players.delete(m.id)
        this.update({ playerCount: this.players.size + 1 })
        break
      case 'tick':
        for (const [id, x, z, r] of m.p) {
          const p = this.players.get(id)
          if (p) Object.assign(p, { targetX: x, targetZ: z, targetR: r })
        }
        for (const [playerId, companyId, weapon] of m.a) {
          this.attackListeners.forEach((l) => l({ playerId, companyId, weapon }))
        }
        break
      case 'bags':
        this.update({ bags: m.bags })
        break
    }
  }

  private update(patch: Partial<ArenaSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch }
    this.listeners.forEach((l) => l())
  }
}

type ServerMessage =
  | { t: 'welcome'; you: PlayerInfo; ch: number; players: PlayerInfo[]; bags: Bag[] }
  | { t: 'join'; p: PlayerInfo }
  | { t: 'leave'; id: number }
  | { t: 'tick'; p: [number, number, number, number][]; a: [number, number, Weapon][] }
  | { t: 'bags'; bags: Bag[] }

function remote(p: PlayerInfo): RemotePlayer {
  return { ...p, targetX: p.x, targetZ: p.z, targetR: p.r }
}

function round(v: number) {
  return Math.round(v * 100) / 100
}

/** 샌드백 위치: 가운데를 둘러싼 원. 모든 클라이언트가 같은 목록 순서로 같은 자리에 그린다. */
export function bagPosition(index: number, count: number): [number, number] {
  const radius = 7
  const angle = (index / Math.max(count, 1)) * Math.PI * 2 - Math.PI / 2
  return [Math.cos(angle) * radius, Math.sin(angle) * radius]
}

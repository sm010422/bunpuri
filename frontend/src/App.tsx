import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { api, RateLimitedError, type Company, type Ranking, type Vent } from './api'
import { bindKeyboard, input, pressWeapon } from './arena/input'
import { ArenaConnection, COOLDOWN, type Weapon } from './arena/net'
import { ArenaScene } from './arena/Scene'

function useToast() {
  const [message, setMessage] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const show = useCallback((text: string) => {
    setMessage(text)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setMessage(null), 2500)
  }, [])
  return { message, show }
}

function errorText(e: unknown) {
  return e instanceof RateLimitedError ? e.message : '서버가 잠깐 대답을 못 하네요'
}

function CompanyPicker({ value, onChange }: { value: Company | null; onChange: (c: Company | null) => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Company[]>([])

  useEffect(() => {
    const q = query.trim()
    if (!q) return
    const t = window.setTimeout(() => {
      api.searchCompanies(q).then(setResults).catch(() => setResults([]))
    }, 250)
    return () => window.clearTimeout(t)
  }, [query])

  if (value) {
    return (
      <div className="picked">
        <span>대상: <b>{value.name}</b></span>
        <button className="link" onClick={() => onChange(null)}>바꾸기</button>
      </div>
    )
  }
  return (
    <div className="picker">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="어느 회사 때문이에요? (비워도 돼요)"
        aria-label="회사 검색"
      />
      {query.trim() && results.length > 0 && (
        <ul className="results">
          {results.map((c) => (
            <li key={c.id}>
              <button onClick={() => { onChange(c); setQuery('') }}>{c.name}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function RankingBoard() {
  const [ranking, setRanking] = useState<Ranking | null>(null)
  useEffect(() => {
    const load = () => api.ranking().then(setRanking).catch(() => {})
    load()
    const t = window.setInterval(load, 5000)
    return () => window.clearInterval(t)
  }, [])

  return (
    <section className="card">
      <h2>오늘의 분노 순위</h2>
      {!ranking || ranking.top.length === 0 ? (
        <p className="muted">아직 아무도 안 쳤어요</p>
      ) : (
        <ol className="ranking">
          {ranking.top.map((r) => (
            <li key={r.companyId}>
              <span>{r.companyName}</span>
              <span className="count">{r.count.toLocaleString()}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

function VentBoard({ company, notify }: { company: Company | null; notify: (msg: string) => void }) {
  const [content, setContent] = useState('')
  const [vents, setVents] = useState<Vent[]>([])
  const [hasMore, setHasMore] = useState(true)
  const [sending, setSending] = useState(false)

  const loadMore = useCallback(async (reset = false) => {
    try {
      const cursor = reset ? undefined : vents.at(-1)?.id
      const page = await api.feed(cursor)
      setVents((prev) => (reset ? page : [...prev, ...page]))
      setHasMore(page.length === 20)
    } catch (e) {
      notify(errorText(e))
    }
  }, [vents, notify])

  // 처음 한 번만 불러온다
  const loaded = useRef(false)
  useEffect(() => {
    if (loaded.current) return
    loaded.current = true
    loadMore(true)
  }, [loadMore])

  const submit = async () => {
    const text = content.trim()
    if (!text || sending) return
    setSending(true)
    try {
      const created = await api.createVent(company?.id ?? null, text)
      setVents((prev) => [created, ...prev])
      setContent('')
      // 위로 문구는 서버가 나중에 채우므로 잠시 뒤 다시 읽는다.
      window.setTimeout(() => loadMore(true), 1500)
    } catch (e) {
      notify(errorText(e))
    } finally {
      setSending(false)
    }
  }

  const report = async (id: number) => {
    try {
      await api.report(id)
      notify('신고했어요. 여러 명이 신고하면 가려져요')
    } catch (e) {
      notify(errorText(e))
    }
  }

  return (
    <section className="card">
      <h2>한 줄 외침</h2>
      <div className="composer">
        <textarea
          value={content}
          maxLength={200}
          onChange={(e) => setContent(e.target.value)}
          placeholder="속에 있는 말 한 줄. 사람 이름이나 연락처는 쓰지 마세요."
          rows={3}
        />
        <div className="composer-foot">
          <span className="muted">{content.length}/200</span>
          <button className="primary" onClick={submit} disabled={!content.trim() || sending}>외치기</button>
        </div>
      </div>
      <ul className="feed">
        {vents.map((v) => (
          <li key={v.id}>
            <p className="tag">{v.companyName}</p>
            <p>{v.content}</p>
            {v.comfort && <p className="comfort">↳ {v.comfort}</p>}
            <button className="link small" onClick={() => report(v.id)}>신고</button>
          </li>
        ))}
      </ul>
      {hasMore && vents.length > 0 && <button className="link" onClick={() => loadMore()}>더 보기</button>}
    </section>
  )
}

type Panel = 'pick' | 'ranking' | 'vents' | null

const WEAPONS: { weapon: Weapon; label: string; key: string }[] = [
  { weapon: 'punch', label: '주먹', key: 'J' },
  { weapon: 'gun', label: '총', key: 'K' },
  { weapon: 'missile', label: '미사일', key: 'L' },
]

function WeaponPad() {
  const [missileReadyAt, setMissileReadyAt] = useState(0)
  const [now, setNow] = useState(() => performance.now())

  useEffect(() => {
    if (missileReadyAt <= now) return
    const t = window.setTimeout(() => setNow(performance.now()), 100)
    return () => window.clearTimeout(t)
  }, [missileReadyAt, now])

  const press = (weapon: Weapon) => {
    pressWeapon(weapon)
    if (weapon === 'missile' && performance.now() >= missileReadyAt) {
      setMissileReadyAt(performance.now() + COOLDOWN.missile)
      setNow(performance.now())
    }
  }
  const release = (weapon: Weapon) => input.firing.delete(weapon)
  const missileLeft = Math.max(0, missileReadyAt - now)

  return (
    <div className="weapons">
      {WEAPONS.map(({ weapon, label, key }) => (
        <button
          key={weapon}
          className={`weapon ${weapon}`}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId)
            press(weapon)
          }}
          onPointerUp={() => release(weapon)}
          onPointerCancel={() => release(weapon)}
          onContextMenu={(e) => e.preventDefault()}
        >
          {weapon === 'missile' && missileLeft > 0 ? `${Math.ceil(missileLeft / 1000)}초` : label}
          <small>{key}</small>
        </button>
      ))}
    </div>
  )
}

function Joystick() {
  const base = useRef<HTMLDivElement>(null)
  const [knob, setKnob] = useState({ x: 0, y: 0 })

  const move = (e: React.PointerEvent) => {
    const rect = base.current!.getBoundingClientRect()
    const radius = rect.width / 2
    let x = (e.clientX - rect.left - radius) / radius
    let y = (e.clientY - rect.top - radius) / radius
    const length = Math.hypot(x, y)
    if (length > 1) {
      x /= length
      y /= length
    }
    input.joystick = { x, y }
    setKnob({ x: x * radius * 0.6, y: y * radius * 0.6 })
  }
  const end = () => {
    input.joystick = { x: 0, y: 0 }
    setKnob({ x: 0, y: 0 })
  }

  return (
    <div
      ref={base}
      className="joystick"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        move(e)
      }}
      onPointerMove={(e) => e.buttons && move(e)}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <span style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
    </div>
  )
}

export default function App() {
  const conn = useMemo(() => new ArenaConnection(), [])
  const arena = useSyncExternalStore(conn.subscribe, conn.getSnapshot)
  const [panel, setPanel] = useState<Panel>(null)
  const [company, setCompany] = useState<Company | null>(null)
  const [targetId, setTargetId] = useState<number | null>(null)
  const toast = useToast()
  const touch = useMemo(() => window.matchMedia('(pointer: coarse)').matches, [])

  useEffect(() => {
    conn.connect()
    const unbind = bindKeyboard()
    return () => {
      unbind()
      conn.close()
    }
  }, [conn])

  const target = arena.bags.find((b) => b.id === targetId)
  const toggle = (next: Panel) => setPanel((current) => (current === next ? null : next))

  return (
    <div className="arena">
      {arena.me ? (
        <ArenaScene conn={conn} me={arena.me} bags={arena.bags} onTarget={setTargetId} />
      ) : (
        <div className="loading">{arena.status === 'offline' ? '서버에 다시 연결하는 중…' : '분풀이 마당에 들어가는 중…'}</div>
      )}

      <header className="hud-top">
        <div>
          <strong>분풀이</strong>
          {arena.channel && (
            <span className="hud-meta">
              {' '}채널 {arena.channel} · {arena.playerCount}명
              {arena.me && <> · 나는 <b>{arena.me.name}</b></>}
            </span>
          )}
          {arena.status !== 'online' && arena.me && <span className="hud-warn"> 연결 끊김, 다시 연결 중</span>}
        </div>
        <nav>
          <button className={panel === 'pick' ? 'on' : ''} onClick={() => toggle('pick')}>샌드백 세우기</button>
          <button className={panel === 'ranking' ? 'on' : ''} onClick={() => toggle('ranking')}>순위</button>
          <button className={panel === 'vents' ? 'on' : ''} onClick={() => toggle('vents')}>외침</button>
        </nav>
      </header>

      {panel && (
        <aside className="drawer">
          <button className="link close" onClick={() => setPanel(null)}>닫기</button>
          {panel === 'pick' && (
            <section className="card">
              <h2>나를 안 뽑은 회사 세우기</h2>
              <p className="muted">고른 회사 샌드백이 이 채널 마당에 세워져요. 채널마다 최근 3개까지.</p>
              <CompanyPicker
                value={company}
                onChange={(c) => {
                  setCompany(c)
                  if (c) {
                    conn.pick(c.id)
                    toast.show(`${c.name} 샌드백을 세웠어요`)
                  }
                }}
              />
            </section>
          )}
          {panel === 'ranking' && <RankingBoard />}
          {panel === 'vents' && <VentBoard company={company} notify={toast.show} />}
        </aside>
      )}

      <div className="target">
        {target ? (
          <>조준 <b>{target.name}</b></>
        ) : (
          '샌드백을 기다리는 중'
        )}
        {!touch && <span className="hint">WASD 이동 · J 주먹(가까이) · K/Space 총 · L 미사일</span>}
      </div>

      {touch && <Joystick />}
      <WeaponPad />
      {toast.message && <div className="toast" role="status">{toast.message}</div>}
    </div>
  )
}

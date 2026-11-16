import { useCallback, useEffect, useRef, useState } from 'react'
import { api, RateLimitedError, type Company, type Ranking, type Vent } from './api'

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

function Sandbag({ company, onHit }: { company: Company | null; onHit: (msg: string) => void }) {
  const [combo, setCombo] = useState(0)
  const [todayTotal, setTodayTotal] = useState<number | null>(null)
  const [shake, setShake] = useState(0)

  const hit = async () => {
    setShake((s) => s + 1)
    setCombo((c) => c + 1)
    try {
      const res = await api.hit(company?.id ?? null)
      setTodayTotal(res.todayTotal)
    } catch (e) {
      onHit(errorText(e))
    }
  }

  return (
    <section className="card sandbag-card">
      <button key={shake} className="sandbag" onClick={hit} aria-label="샌드백 치기">
        <span className="bag" />
      </button>
      <p className="combo">{combo > 0 ? `${combo}대 쳤어요` : '눌러서 한 대 치기'}</p>
      {todayTotal !== null && <p className="muted">오늘 모두가 친 횟수 {todayTotal.toLocaleString()}대</p>}
    </section>
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

export default function App() {
  const [company, setCompany] = useState<Company | null>(null)
  const toast = useToast()

  return (
    <main>
      <header>
        <h1>분풀이</h1>
        <p className="muted">서류 광탈, 연락 두절, 압박 면접. 여기다 풀고 가요.</p>
      </header>
      <CompanyPicker value={company} onChange={setCompany} />
      <Sandbag company={company} onHit={toast.show} />
      <RankingBoard />
      <VentBoard company={company} notify={toast.show} />
      <footer className="muted">
        익명으로 운영돼요. 회사 이름은 목록에서만 고를 수 있고, 연락처는 자동으로 가려져요.
      </footer>
      {toast.message && <div className="toast" role="status">{toast.message}</div>}
    </main>
  )
}

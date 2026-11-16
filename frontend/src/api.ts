const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? 'http://localhost:8080'

export type Company = { id: number; name: string }
export type Ranking = { todayTotal: number; top: { companyId: number; companyName: string; count: number }[] }
export type Vent = {
  id: number
  companyId: number | null
  companyName: string
  content: string
  comfort: string | null
  createdAt: string
}

export class RateLimitedError extends Error {
  constructor(message: string) {
    super(message)
  }
}

/** 익명 사용자 식별용 UUID. 요청 제한과 중복 신고 방지에만 쓴다. */
function clientId(): string {
  const key = 'bunpuri.clientId'
  try {
    const saved = localStorage.getItem(key)
    if (saved) return saved
    const created = crypto.randomUUID()
    localStorage.setItem(key, created)
    return created
  } catch {
    return (sessionClientId ??= crypto.randomUUID())
  }
}
let sessionClientId: string | undefined

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', 'X-Client-Id': clientId(), ...init?.headers },
  })
  if (res.status === 429) {
    const body = await res.json().catch(() => ({ error: '잠깐 쉬었다 해요' }))
    throw new RateLimitedError(body.error)
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const api = {
  hit: (companyId: number | null) =>
    request<{ todayTotal: number }>('/api/rage', { method: 'POST', body: JSON.stringify({ companyId }) }),
  ranking: () => request<Ranking>('/api/rage/ranking'),
  searchCompanies: (q: string) => request<Company[]>(`/api/companies?q=${encodeURIComponent(q)}`),
  createVent: (companyId: number | null, content: string) =>
    request<Vent>('/api/vents', { method: 'POST', body: JSON.stringify({ companyId, content }) }),
  feed: (cursor?: number) => request<Vent[]>(`/api/vents?size=20${cursor ? `&cursor=${cursor}` : ''}`),
  report: (id: number) => request<void>(`/api/vents/${id}/report`, { method: 'POST' }),
}

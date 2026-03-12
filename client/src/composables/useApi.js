const BASE = import.meta.env.DEV ? '' : ''

export async function fetchApi(path, options = {}) {
  const res = await fetch(`${BASE}/api${path}`, options)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return res.json()
}

export async function startGame(config) {
  return fetchApi('/games/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  })
}

export async function fetchGames(limit = 50) {
  return fetchApi(`/games?limit=${limit}`)
}

export async function fetchGame(id) {
  return fetchApi(`/games/${id}`)
}

export async function fetchGameLogs(id) {
  return fetchApi(`/games/${id}/logs`)
}

export async function fetchStats() {
  return fetchApi('/stats')
}

export async function fetchElo() {
  return fetchApi('/elo')
}

export async function fetchStatus() {
  return fetchApi('/status')
}

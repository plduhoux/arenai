export function formatTokens(n) {
  if (!n) return '0'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k'
  return String(n)
}

export function shortModel(m) {
  if (!m) return '?'
  // claude-opus-4-6 -> Opus 4.6, claude-sonnet-4-5 -> Sonnet 4.5, gpt-5.2 -> GPT-5.2
  return m
    .replace(/^claude-/, '')
    .replace(/^(opus|sonnet|haiku)-(\d+)-(\d+)$/i, (_, name, maj, min) =>
      `${name.charAt(0).toUpperCase() + name.slice(1)} ${maj}.${min}`)
    .replace(/^(gpt-)/i, 'GPT-')
    .replace(/^grok-4\.20.*$/i, 'Grok 4.20')
    .replace(/^grok-4-1-fast.*$/i, 'Grok 4.1 Fast')
    .replace(/^grok-4-0709$/i, 'Grok 4')
    .replace(/^(grok-)/i, 'Grok ')
    .replace(/^(kimi-)/i, 'Kimi ')
    .replace(/^(gemini-)/i, 'Gemini ')
}

export function formatDate(dateStr) {
  return new Date(dateStr).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function winReasonLabel(reason) {
  const labels = {
    five_liberal_policies: '5 liberal policies enacted',
    six_fascist_policies: '6 fascist policies enacted',
    dictator_elected: 'Dictator elected Chancellor',
    dictator_killed: 'Dictator was executed',
    max_rounds: 'Maximum rounds reached',
  }
  return labels[reason] || reason
}

export function getModelsSummary(game) {
  const players = game.players || []
  const models = [...new Set(players.map(p => p.model).filter(Boolean))]
  if (models.length <= 1) return shortModel(models[0] || game.model || '?')
  return models.map(shortModel).join(' vs ')
}

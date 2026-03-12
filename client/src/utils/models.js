export const AVAILABLE_MODELS = [
  { value: 'claude-sonnet-4-5', label: 'Claude Sonnet' },
  { value: 'claude-haiku-4-5', label: 'Claude Haiku' },
  { value: 'claude-opus-4-5', label: 'Claude Opus' },
]

export const TERMS_PRESETS = {
  neutral: { liberal: 'Liberal', fascist: 'Fascist', hitler: 'Dictator' },
  original: { liberal: 'Liberal', fascist: 'Fascist', hitler: 'Hitler' },
  fantasy: { liberal: 'Rebel', fascist: 'Loyalist', hitler: 'Shadow Lord' },
}

export const DEFAULT_NAMES = [
  'Ada', 'Blaise', 'Claude', 'Dijkstra', 'Euler', 'Turing', 'Lovelace',
  'Babbage', 'Hopper', 'Knuth',
]

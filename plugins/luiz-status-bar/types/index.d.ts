export type Vitals = {
  ctxPercent: number
  tokens: number
  window: number
  usd: number | null
  limits: { kind: string; percent: number }[]
}

export type Turn = { startedAt: number | null; seconds: number; tools: number }

declare module 'claude-code' {
  interface PluginState {
    'luiz-status-bar': { vitals: Vitals | null; turn: Turn; tick: number }
  }
}

import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Turn, Vitals } from '../types'

const vitals = atom({ plugin: 'luiz-status-bar', key: 'vitals' } as const, null)
const turn = atom({ plugin: 'luiz-status-bar', key: 'turn' } as const, { startedAt: null, seconds: 0, tools: 0 })
const tick = atom({ plugin: 'luiz-status-bar', key: 'tick' } as const, 0)

// Cores no espírito do savvy-progress, uma por medidor: lilás, verde e argila.
const ACCENT = '#8f8cf4'
const OK = '#5fbf8f'
const CLAY = '#D97757'
const FONT = "-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',sans-serif"
const H = 22
const BAR_H = 14
const CELL = 3


const kTokens = (n: number): string => (n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`)

// Ruído determinístico, para o pontilhado não tremer entre redesenhos.
const noise = (x: number, y: number): number => {
  const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453
  return s - Math.floor(s)
}

const xml = (s: string): string =>
  s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c)

type Gauge = { label: string; pct: number; color: string; extra?: string }

// Contexto sempre; 5h e 7d quando o plano informa essas janelas.
const gauges = (v: Vitals | null): Gauge[] => {
  const list: Gauge[] = [
    { label: 'Contexto', pct: v?.ctxPercent ?? 0, color: ACCENT, extra: v ? `${kTokens(v.tokens)}/${kTokens(v.window)}` : undefined },
  ]
  for (const [kind, label, color] of [['five_hour', '5h', OK], ['seven_day', '7d', CLAY]] as const) {
    const l = v?.limits.find(x => x.kind === kind)
    if (l) list.push({ label, pct: l.percent, color })
  }
  return list
}

const summary = (v: Vitals | null, t: Turn): string[] => {
  const parts: string[] = []
  if (v?.usd != null) parts.push(`Custo $${v.usd.toFixed(2)}`)
  if (t.startedAt !== null) parts.push(`Turno ${t.seconds}s`, `Ferramentas ${t.tools}`)
  else if (t.seconds > 0) parts.push(`Último turno ${t.seconds}s`, `Ferramentas ${t.tools}`)
  return parts
}

const textW = (s: string): number => Math.round(s.length * 6.8)

// Uma barra pontilhada; a coluna do nome tem a largura de "Contexto", para as barras alinharem.
const gaugeSvg = (g: Gauge, x: number, barW: number, isWorking: boolean): { svg: string; w: number } => {
  const color = g.color
  const y0 = (H - BAR_H) / 2
  const labelX = x + 14
  const barX = labelX + textW('Contexto') + 8
  const fillW = Math.round((barW * Math.min(100, g.pct)) / 100)
  const dots: string[] = []
  const cols = Math.floor(fillW / CELL)
  const rows = Math.floor(BAR_H / CELL)
  for (let c = 0; c < cols; c++) {
    const density = 0.35 + 0.6 * Math.pow(c / Math.max(1, cols), 1.2)
    for (let r = 0; r < rows; r++) {
      if (noise(c, r) < density) {
        dots.push(`<rect x="${c * CELL + 1}" y="${r * CELL + 1}" width="2" height="2" opacity="${0.55 + noise(r, c) * 0.45}"/>`)
      }
    }
  }
  const pctText = `${Math.round(g.pct)}%${g.extra ? ` · ${g.extra}` : ''}`
  const anim = isWorking ? `<animate attributeName="opacity" values="1;0.3;1" dur="1.4s" repeatCount="indefinite"/>` : ''
  const svg = `<circle cx="${x + 4}" cy="${H / 2}" r="4" fill="${color}">${anim}</circle>
<text x="${labelX}" y="${H / 2}" dominant-baseline="central" font-family="${FONT}" font-size="12" fill="currentColor" opacity="0.75">${xml(g.label)}</text>
<rect x="${barX}" y="${y0}" width="${barW}" height="${BAR_H}" rx="3" fill="none" stroke="${color}" stroke-opacity="0.45"/>
<g transform="translate(${barX},${y0})" fill="${color}">${dots.join('')}</g>
<text x="${barX + barW + 6}" y="${H / 2}" dominant-baseline="central" font-family="${FONT}" font-size="12" fill="currentColor">${xml(pctText)}</text>`
  return { svg, w: barX + barW + 6 + textW(pctText) - x }
}

// No desktop cada linha é um SVG: um medidor na primeira coluna, um item do resumo na segunda.
// A segunda coluna começa num x fixo, medido pelo medidor mais largo possível.
const rowSvg = (g: Gauge | undefined, info: string, W: number, isWorking: boolean): string => {
  const barW = Math.max(60, Math.min(220, Math.round(W * 0.3)))
  const col2 = 14 + textW('Contexto') + 8 + barW + 6 + textW('100% · 200k/200k') + 28
  const svg = g ? gaugeSvg(g, 0, barW, isWorking).svg : ''
  const tail = info
    ? `<text x="${col2}" y="${H / 2}" dominant-baseline="central" font-family="${FONT}" font-size="12" fill="currentColor" opacity="0.75">${xml(info)}</text>`
    : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
${svg}
${tail}
</svg>`
}

// No terminal: blocos cheios na frente, sombreado no meio, vazio no fim.
const barText = (pct: number, width: number): string => {
  const filled = Math.round((width * Math.min(100, pct)) / 100)
  const head = filled > 0 ? Math.max(1, Math.round(filled * 0.6)) : 0
  return '█'.repeat(head) + '▓'.repeat(filled - head) + '░'.repeat(width - filled)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    // Enquanto um turno roda, o relógio avança uma vez por segundo.
    $.clock.every(1000, () => {
      void (async () => {
        const t = await read($, turn)
        if (t.startedAt === null) return
        const now = await $.clock.now()
        await update($, turn, x => ({ ...x, seconds: Math.round((now - (x.startedAt ?? now)) / 1000) }))
        await update($, tick, n => n + 1)
      })()
    })
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    const c = e.context
    const pct = c.percent ?? (c.tokens && c.window ? (c.tokens / c.window) * 100 : 0)
    const v: Vitals = {
      ctxPercent: pct,
      tokens: c.tokens ?? 0,
      window: c.window,
      usd: e.cost?.usd ?? null,
      limits: e.rateLimits.map(l => ({ kind: l.kind, percent: l.percentUsed })),
    }
    await update($, vitals, () => v)
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    // Um erro aqui não pode travar o prompt.
    await $.clock.now().then(now => update($, turn, () => ({ startedAt: now, seconds: 0, tools: 0 }))).catch(() => {})
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    await update($, turn, t => (t.startedAt === null ? t : { ...t, tools: t.tools + 1 })).catch(() => {})
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    // Só o turno principal fecha o relógio; os subagentes também completam turnos.
    if (!e.agentId) {
      const now = await $.clock.now()
      await update($, turn, t =>
        t.startedAt === null ? t : { ...t, startedAt: null, seconds: Math.round((now - t.startedAt) / 1000) },
      )
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const v = await read($, vitals)
    const t = await read($, turn)
    await read($, tick)
    if (e.props.hasSurvey || (v === null && t.startedAt === null && t.seconds === 0)) return next(e)

    // Desenha esta linha com as barras de outros mods embaixo, como o savvy-progress faz.
    const drawn = await Promise.resolve(next(e)).catch(() => null)
    const below = drawn && typeof drawn === 'object' && (drawn as { type?: string }).type !== 'engine' ? drawn : null

    const ui = $.ui.resolve(e)
    const { Box, Text } = ui
    const list = gauges(v)
    const info = summary(v, t)
    const isWorking = t.startedAt !== null
    // Linha i: o medidor i na primeira coluna e o item i do resumo na segunda.
    const rows = Array.from({ length: Math.max(list.length, info.length) }, (_, i) => i)

    if (e.surface !== 'terminal' && 'Svg' in ui) {
      const { Svg } = ui
      const width = Math.max(240, Math.min(1600, (e.props.bodyColumns || 100) * 8 - 16))
      return (
        <Box flexDirection="column">
          {rows.map(i => (
            <Svg
              key={`r${i}`}
              source={rowSvg(list[i], info[i] ?? '', width, isWorking)}
              alt={[list[i] && `${list[i].label} ${Math.round(list[i].pct)}%`, info[i]].filter(Boolean).join(', ')}
              width={width}
              height={H}
            />
          ))}
          {below}
        </Box>
      )
    }

    const width = Math.max(6, Math.min(24, e.props.bodyColumns - 50))
    return (
      <Box flexDirection="column">
        <Box flexDirection="row" gap={4}>
          <Box flexDirection="column" flexShrink={0}>
            {list.map(g => (
              <Box key={g.label} flexDirection="row" gap={1}>
                <Text color={g.color}>●</Text>
                <Box width={8} flexShrink={0}>
                  <Text dimColor>{g.label}</Text>
                </Box>
                <Text color={g.color}>{barText(g.pct, width)}</Text>
                <Text bold>{Math.round(g.pct)}%</Text>
                {g.extra && <Text dimColor>{g.extra}</Text>}
              </Box>
            ))}
          </Box>
          <Box flexDirection="column">
            {info.map(s => (
              <Text key={s.split(' ')[0]} dimColor>
                {s}
              </Text>
            ))}
          </Box>
        </Box>
        {below}
      </Box>
    )
  })
}

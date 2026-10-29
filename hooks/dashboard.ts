// The dashboard drawn as one SVG document: a single panel, three rows on a
// shared grid, solid progress bars and pixel-art Clawd crabs animated by CSS
// keyframes inside the SVG itself, so no timer redraws anything.

export const TOKENS = {
  background: '#191C20',
  panel: '#202328',
  track: '#303640',
  border: '#343B45',
  text: '#E1E5EB',
  secondary: '#929BA8',
  task: '#67A7F7',
  usage: '#60CC7D',
  accent: '#EF805C',
} as const

// One color per agent slot after the main session's, chosen to sit with the tokens.
export const AGENT_COLORS = ['#67A7F7', '#60CC7D', '#C792EA', '#E5C07B', '#56B6C2', '#F28FAD', '#A3BE8C', '#D19A66']

export type CrabState = 'working' | 'idle' | 'done-new' | 'done' | 'muted'

export type Slot = { name: string; color: string; state: CrabState }

export type DashboardData = {
  // Task progress 0..1, or undefined while it cannot be known yet.
  task?: number
  // The line under the task bar, e.g. "2/4 tasks · 1/3 agents".
  taskDetail: string
  // Percentages as the engine reports them; undefined when not reported.
  context?: number
  fiveHour?: number
  sevenDay?: number
  taskCost: string
  sessionCost: string
  slots: Slot[]
}

export type Drawing = { svg: string; width: number; height: number; alt: string }

const FONT = `ui-monospace, 'SF Mono', 'Cascadia Mono', 'JetBrains Mono', Consolas, Menlo, monospace`
const WIDE_FROM = 600
const BAR_H = 10
const PCT_W = 36
const COST_W = 156
const FILL_MS = 300

// Clawd's resting pose as the terminal draws him: three rows of quadrant
// blocks, nine cells wide. Each cell is 2x2 pixels, so he is 18x6 pixels;
// a terminal cell is twice as tall as wide, so each pixel is drawn 1:2.
const CLAWD = [' ▐▛███▜▌ ', '▝▜█████▛▘', '  ▘▘ ▝▝  ']
const QUADRANTS: Record<string, [number, number, number, number]> = {
  ' ': [0, 0, 0, 0],
  '█': [1, 1, 1, 1],
  '▐': [0, 1, 0, 1],
  '▌': [1, 0, 1, 0],
  '▛': [1, 1, 1, 0],
  '▜': [1, 1, 0, 1],
  '▝': [0, 1, 0, 0],
  '▘': [1, 0, 0, 0],
}
const SPRITE_W = 18
const SPRITE_H = 5

type Part = 'body' | 'armL' | 'armR' | 'legA' | 'legB'

// Which part of Clawd a cell belongs to, so each part can move on its own.
function partOf(column: number, row: number): Part {
  if (row === 1 && column === 0) return 'armL'
  if (row === 1 && column === 8) return 'armR'
  if (row === 2) return column === 2 || column === 5 ? 'legA' : 'legB'
  return 'body'
}

// Clawd as merged rectangles per part, in pixel units.
function clawdRects(): Record<Part, string> {
  const parts: Record<Part, string[]> = { body: [], armL: [], armR: [], legA: [], legB: [] }
  const grid: (Part | null)[][] = Array.from({ length: 6 }, () => Array<Part | null>(SPRITE_W).fill(null))
  CLAWD.forEach((line, row) => {
    ;[...line].forEach((ch, column) => {
      const [tl, tr, bl, br] = QUADRANTS[ch] ?? [0, 0, 0, 0]
      const part = partOf(column, row)
      const x = column * 2
      const y = row * 2
      const set = (dx: number, dy: number, on: number) => {
        const line = grid[y + dy]
        if (on && line) line[x + dx] = part
      }
      set(0, 0, tl)
      set(1, 0, tr)
      set(0, 1, bl)
      set(1, 1, br)
    })
  })
  grid.forEach((line, y) => {
    let x = 0
    while (x < line.length) {
      const part = line[x]
      if (!part) {
        x++
        continue
      }
      let end = x
      while (line[end + 1] === part) end++
      parts[part].push(`<rect x="${x}" y="${y}" width="${end - x + 1}" height="1"/>`)
      x = end + 1
    }
  })

  return {
    body: parts.body.join(''),
    armL: parts.armL.join(''),
    armR: parts.armR.join(''),
    legA: parts.legA.join(''),
    legB: parts.legB.join(''),
  }
}

const RECTS = clawdRects()

const STYLE = `
.lbl{font:500 10px ${FONT};letter-spacing:.08em;fill:${TOKENS.secondary};text-transform:uppercase}
.pct{font:500 12px ${FONT};fill:${TOKENS.text};font-variant-numeric:tabular-nums}
.sub{font:400 11px ${FONT};fill:${TOKENS.secondary};font-variant-numeric:tabular-nums}
.cost{font:500 16px ${FONT};fill:${TOKENS.accent};font-variant-numeric:tabular-nums}
.na{fill:${TOKENS.secondary}}
.crab .armL,.crab .armR,.crab .legA,.crab .legB{transform-box:fill-box}
.working .legA{animation:step .44s steps(1) infinite}
.working .legB{animation:step .44s steps(1) infinite .22s}
.working .armL{animation:claw .88s steps(1) infinite}
.working .armR{animation:claw .88s steps(1) infinite .44s}
.idle .armL,.idle .armR{animation:nod 3.6s steps(1) infinite}
.idle .armR{animation-delay:.3s}
.done-new .armL,.done-new .armR{animation:raise 1.4s steps(1) 1}
.muted{opacity:.32}
@keyframes step{0%{transform:translateY(0)}50%{transform:translateY(-1px)}}
@keyframes claw{0%{transform:translateY(0)}50%{transform:translateY(-1px)}}
@keyframes nod{0%,86%{transform:translateY(0)}88%,94%{transform:translateY(-1px)}}
@keyframes raise{0%{transform:translateY(0)}8%,78%{transform:translateY(-2px)}100%{transform:translateY(0)}}
@media (prefers-reduced-motion: reduce){*{animation:none!important}}
`

function escape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

// One progress bar: label above, a solid rounded track and fill, the
// percentage right-aligned outside the track. `last` keeps the ratio drawn
// before, so only a real change animates the fill.
function bar(
  key: string,
  label: string,
  ratio: number | undefined,
  shown: string,
  color: string,
  x: number,
  y: number,
  width: number,
  last: Map<string, number>,
): { markup: string; keyframes: string } {
  const track = Math.max(40, width - PCT_W - 8)
  const value = ratio === undefined ? undefined : clamp01(ratio)
  const to = value === undefined ? 0 : Math.round(value * track)
  const before = last.get(key)
  const from = before === undefined || value === undefined ? to : Math.round(clamp01(before) * track)
  if (value === undefined) last.delete(key)
  else last.set(key, value)

  const isMoving = from !== to
  const keyframes = isMoving ? `@keyframes f-${key}{from{width:${from}px}to{width:${to}px}}` : ''
  const fill =
    to > 0
      ? `<rect x="${x}" y="${y + 18}" width="${to}" height="${BAR_H}" rx="3" fill="${color}"${
          isMoving ? ` style="animation:f-${key} ${FILL_MS}ms ease-out both"` : ''
        }/>`
      : ''
  const now = value === undefined ? '' : ` aria-valuenow="${Math.round(value * 100)}"`

  return {
    keyframes,
    markup:
      `<g role="progressbar" aria-label="${escape(label)}" aria-valuemin="0" aria-valuemax="100"${now}>` +
      `<text class="lbl" x="${x}" y="${y + 10}">${escape(label.toUpperCase())}</text>` +
      `<rect x="${x}" y="${y + 18}" width="${track}" height="${BAR_H}" rx="3" fill="${TOKENS.track}"/>` +
      fill +
      `<text class="pct${value === undefined ? ' na' : ''}" x="${x + width}" y="${y + 27}" text-anchor="end">${escape(shown)}</text>` +
      `</g>`,
  }
}

function percentText(percent: number | undefined): string {
  return percent === undefined ? '—' : `${Math.round(percent)}%`
}

function crab(slot: Slot, x: number, y: number, pixel: number): string {
  return (
    `<g class="crab ${slot.state}" transform="translate(${x} ${y}) scale(${pixel} ${pixel * 2})" fill="${slot.color}" shape-rendering="crispEdges">` +
    `<title>${escape(slot.name)}</title>` +
    `<g>${RECTS.body}</g><g class="armL">${RECTS.armL}</g><g class="armR">${RECTS.armR}</g>` +
    `<g class="legA">${RECTS.legA}</g><g class="legB">${RECTS.legB}</g>` +
    `</g>`
  )
}

function line(x1: number, y1: number, x2: number, y2: number): string {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${TOKENS.border}" stroke-width="1"/>`
}

export function dashboardSvg(d: DashboardData, width: number, last: Map<string, number>): Drawing {
  const W = Math.round(Math.max(300, width))
  const isWide = W >= WIDE_FROM
  const pad = isWide ? 16 : 12
  const gap = isWide ? 24 : 14
  const inner = W - pad * 2
  const half = (inner - gap) / 2
  const sectionGap = isWide ? 14 : 10
  const parts: string[] = []
  const keyframes: string[] = []
  const add = (drawn: { markup: string; keyframes: string }) => {
    parts.push(drawn.markup)
    if (drawn.keyframes) keyframes.push(drawn.keyframes)
  }

  let y = pad

  // Row 1: TASK (with its detail line) and CONTEXT.
  const taskShown = d.task === undefined ? '—' : `${Math.round(clamp01(d.task) * 100)}%`
  const contextRatio = d.context === undefined ? undefined : d.context / 100
  if (isWide) {
    add(bar('task', 'Task', d.task, taskShown, TOKENS.task, pad, y, half, last))
    parts.push(`<text class="sub" x="${pad}" y="${y + 44}">${escape(d.taskDetail)}</text>`)
    add(bar('ctx', 'Context', contextRatio, percentText(d.context), TOKENS.usage, pad + half + gap, y, half, last))
    y += 48
  } else {
    add(bar('task', 'Task', d.task, taskShown, TOKENS.task, pad, y, inner, last))
    parts.push(`<text class="sub" x="${pad}" y="${y + 44}">${escape(d.taskDetail)}</text>`)
    y += 48 + sectionGap
    add(bar('ctx', 'Context', contextRatio, percentText(d.context), TOKENS.usage, pad, y, inner, last))
    y += 32
  }

  y += sectionGap
  parts.push(line(pad, y + 0.5, W - pad, y + 0.5))
  y += sectionGap + 1

  // Row 2: 5H USAGE and 7D USAGE.
  const five = d.fiveHour === undefined ? undefined : d.fiveHour / 100
  const seven = d.sevenDay === undefined ? undefined : d.sevenDay / 100
  if (isWide) {
    add(bar('5h', '5h usage', five, percentText(d.fiveHour), TOKENS.usage, pad, y, half, last))
    add(bar('7d', '7d usage', seven, percentText(d.sevenDay), TOKENS.usage, pad + half + gap, y, half, last))
    y += 32
  } else {
    add(bar('5h', '5h usage', five, percentText(d.fiveHour), TOKENS.usage, pad, y, inner, last))
    y += 32 + sectionGap
    add(bar('7d', '7d usage', seven, percentText(d.sevenDay), TOKENS.usage, pad, y, inner, last))
    y += 32
  }

  y += sectionGap
  parts.push(line(pad, y + 0.5, W - pad, y + 0.5))
  y += sectionGap + 1

  // Row 3: AGENTS, then EST. TASK COST and SESSION COST behind thin dividers.
  const pixel = isWide ? 3 : 2.5
  const spriteW = SPRITE_W * pixel
  const spriteH = SPRITE_H * pixel * 2
  const slotGap = pixel * 2 + 4
  const agentsW = isWide ? inner - COST_W * 2 : inner
  const perRow = Math.max(1, Math.floor((agentsW + slotGap) / (spriteW + slotGap)))
  const spriteRows = Math.max(1, Math.ceil(d.slots.length / perRow))
  const spritesH = spriteRows * spriteH + (spriteRows - 1) * 8
  const agentsH = 18 + spritesH

  parts.push(`<text class="lbl" x="${pad}" y="${y + 10}">AGENTS</text>`)
  d.slots.forEach((slot, i) => {
    const column = i % perRow
    const row = Math.floor(i / perRow)
    parts.push(crab(slot, pad + column * (spriteW + slotGap), y + 18 + row * (spriteH + 8), pixel))
  })

  const costBlock = (label: string, value: string, x: number, top: number) =>
    `<text class="lbl" x="${x}" y="${top + 10}">${label}</text>` +
    `<text class="cost" x="${x}" y="${top + 34}">${escape(value)}</text>`

  if (isWide) {
    const rowH = Math.max(agentsH, 40)
    const first = pad + agentsW
    const second = first + COST_W
    parts.push(line(first + 0.5, y, first + 0.5, y + rowH))
    parts.push(costBlock('EST. TASK COST', d.taskCost, first + 16, y))
    parts.push(line(second + 0.5, y, second + 0.5, y + rowH))
    parts.push(costBlock('SESSION COST', d.sessionCost, second + 16, y))
    y += rowH
  } else {
    y += agentsH + sectionGap
    parts.push(line(pad, y + 0.5, W - pad, y + 0.5))
    y += sectionGap + 1
    const middle = pad + inner / 2
    parts.push(costBlock('EST. TASK COST', d.taskCost, pad, y))
    parts.push(line(middle + 0.5, y, middle + 0.5, y + 40))
    parts.push(costBlock('SESSION COST', d.sessionCost, middle + 12, y))
    y += 40
  }

  const H = Math.round(y + pad)
  const working = d.slots.filter(s => s.state === 'working').length
  const alt =
    `Task ${taskShown} (${d.taskDetail}); context ${percentText(d.context)}; ` +
    `5h usage ${percentText(d.fiveHour)}; 7d usage ${percentText(d.sevenDay)}; ` +
    `${d.slots.length} crabs, ${working} working; task cost ${d.taskCost}; session cost ${d.sessionCost}`

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escape(alt)}">` +
    `<style>${STYLE}${keyframes.join('')}</style>` +
    `<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="11" fill="${TOKENS.panel}" stroke="${TOKENS.border}"/>` +
    parts.join('') +
    `</svg>`

  return { svg, width: W, height: H, alt }
}

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Crab, Limit, Meter, Step, StepStatus } from '../types'
import { AGENT_COLORS, TOKENS, dashboardSvg } from './dashboard'
import type { CrabState, DashboardData, Slot } from './dashboard'

const KEYWORD = 'gp-agent-usage-info'
const OLD_PANE = 'gp-agent-usage-info'
// Cells to CSS pixels on the remote surfaces, which report width in cells.
const CELL_PX = 7.6
// How long a just-finished agent counts as new, so its claw-raise plays once.
const RAISE_MS = 1600

const isOn = atom({ plugin: 'gp-agent-usage-info', key: 'isOn' } as const, false)
const isBusy = atom({ plugin: 'gp-agent-usage-info', key: 'isBusy' } as const, false)
const steps = atom({ plugin: 'gp-agent-usage-info', key: 'steps' } as const, { source: '', list: [] }, {
  shape: 'steps-1',
})
const agents = atom({ plugin: 'gp-agent-usage-info', key: 'agents' } as const, [], { shape: 'agents-2' })
const baseline = atom({ plugin: 'gp-agent-usage-info', key: 'baseline' } as const, [], { shape: 'baseline-1' })
const meter = atom(
  { plugin: 'gp-agent-usage-info', key: 'meter' } as const,
  { usd: 0, taskStartUsd: 0, limits: [] },
  { shape: 'meter-1' },
)

const FINISHED = new Set(['completed', 'failed', 'killed'])

// The ratio each bar was last drawn at, so only a real change animates it.
const lastDrawn = new Map<string, number>()

type PlanArgs = {
  items?: { content: string; status: StepStatus }[]
  advance?: boolean
  done?: number[]
  start?: number
}

function money(usd: number): string {
  return usd < 1 ? `$${usd.toFixed(3)}` : `$${usd.toFixed(2)}`
}

function hasKeyword(text: string): boolean {
  return text.toLowerCase().includes(KEYWORD)
}

function stripKeyword(text: string): string {
  return text.split(new RegExp(KEYWORD, 'i')).join(' ').replace(/\s+/g, ' ').trim()
}

// Applies the desktop app's update_plan call to the step list it keeps.
function applyPlan(list: Step[], args: PlanArgs): Step[] {
  if (args.items) {
    return args.items.map((item, i) => ({ id: String(i), status: item.status }))
  }
  const next = list.map(step => ({ ...step }))
  const set = (step: Step | undefined, status: StepStatus) => {
    if (step) step.status = status
  }
  if (args.advance) {
    set(next.find(step => step.status === 'in_progress'), 'completed')
    set(next.find(step => step.status === 'pending'), 'in_progress')
  }
  for (const n of args.done ?? []) set(next[n - 1], 'completed')
  if (args.start && next[args.start - 1]) {
    for (const step of next) if (step.status === 'in_progress') step.status = 'pending'
    set(next[args.start - 1], 'in_progress')
  }
  return next
}

function crabState(status: string, doneAt: number | undefined, now: number): CrabState {
  if (status === 'running') return 'working'
  if (status === 'completed') return doneAt !== undefined && now - doneAt < RAISE_MS ? 'done-new' : 'done'
  if (status === 'failed' || status === 'killed') return 'muted'
  return 'idle'
}

// Everything the dashboard shows, read from the mod's state.
async function dashboardData($: EngineInterface): Promise<DashboardData> {
  const busy = await read($, isBusy)
  const { list } = await read($, steps)
  const before = new Set(await read($, baseline))
  const taskAgents = (await read($, agents)).filter(a => !before.has(a.id))
  const m: Meter = await read($, meter)
  const now = await $.clock.now()

  const stepsDone = list.filter(step => step.status === 'completed').length
  const stepsHalf = list.some(step => step.status === 'in_progress') ? 0.5 : 0
  const agentsDone = taskAgents.filter(a => FINISHED.has(a.status)).length

  // Task progress: the task list when there is one, else the task's agents,
  // else unknown while working and complete once idle.
  const task =
    list.length > 0
      ? Math.min(1, (stepsDone + stepsHalf) / list.length)
      : taskAgents.length > 0
        ? agentsDone / taskAgents.length
        : busy
          ? undefined
          : 1

  const detail = [
    list.length > 0 ? `${stepsDone}/${list.length} tasks` : '',
    `${agentsDone}/${taskAgents.length} agents`,
  ]
    .filter(Boolean)
    .join(' · ')

  const slots: Slot[] = [
    { name: 'Main session', color: TOKENS.accent, state: busy ? 'working' : 'idle' },
    ...taskAgents.map((a, i) => ({
      name: `${a.type} · ${a.status}`,
      color: AGENT_COLORS[i % AGENT_COLORS.length] ?? TOKENS.accent,
      state: crabState(a.status, a.doneAt, now),
    })),
  ]
  const limit = (kind: string) => m.limits.find(l => l.kind === kind)?.percent

  return {
    task,
    taskDetail: detail,
    context: m.context,
    fiveHour: limit('five_hour'),
    sevenDay: limit('seven_day'),
    taskCost: money(Math.max(0, m.usd - m.taskStartUsd)),
    sessionCost: money(m.usd),
    slots,
  }
}

async function refreshAgents($: EngineInterface): Promise<void> {
  try {
    const list = await $.agent.list()
    const now = await $.clock.now()
    await update($, agents, known => {
      const doneAt = new Map(known.map(a => [a.id, a.doneAt]))
      const crabs: Crab[] = list.map(a => ({
        id: a.id,
        type: a.type,
        status: a.status,
        doneAt: FINISHED.has(a.status) ? (doneAt.get(a.id) ?? now) : undefined,
      }))
      return crabs.slice(-40)
    })
  } catch {
    // Agent listing is best effort; the dashboard keeps the last known crabs.
  }
}

// A new task: its cost and its agents count from here.
async function beginTask($: EngineInterface, isWorking: boolean): Promise<void> {
  await update($, meter, m => ({ ...m, taskStartUsd: m.usd }))
  await update($, isBusy, () => isWorking)
  const known = await read($, agents)
  await update($, baseline, () => known.map(a => a.id))
}

async function turnOn($: EngineInterface): Promise<void> {
  await update($, isOn, () => true)
  try {
    const usage = await $.session.usage()
    await update($, meter, m => ({
      ...m,
      usd: usage.cost?.usd ?? m.usd,
      limits: usage.rateLimits.map(r => ({ kind: r.kind, percent: r.percentUsed })),
      context: usage.context.percent,
    }))
  } catch {
    // Figures arrive with the next session.measure instead.
  }
  $.ui.toast('🦀 Agent usage on')
}

// Clears what earlier versions left: the pinned status line and the side pane.
async function clearOldSurfaces($: EngineInterface): Promise<void> {
  $.ui.status(undefined)
  try {
    await $.ui.close({ id: OLD_PANE })
  } catch {
    // No pane was open.
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: KEYWORD,
      description: 'Show task progress, agent crabs, cost and usage limits above the prompt',
    })
    await clearOldSurfaces($)

    return next(e)
  })

  on('command.run', { command: KEYWORD }, async $ => {
    await turnOn($)

    return { text: '🦀 Agent usage on.' }
  })

  on('prompt.submit', async ($, e, next) => {
    if (e.command || !hasKeyword(e.text)) {
      if (!e.command && (await read($, isOn))) await beginTask($, true)
      return next(e)
    }

    const text = stripKeyword(e.text)
    try {
      await beginTask($, text !== '')
      await turnOn($)
    } catch (error) {
      $.ui.toast(`🦀 ${KEYWORD}: ${String(error)}`)
    }

    if (text === '') return { drop: '🦀 Agent usage on.' }

    return next({ ...e, text })
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId !== undefined) await refreshAgents($)

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) await update($, isBusy, () => false)
    await refreshAgents($)

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    const limits: Limit[] = e.rateLimits.map(r => ({ kind: r.kind, percent: r.percentUsed }))
    await update($, meter, m => ({
      ...m,
      usd: e.cost?.usd ?? m.usd,
      limits,
      context: e.context.percent,
    }))

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if ('deny' in ran && ran.deny !== undefined) return ran

    if (e.tool === 'TodoWrite') {
      const list: Step[] = e.todos.map((todo, i) => ({ id: String(i), status: todo.status }))
      await update($, steps, () => ({ source: 'todo', list }))
    } else if (e.tool === 'TaskCreate') {
      const result = ran.result as { task?: { id: string } } | undefined
      const id = result?.task?.id ?? e.tool_use_id ?? String(Date.now())
      await update($, steps, s => ({
        source: 'task',
        list: [...(s.source === 'task' ? s.list : []), { id, status: 'pending' as const }],
      }))
    } else if (e.tool === 'TaskUpdate') {
      const status = e.status
      if (status) {
        await update($, steps, s =>
          s.source !== 'task'
            ? s
            : {
                ...s,
                list:
                  status === 'deleted'
                    ? s.list.filter(step => step.id !== e.taskId)
                    : s.list.map(step => (step.id === e.taskId ? { ...step, status } : step)),
              },
        )
      }
    } else if (e.tool.endsWith('update_plan')) {
      const args = e as unknown as PlanArgs
      await update($, steps, s => ({
        source: 'plan',
        list: applyPlan(s.source === 'plan' ? s.list : [], args),
      }))
    } else if (e.tool === 'Agent') {
      await refreshAgents($)
    }

    return ran
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || !(await read($, isOn))) return next(e)

    const ui = $.ui.resolve(e)
    const { Box, Text } = ui
    const d = await dashboardData($)
    const columns = e.viewport?.columns ?? 100

    // The desktop, editor and phone draw the dashboard as one SVG panel.
    if ('Svg' in ui) {
      const { Svg } = ui
      const drawing = dashboardSvg(d, columns * CELL_PX, lastDrawn)
      return <Svg source={drawing.svg} alt={drawing.alt} width={drawing.width} height={drawing.height} />
    }

    // The terminal cannot draw SVG: the same figures as three quiet text rows.
    const pct = (value: number | undefined) => (value === undefined ? '  —' : `${Math.round(value)}%`.padStart(4))
    const track = (ratio: number | undefined, width: number) => {
      const n = ratio === undefined ? 0 : Math.round(Math.min(1, Math.max(0, ratio)) * width)
      return { fill: '█'.repeat(n), rest: '░'.repeat(width - n) }
    }
    const meterText = (label: string, ratio: number | undefined, shown: string, color: string) => {
      const t = track(ratio, 16)
      return (
        <Text>
          <Text dimColor>{label.padEnd(9)}</Text>
          <Text color={color}>{t.fill}</Text>
          <Text color={TOKENS.track}>{t.rest}</Text>
          <Text> {shown}</Text>
        </Text>
      )
    }

    return (
      <Box flexDirection="column">
        <Box flexDirection="row" gap={3}>
          {meterText('TASK', d.task, d.task === undefined ? '  —' : pct(d.task * 100), TOKENS.task)}
          <Text dimColor>{d.taskDetail}</Text>
          {meterText('CONTEXT', d.context === undefined ? undefined : d.context / 100, pct(d.context), TOKENS.usage)}
        </Box>
        <Box flexDirection="row" gap={3}>
          {meterText('5H USAGE', d.fiveHour === undefined ? undefined : d.fiveHour / 100, pct(d.fiveHour), TOKENS.usage)}
          {meterText('7D USAGE', d.sevenDay === undefined ? undefined : d.sevenDay / 100, pct(d.sevenDay), TOKENS.usage)}
        </Box>
        <Box flexDirection="row" gap={3}>
          <Text>
            <Text dimColor>{'AGENTS'.padEnd(9)}</Text>
            {d.slots.map((slot, i) => (
              <Text key={`crab-${i}`} color={slot.color} dimColor={slot.state === 'muted'}>
                {'▐▛███▜▌ '}
              </Text>
            ))}
          </Text>
          <Text>
            <Text dimColor>EST. TASK COST </Text>
            <Text color={TOKENS.accent}>{d.taskCost}</Text>
          </Text>
          <Text>
            <Text dimColor>SESSION COST </Text>
            <Text color={TOKENS.accent}>{d.sessionCost}</Text>
          </Text>
        </Box>
      </Box>
    )
  })
}

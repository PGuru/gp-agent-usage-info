export type StepStatus = 'pending' | 'in_progress' | 'completed'
export type Step = { id: string; status: StepStatus }
export type Steps = { source: string; list: Step[] }
// doneAt: when the agent was first seen completed, for its one claw-raise.
export type Crab = { id: string; type: string; status: string; doneAt?: number }
export type Limit = { kind: string; percent: number }
export type Meter = {
  usd: number
  taskStartUsd: number
  limits: Limit[]
  context?: number
}

declare module 'claude-code' {
  interface PluginState {
    'gp-agent-usage-info': {
      isOn: boolean
      isBusy: boolean
      steps: Shaped<Steps>
      agents: Shaped<Crab[]>
      // The agent ids that existed when the current task began.
      baseline: Shaped<string[]>
      meter: Shaped<Meter>
    }
  }
}

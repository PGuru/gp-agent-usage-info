# gp-agent-usage-info

A Claude Code mod that puts a compact dashboard above the prompt, so you can see at a glance how a task is going, which agents are working, how much of your usage you have left, and what the work is costing.

```
TASK ████████░░░░░░  50%            CONTEXT ██████░░░░░░░░  37%
2/4 tasks · 1/3 agents
───────────────────────────────────────────────────────────────
5H USAGE ███░░░░░░░░░░░  23%        7D USAGE █████░░░░░░░░░  41%
───────────────────────────────────────────────────────────────
AGENTS                            │ EST. TASK COST │ SESSION COST
▐▛███▜▌ ▐▛███▜▌ ▐▛███▜▌ ▐▛███▜▌   │ $0.042         │ $1.30
```

In the desktop app the dashboard is drawn as one dark panel with solid progress bars and pixel-art Clawd crabs; in a terminal it is drawn as three rows of text.

## What it shows

| Row | Left | Right |
| --- | --- | --- |
| 1 | **TASK**: progress of the current task (its task list when there is one, else its agents), with `done/total` tasks and agents underneath | **CONTEXT**: how full the context window is |
| 2 | **5H USAGE**: the 5-hour rate-limit window | **7D USAGE**: the 7-day rate-limit window |
| 3 | **AGENTS**: one Clawd crab for the main session and one per agent of the current task | **EST. TASK COST** and **SESSION COST** |

Each Clawd shows its agent's real state:

- **Working**: scuttles its legs and claws.
- **Idle or waiting**: an occasional small claw nod.
- **Just finished**: raises both claws once, then rests.
- **Failed or stopped**: muted.

Every agent keeps its slot until the next task starts, so the crabs never jump around. Animations stop when your system asks for reduced motion.

The usage bars appear on a Claude subscription; on API billing the engine reports no rate-limit windows, so they show `—`. Costs are estimates from token usage, as `/cost` reports them.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install gp-agent-usage-info --marketplace PGuru/gp-agent-usage-info
```

Answer `y` to add the marketplace, then press Enter to install for your user. The mod is active at once.

From a shell:

```bash
claude plugin install gp-agent-usage-info --marketplace PGuru/gp-agent-usage-info
```

In the Claude desktop app, where `/plugin` does not run: click **+** next to the prompt box, then **Plugins**, **Add marketplace** with `PGuru/gp-agent-usage-info`, then **Add plugin**. A mod installed from a terminal for your user also loads in the desktop app's sessions.

## Use

Turn the dashboard on by putting the keyword anywhere in a message. The keyword is removed before the message reaches Claude:

```
gp-agent-usage-info run three Explore agents in parallel to list the files in this folder
```

Or run the command on its own:

```
/gp-agent-usage-info
```

The dashboard stays on for the rest of the session.

## How it works

- `hooks/register.tsx` listens to the session: prompts, tool calls (task lists, `TodoWrite`, `TaskCreate`/`TaskUpdate`, the desktop app's plan updates, `Agent` calls), agent turns and the engine's usage measurements. It keeps those figures in session state and draws the band above the prompt.
- `hooks/dashboard.ts` turns the figures into one SVG panel. The crabs are animated by CSS keyframes inside the SVG, so nothing redraws on a timer; a bar animates only when its value changes.
- `types/index.d.ts` declares the state the mod keeps.

## License

MIT. See [LICENSE](LICENSE).

# AgentOS Visual System

Source authority: #13022 and parent epic #13012. This file is the app-local contract for the Agent Harness visual foundation while `apps/agentos` is the active shell.

## Theme Pair

- The harness loads `neo-theme-neo-dark` and `neo-theme-neo-light` from day one.
- The app config lists `neo-theme-neo-dark` first, matching the harness baseline.
- When no saved preference exists, the controller applies dark mode if the browser prefers it.
- Theme preference is stored under `agentosTheme` via the main-thread `LocalStorage` addon.
- Child apps load the same theme pair so detached windows stay inside the same visual system.

## Surface Tokens

Use the shared AgentOS CSS variables before adding component-local colors:

| Surface | Background token | Accent token |
|---|---|---|
| Settings | `--agent-surface-settings` | `--agent-accent-settings` |
| Chat | `--agent-surface-chat` | `--agent-accent-chat` |
| Transcript | `--agent-surface-transcript` | `--agent-accent-transcript` |
| Grid pane | `--agent-surface-grid` | `--agent-accent-grid` |

## State Tokens

Use these state tokens consistently across settings, chat, transcript, and grid panes:

| State | Token |
|---|---|
| Focused / active | `--agent-state-focus` |
| Muted / disabled | `--agent-state-muted` |
| Waiting / pending | `--agent-state-waiting` |
| Live / ready | `--agent-state-live` |

## Interaction Contract

- Use icon buttons with tooltips for compact toolbar actions.
- Keep repeated pane cards at `8px` radius or less.
- Keep fixed controls dimensioned so hover, icon, and theme changes do not resize toolbars.
- Add new pane colors by extending the theme variable contract first, then consuming the variable in component SCSS.

---
id: 8248
title: '[Neural Link] Implement toJSON in grid.column.Progress'
state: CLOSED
labels:
  - enhancement
  - ai
  - architecture
assignees: []
createdAt: '2026-01-01T02:56:45Z'
updatedAt: '2026-01-01T03:05:15Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8248'
author: tobiu
commentsCount: 1
parentIssue: 8200
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-01T03:05:15Z'
---
# [Neural Link] Implement toJSON in grid.column.Progress

Implement `toJSON()` in `src/grid/column/Progress.mjs` to support Neural Link serialization.

**Properties to Serialize:**
- (Inherits `component` serialization from `grid.column.Component`)

**Note:** `Progress` extends `Component` (column), so it automatically gets `component`, `recordProperty`, etc.
However, `defaults` might be relevant here? `defaults` has `module: ProgressComponent`.
The `Component` column serialization we implemented doesn't specifically target `defaults`.
Let's check `src/grid/column/Component.mjs` again. `defaults` is protected but used in `cellRenderer`.
Maybe we should include `defaults` in `Component.mjs` serialization? Or just here?
Actually, `defaults` is protected, so maybe we skip it for now unless critical.
The main thing is `type: 'progress'`.
If `Progress.mjs` doesn't add any new *public* configs that need serialization, does it need `toJSON`?
It extends `ComponentColumn`.
`defaults` is `{module: ProgressComponent}`.
If we don't implement `toJSON`, it uses `ComponentColumn.toJSON`.
Does it have extra state? No.
But `AnimatedCurrency` extends `AnimatedChange` and adds props.

Wait, `Progress` extends `Component`. `Component` serializes `component`. `Progress` doesn't have `component` config set (it uses `defaults`).
So `toJSON` in `Component` might return empty `component`?
`Component.mjs`:
```javascript
        if (Neo.isObject(me.component)) {
            out.component = me.serializeConfig(me.component)
        }
```
In `Progress`, `component` is null. `defaults` is set.
So `toJSON` for `Progress` might need to serialize `defaults`?
Or maybe `Progress` is just `type: 'progress'` and that's enough for the client to know what it is?
The client (Neural Link) inspects the state.
If the user customizes `defaults`?
`defaults` is protected.
Let's assume for now `Progress` doesn't need explicit `toJSON` unless we want to serialize `defaults`.
But for consistency, maybe we should just create the ticket to verify/implement if needed.
Actually, I'll hold off on `Progress` ticket if it seems covered or trivial.
Let's look at `AnimatedCurrency` again.
It adds `compareField`, `currency`, `locale`.
`Currency` adds `currency`, `locale`.
`AnimatedChange` adds `animationCls`.

I will create tickets for `Currency`, `AnimatedChange`, and `AnimatedCurrency`.
I'll also create one for `Progress` just to be safe and consistent, explicitly mentioning "Check if defaults need serialization".

On second thought, `Progress` is a specific *type* of column. The `ntype` / `type` will be serialized by `Base`. `Component` column serializes `component` config. `Progress` relies on `defaults`.
If I leave it out, it uses `Component.toJSON`.
I will creates tickets for `Currency`, `AnimatedChange`, `AnimatedCurrency`. I'll create `Progress` too.

## Comments

### @tobiu - 2026-01-01 03:04

**Input from Gemini 3 Pro Preview:**

> ✦ Implemented `toJSON` method to serialize `defaults` (using `serializeConfig`), exposing the underlying component module configuration.

## Activity Log

- 2026-01-01 @tobiu added the `enhancement` label
- 2026-01-01 @tobiu added the `ai` label
- 2026-01-01 @tobiu added the `architecture` label
- 2026-01-01 @tobiu added parent issue #8200
- 2026-01-01 @tobiu referenced in commit `ed46512` - "feat(grid.column.Progress): Implement toJSON serialization #8248"
- 2026-01-01 @tobiu closed this issue


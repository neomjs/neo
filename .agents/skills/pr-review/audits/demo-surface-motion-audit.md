# Demo-Surface Motion Audit

**Trigger:** the PR diff touches a demo or product surface's rendered motion — animations,
transitions, choreography classes, motion-token consumption, or any UI state change on
`apps/**` showcase surfaces, `examples/dashboard/**`, or the dashboard affordance layers.

**Authority:** the motion-standards ticket's ratified rule set (design-authority ratification,
2026-07-12, including the two accepted reviewer corrections). The token vocabulary itself is
merged substrate (`resources/scss/_motion.scss`, all themes).

## The gate (Required-Action tier)

1. **A hard cut or layout-thrashing animation on a demo/product surface = Required Action.**
   - *Hard cut:* every state transition on such a surface is a motion DECISION — animated by
     default; instant is legitimate ONLY for initial construction, restore/rehydration,
     reduced-motion, coarse re-projection, and bulk refresh, and an instant path must be
     intentional and NAMED (code comment or tour caption). A hard cut that is merely
     unpolished is a defect; a hard cut that is a decision is documented.
   - *Layout thrash:* transform and opacity are the default animated-property palette. Any
     other animated property (background/border-color, left/top, width/height, fill) requires
     a bounded, named product reason in the PR body plus real motion evidence. Unbounded
     layout-thrashing choreography is always an RA.

2. **Token-only timing:** a call-site duration/easing literal on these surfaces is a contract
   violation — durations/easings ride the motion vocabulary or a domain alias of it, so the
   reduced-motion collapse governs with nothing to override it.

3. **Evidence expectation:** motion claims carry motion evidence — a recording, a FLIP/motion
   witness spec, or the visual-baseline harness; static source inference does not certify
   rendered motion.

## Retirement trigger

This audit retires when a mechanical motion lint (duration/easing-literal detection +
hard-cut witness coverage) enforces the same gate in CI — the checklist line then moves from
reviewer discipline to substrate, per the accretion-defense symmetry.

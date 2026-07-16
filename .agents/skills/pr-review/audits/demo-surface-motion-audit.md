# Demo-Surface Motion Audit

**Trigger:** the PR diff touches a demo or product surface's rendered motion — animations,
transitions, choreography classes, motion-token consumption, or any UI state change on
`apps/**` showcase surfaces, `examples/dashboard/**`, or the dashboard affordance layers.

**Authority:** #14780's ratified rule set (design-authority ratification, 2026-07-12,
including the two accepted reviewer corrections). The token vocabulary itself is merged
substrate (`resources/scss/_motion.scss`, all themes).

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

3. **Evidence expectation:** motion claims carry motion evidence — a recording or a
   FLIP/motion witness spec (computed mid-transition state, `observe_motion`, or an
   equivalent runtime probe). The visual-baseline harness certifies APPEARANCE and
   end-states only — a static golden can never certify rendered motion, and neither can
   source inference. Appearance evidence offered for a motion claim is itself a finding.

## Retirement trigger

This audit retires when a mechanical motion lint enforces the same three gates in CI —
duration/easing-literal detection, hard-cut witness coverage, AND animated-property
(layout-thrash) detection beyond the transform/opacity palette. Partial lint coverage
retires only the covered gate's checklist line; the rest stays reviewer discipline, per
the accretion-defense symmetry.

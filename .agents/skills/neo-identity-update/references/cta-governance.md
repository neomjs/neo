# CTA Governance

ACTIONS are the governed next-step surfaces in Neo identity: calls-to-action,
doors, proof links, community joins, install commands, service contact paths,
and any surface that asks a visitor, contributor, or evaluator to do something.

They are not FACTS and not FRAMING:

| Class | Question answered | Governance mechanic |
|---|---|---|
| FACTS | "What is true?" | Single source, derive, generate, or coherence-check. |
| FRAMING | "How do we describe Neo to this audience?" | Audience-segmented projection against the apex. |
| ACTIONS | "What can this audience do next, and can they see why?" | Audience-segmented doors, liveness checks, and proof adjacency. |

## Principles

1. **Every pitch has a door.** A surface that pitches a capability must not end
   only in passive reading unless the intended next step really is learning.
2. **Audience-segmented doors.** Developer, evaluator, maintainer, and
   decision-maker audiences may need different doors. Do not find-replace CTA
   text across surfaces.
3. **Proof-surfacing.** When a CTA follows a strong claim, link visible receipts
   near the claim or door: dated repo stats, merged PR history, public review
   conversations, relevant Discussions, ADRs, or verified docs.
4. **No dead channel as a primary CTA.** A primary door must be live,
   maintained, and appropriate for the audience. If liveness cannot be verified,
   demote it or record the dependency.
5. **Business-owned content stays business-owned.** The skill governs the
   structure, liveness, audience fit, and proof adjacency of CTAs. It does not
   invent offers, inboxes, pricing, promises, or lead-capture copy.
6. **Coherence-check across the surface map.** Identity updates that touch an
   ACTION must enumerate all CTA-bearing surfaces in `affected-areas-map.md`
   and explain why each door is unchanged, updated, or out of scope.

## Mechanics

For each CTA-bearing surface:

1. Name the audience and the pitch immediately above or around the door.
2. Classify the door type:
   - `install` - commands such as `npx neo-app@latest`.
   - `learn` - docs, guides, ADRs, or tutorials.
   - `proof` - repo stats, PR history, review threads, Discussions, examples.
   - `community` - Discord, Slack, GitHub Discussions, social surfaces.
   - `contact` - services, support, training, sponsorship, or talk-to-us paths.
   - `contribute` - contributing guide, issues, PR workflow, maintainer onboarding.
3. Verify liveness before treating it as primary. Examples: source exists,
   route exists, generated output derives from the generator, public URL is still
   appropriate, channel retention is acceptable for the audience.
4. Check proof adjacency. If the CTA leans on a proof claim, the reader should
   be able to inspect the proof without hunting.
5. Keep unknown business content explicit. Use "business/product dependency" in
   the PR body rather than inventing the offer or destination.

## Boundaries

- Do not edit README or portal CTA copy merely because this governance file
  changed. A downstream `/neo-identity-update` run owns surface copy.
- Do not name a client, partner, customer, private deal, private usage metric,
  or private business target in public artifacts.
- Do not make Slack, Discord, or any other community surface the primary door
  for an audience if the channel's retention, activity, or ownership does not
  support that job.
- Do not promote "proof" from vibe. Re-run the factual check or link the
  artifact that already contains the verified proof.

## PR Body Checklist

Identity PRs touching ACTIONS must include:

- `ACTIONS touched:` yes/no.
- CTA-bearing surfaces enumerated from `affected-areas-map.md`.
- Audience and door type for each changed CTA.
- Liveness evidence for each primary CTA.
- Proof adjacency evidence when the CTA follows a claim.
- Business/product dependencies explicitly named when offer content is unknown.

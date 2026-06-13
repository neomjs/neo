/**
 * @summary The single canonical source of the standing lane directive appended to every wake digest.
 *
 * Extracted from the wake-daemon entry (`ai/daemons/wake/daemon.mjs`, which imports + appends it in the
 * digest builder) so the directive text has ONE named, testable authority the discussion / ticket / source
 * wording cannot silently drift from.
 *
 * @summary Why lifecycle-first ordering (the graduation thesis).
 * The prior directive led with "claim an unclaimed lane," pushing an idle agent toward fresh backlog even
 * when the highest-value action was already-created PR lifecycle work (own red CI, own PR awaiting review
 * routing, an assigned re-review, a peer PR blocked by this agent's REQUEST_CHANGES, or a green peer PR
 * where this agent is the scarce cross-family reviewer). This version leads with that lifecycle queue
 * before fresh-lane pickup, and names the legitimate idle terminals (verified-empty / human-merge-gate /
 * blocked-state) so a genuinely-gated agent is not pushed to manufacture work.
 *
 * Harness-agnostic prose: it carries no Claude-, Codex-, Gemini-, or Antigravity-specific payload
 * assumptions, so the same directive text is correct on every harness the wake daemon serves.
 *
 * @member {String} WAKE_LANE_DIRECTIVE
 */
export const WAKE_LANE_DIRECTIVE =
    'Directive — lifecycle-first, then a fresh lane: before claiming new backlog work, first clear your ' +
    'PR lifecycle obligations in priority order — (1) your own PRs with red / unstable / stuck CI; ' +
    '(2) your own green PRs that still need a reviewer routed; (3) reviews / re-reviews where you are the ' +
    'requested reviewer; (4) peer PRs you blocked with REQUEST_CHANGES once the author says it is ' +
    'addressed; (5) green peer PRs where you are a scarce viable cross-family reviewer (opening a ' +
    'same-family PR only grows that reviewer\'s queue). Only when that lifecycle queue is verified-empty: ' +
    'survey the open backlog (list_issues / ideation) and drive a fresh unclaimed lane implementation → ' +
    'test → PR. A wake is not "handled" by acknowledgement alone while actionable lifecycle work or open ' +
    'lanes exist; the only legitimate idle terminals are a verified-empty lifecycle + backlog survey, a ' +
    'human merge-gate, or an explicit blocked-state. Acknowledge pure-FYI broadcasts in one line.';

export default WAKE_LANE_DIRECTIVE;

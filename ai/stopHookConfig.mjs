/**
 * @summary The stop-hook policy pure-defaults twin — the sanctioned non-entrypoint companion
 * (ticket-ref-ok: ADR 0019 §5.5 names this exact module shape) to the `stopHook` leaf subtree
 * in `ai/configBase.mjs`.
 *
 * The turn-end hooks (`.claude/hooks/laneStateStopHook.mjs`, `.codex/hooks/codex-lane-state-stop.mjs`)
 * are genuine non-entrypoints: they must not import Neo singletons (ticket-ref-ok: ADR 0019 C1 is
 * the sanctioned-pattern name for this ZERO-tolerance constraint),
 * and they run on every single turn-end inside a 10s budget where full-framework bootstrap weight is
 * not payable. So they resolve policy through THIS module, and the leaf subtree declares FROM these
 * constants (ticket-ref-ok: ADR 0019 §10.1 names this inversion) — literal drift between hook and leaf is impossible by
 * construction.
 *
 * **Resolver-equivalence note (why this twin carries a pairing test rather than by-construction
 * equivalence):** §10.1 gets by-construction equivalence for STRING leaves because truthiness and the
 * provider's emptiness check partition identically (`''` is the only falsy string). Booleans do NOT:
 * `'false'` is a truthy JS string but must resolve to `false`. So {@link parseStopHookBool} replicates
 * `Neo.util.Env.parseBool`'s token semantics explicitly, and the pairing test pins that equivalence.
 * This is §10.1's named fallback shape, used because the by-construction path is unavailable — not
 * because the inversion was skipped.
 *
 * ## Why two independent axes
 *
 * The turn-end hook does two unrelated jobs that were previously welded to one enforcement flag
 * (`NEO_LANE_STATE_ENFORCE`), so disabling the expensive one also disabled the cheap one:
 *
 * - **`deferenceMirror`** — reflects helpful-assistant register slips ("would you like me to…?")
 *   back as the equal-peer reminder. One injected paragraph, no forced continuation. Empirically the
 *   part that earns its cost; ON by default.
 * - **`laneContinuation`** — the no-hold forced-continuation apparatus: refusing a turn-end, the
 *   lane-state JSON terminal contract, the drive-ratchet, the clean-terminal and material-artifact
 *   acceptance edges, and the injected lifecycle directive. Measured cost over a 26h window:
 *   ONE refusal spawns a median-20-message work chain (mean 34.4, p90 78, max 239) at ~1.79M
 *   full-rate-equivalent tokens, because every message in the chain re-reads a context that is deep
 *   precisely because the session is late — 30.1% of all billed volume in the window. OFF by default.
 *
 * @module Neo.ai.stopHookConfig
 */

/**
 * @summary Env-var names for the stop-hook policy leaves — the single naming source shared by the
 * leaf subtree and the non-entrypoint hooks.
 * @type {Object}
 */
export const STOP_HOOK_ENV = Object.freeze({
    deferenceMirror : 'NEO_STOP_HOOK_DEFERENCE_MIRROR',
    laneContinuation: 'NEO_STOP_HOOK_LANE_CONTINUATION'
});

/**
 * @summary Declared defaults for the stop-hook policy leaves. The leaf subtree in `ai/configBase.mjs`
 * declares FROM these literals (ticket-ref-ok: ADR 0019 §10.1 names this inversion), so there is
 * exactly one copy of each value.
 * @type {Object}
 */
export const STOP_HOOK_DEFAULTS = Object.freeze({
    /**
     * The deference mirror stays ON: it is one injected paragraph with no continuation chain behind
     * it, and it is the mechanism that converts a register slip into equal-peer posture rather than
     * a stop. Disabling it was never the cost problem — it was collateral damage of the single
     * all-or-nothing enforcement flag this leaf pair replaces.
     */
    deferenceMirror: true,

    /**
     * Forced lane continuation is OFF by default (operator-directed, 2026-07-25, from live
     * flatrate-burn economics). This is an L3_No_Hold_State teeth change and therefore Tier-4 —
     * authorized because the human operator directed it, never self-licensable by an agent. An
     * agent proposing to flip this to `false` for its own turn is the exact regression L3 names;
     * the leaf is operator/deployment authority, which is why it lives in config rather than in
     * anything an agent emits.
     */
    laneContinuation: false
});

/**
 * Tokens accepted as `true`, mirroring `Neo.util.Env.TRUE_TOKENS`. Duplicated deliberately: this
 * module must not import Neo (ticket-ref-ok: ADR 0019 C1 names this constraint). The pairing test
 * pins the two lists equal.
 * @type {String[]}
 */
export const TRUE_TOKENS = Object.freeze(['true', 'yes', 'on', '1']);

/**
 * Tokens accepted as `false`, mirroring `Neo.util.Env.FALSE_TOKENS`.
 * @type {String[]}
 */
export const FALSE_TOKENS = Object.freeze(['false', 'no', 'off', '0']);

/**
 * @summary Boolean env decode without importing Neo — token-equivalent to `Neo.util.Env.parseBool`.
 * An absent, empty, or unrecognized value returns `undefined` so the DECLARED DEFAULT applies
 * (never a silent `false`): a typo'd override must not read as a deliberate disable.
 * @param {String} envVarName
 * @param {Object} [options]
 * @param {Object} [options.env=process.env] Environment source.
 * @returns {Boolean|undefined}
 */
export function parseStopHookBool(envVarName, {env = process.env} = {}) {
    const rawValue = env[envVarName];

    if (rawValue === undefined || rawValue === null || rawValue === '') return;

    const normalized = String(rawValue).trim().toLowerCase();

    if (TRUE_TOKENS.includes(normalized))  return true;
    if (FALSE_TOKENS.includes(normalized)) return false;

    return
}

/**
 * @summary Resolves the stop-hook policy for a non-entrypoint hook — env override else declared
 * default, per axis. Pure + total: an unreadable/garbage env value falls back to the declared
 * default rather than throwing, because this runs inside the turn-end hook path where a throw
 * would trap every turn.
 * @param {Object} [options]
 * @param {Object} [options.env=process.env] Environment source.
 * @returns {{deferenceMirror: Boolean, laneContinuation: Boolean}}
 */
export function resolveStopHookPolicy({env = process.env} = {}) {
    return {
        deferenceMirror : parseStopHookBool(STOP_HOOK_ENV.deferenceMirror,  {env}) ?? STOP_HOOK_DEFAULTS.deferenceMirror,
        laneContinuation: parseStopHookBool(STOP_HOOK_ENV.laneContinuation, {env}) ?? STOP_HOOK_DEFAULTS.laneContinuation
    }
}

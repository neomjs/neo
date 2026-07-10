// Per-family harness-home env contract: the ONE env var each supported harness CLI honors as its
// config/state home — the isolation mechanism that lets many agents share one machine without
// sharing auth or session state. These are CROSS-PROCESS CONTRACTS (each CLI reads its exact name),
// so fixed module data, not configurable fields — an override would set a var the harness never
// reads, silently collapsing the isolation (fail-OPEN). Empirical grounding per family in the
// function JSDoc below.
const HARNESS_HOME_ENV_VARS = {
    'claude-code': 'CLAUDE_CONFIG_DIR',
    'codex'      : 'CODEX_HOME'
};

// Per-family LONG-LIVED mode args — the half of the launch tuple that keeps the process alive
// under supervision. Both CLIs exit immediately when launched bare with a non-TTY/EOF'd stdin
// (probed on the exact binaries), so a supervisable template MUST pin a protocol mode AND the
// supervisor MUST hold stdin open as a pipe (the lifecycle service's stdio contract):
// - codex `app-server`: the CLI's own long-lived JSON-RPC-over-stdio protocol mode — probed alive
//   at 4s on a held pipe (codex-cli 0.144.0-alpha.4), clean SIGTERM stop.
// - claude-code stream-json print mode: the CLI's long-lived stream-JSON session over stdio —
//   probed alive at 4s on a held pipe (claude CLI 2.1.156), clean SIGTERM stop. `--verbose` is
//   required by the CLI when combining `--print` with `--output-format stream-json`.
const HARNESS_MODE_ARGS = {
    'claude-code': ['--input-format', 'stream-json', '--output-format', 'stream-json', '--print', '--verbose'],
    'codex'      : ['app-server']
};

/**
 * @summary Derive the per-family harness launch template for a Fleet Manager agent: the
 * `{command, args, env}` spec that starts one ISOLATED harness instance bound to its own
 * config/state home.
 *
 * The pure half of Fleet Manager harness-launch templating: given a harness family, the agent's
 * derived instance home (see {@link Neo.ai.services.fleet.deriveAgentInstanceHome}) and the
 * config-resolved binary path, decide *how* that harness launches — deterministic template math
 * only, with no fs / spawn / env / config access. `FleetLifecycleService.resolveLaunch` consumes
 * this as the curated-intent normal form (`harnessType` stays classification; the registry payload
 * never carries a command), keeping the correctness-and-security-critical mapping fully
 * unit-testable.
 *
 * Per-family contracts — isolation (the home env var each CLI honors) AND liveness (the
 * long-lived protocol mode each CLI stays resident in; see the mode-args map above — a bare
 * launch exits immediately without a TTY, so the mode args are part of the template, never a
 * caller afterthought):
 *
 * - **`'codex'`** → `{command: binaryPath, args: ['app-server'], env: {CODEX_HOME: instanceHome}}`.
 *   Isolation empirically proven: the codex CLI honors `CODEX_HOME` — `codex doctor` against a
 *   fresh home reports no-auth while the default `~/.codex` stays untouched, so per-agent homes
 *   never share auth or session state. Liveness empirically proven: `app-server` on a held-open
 *   piped stdin stays resident and stops cleanly on SIGTERM. Two caveats: an app-bundled codex
 *   binary (e.g. the ChatGPT.app `Resources/codex`) is an ALPHA channel that self-updates with its
 *   app — pin the AiConfig `fleet.harnessBinaries.codex` leaf and read the lifecycle status's
 *   `binaryVersion` surface; and per-home `codex login` is the operator-owned auth step (a
 *   freshly-derived home starts unauthenticated by design — the lifecycle status's `authRequired`
 *   surfaces it).
 *
 * - **`'claude-code'`** → `{command: binaryPath, args: [<stream-json print mode>], env:
 *   {CLAUDE_CONFIG_DIR: instanceHome}}`. Isolation empirically verified (claude CLI 2.1.156,
 *   macOS): pointing `CLAUDE_CONFIG_DIR` at a fresh dir yields a logged-out instance materializing
 *   its own config tree (`.claude.json`, `projects/`, `sessions/`) while the default `~/.claude`
 *   stays the untouched ambient auth home. Liveness empirically verified: the stream-JSON session
 *   on a held-open piped stdin stays resident and stops cleanly on SIGTERM. Per-home `/login` is
 *   the operator-owned auth step.
 *
 * GUI launches (`open -n -a …`) are **excluded by design**: `open` detaches — the spawned process
 * is the launcher, not the harness — so the Fleet Manager could never supervise (signal, reap, or
 * observe) the actual harness. Only directly-spawnable CLI binaries are templated.
 *
 * An unknown / absent `harnessType` **throws**, naming the supported set — mirroring the lifecycle
 * service's "classification, not a launcher" stance: this module maps known families; it never
 * guesses a brittle command for an unknown one.
 *
 * @param {Object} options
 * @param {String} options.harnessType  The harness family — one of `'codex'`, `'claude-code'`.
 * @param {String} options.instanceHome The agent's isolated harness home (see
 *                                      {@link Neo.ai.services.fleet.deriveAgentInstanceHome}).
 * @param {String} options.binaryPath   The harness binary to spawn (config-resolved by the caller;
 *                                      never guessed here).
 * @returns {{command: String, args: String[], env: Object}} a fresh spec per call — `args` / `env`
 * are caller-mutable without cross-call bleed.
 * @throws {Error} If any argument is not a non-empty string, or `harnessType` is not a supported
 * family.
 */
export function deriveHarnessLaunchSpec({harnessType, instanceHome, binaryPath} = {}) {
    assertNonEmptyString(harnessType,  'harnessType');
    assertNonEmptyString(instanceHome, 'instanceHome');
    assertNonEmptyString(binaryPath,   'binaryPath');

    const homeEnvVar = HARNESS_HOME_ENV_VARS[harnessType];

    if (!homeEnvVar) {
        const supported = Object.keys(HARNESS_HOME_ENV_VARS).map(type => `'${type}'`).join(', ');
        throw new Error(`deriveHarnessLaunchSpec: unsupported harnessType '${harnessType}'. Supported: ${supported}.`);
    }

    return {command: binaryPath, args: [...HARNESS_MODE_ARGS[harnessType]], env: {[homeEnvVar]: instanceHome}};
}

/**
 * Guard a required string argument.
 * @param {*}      value
 * @param {String} name
 * @throws {Error} If `value` is not a non-empty string.
 * @private
 */
function assertNonEmptyString(value, name) {
    if (typeof value !== 'string' || value.length === 0) {
        throw new Error(`deriveHarnessLaunchSpec: '${name}' must be a non-empty string.`);
    }
}

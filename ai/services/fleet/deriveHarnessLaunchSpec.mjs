import {HARNESS_TYPES} from '../../../src/ai/fleet/harnessTypes.mjs';

// Per-family launch contracts — ONE entry per LAUNCHABLE family, keyed by the durable harness-type
// from the shared registry authority (src/ai/fleet/harnessTypes.mjs). Every entry carries the three
// template halves; all of them are CROSS-PROCESS CONTRACTS (each harness reads its exact env var /
// command-line switch), so fixed module data, not configurable fields — an override would set a
// name the harness never reads, silently collapsing the isolation (fail-OPEN):
//
// - isolation — exactly ONE of:
//   `homeEnvVar`  (CLI families): the env var the harness honors as its config/state home.
//   `homeArgFlag` (Electron/Chromium app-bundle families): the switch that relocates the profile
//   AND the per-profile single-instance lock — which is precisely what lets many supervised
//   instances of one GUI app coexist on a single machine (probed per family; see the fn JSDoc).
// - `modeArgs` — the LONG-LIVED mode half for CLI families (both CLIs exit immediately on a
//   non-TTY/EOF'd stdin, so a supervisable template pins a protocol mode AND the supervisor holds
//   stdin open as a pipe — the lifecycle service's stdio contract):
//   - codex `app-server`: the CLI's own long-lived JSON-RPC-over-stdio protocol mode — probed alive
//     at 4s on a held pipe (codex-cli 0.144.0-alpha.4), clean SIGTERM stop.
//   - claude-code stream-json print mode: the CLI's long-lived stream-JSON session over stdio —
//     probed alive at 4s on a held pipe (claude CLI 2.1.156), clean SIGTERM stop. `--verbose` is
//     required by the CLI when combining `--print` with `--output-format stream-json`.
//   GUI app-bundle families are inherently long-lived (an app run IS the session) and indifferent
//   to stdin — the held pipe is harmless there; pid/SIGTERM is the supervision handle. Empty.
// - `versionProbeArgs` — the argv for the supervisor's best-effort `binaryVersion` capture, or
//   `null` when the family cannot answer a version ask without booting the whole app (probed:
//   antigravity boots and emits wizard log lines instead of a version) — the supervisor SKIPS the
//   probe and `binaryVersion` stays honestly `null`. For `homeArgFlag` families the derivation
//   prepends the isolation flag, so even the probe subprocess can never cross into another
//   instance's (or the operator's own) single-instance scope.
// - `authMode` — how the operator-owned per-home auth step happens for the family:
//   `'marker'` = a documented marker file inside the home flips the lifecycle `authRequired`
//   heuristic (CLI families; the login is a command). `'in-app'` = auth is the sign-in INSIDE the
//   launched window — no marker exists, `authRequired` stays honestly `null`, and the handoff
//   instruction must render from THIS mode, never from the (permanently null) heuristic.
const HARNESS_LAUNCH_CONTRACTS = {
    'antigravity': {
        authMode        : 'in-app',
        homeArgFlag     : '--user-data-dir',
        modeArgs        : [],
        versionProbeArgs: null
    },
    'claude-code': {
        authMode        : 'marker',
        homeEnvVar      : 'CLAUDE_CONFIG_DIR',
        modeArgs        : ['--input-format', 'stream-json', '--output-format', 'stream-json', '--print', '--verbose'],
        versionProbeArgs: ['--version']
    },
    'claude-desktop': {
        authMode        : 'in-app',
        homeArgFlag     : '--user-data-dir',
        modeArgs        : [],
        versionProbeArgs: ['--version']
    },
    'codex': {
        authMode        : 'marker',
        homeEnvVar      : 'CODEX_HOME',
        modeArgs        : ['app-server'],
        versionProbeArgs: ['--version']
    }
};

// Lockstep guard (fail-loud at import): the launch vocabulary is a strict SUBSET of the shared
// registry authority — a contract for an unregistered type means the two lists were edited out of
// order (register the harness type first; the Body's pickers/cards derive from that same entry).
{
    const registered = new Set(HARNESS_TYPES.map(entry => entry.type));

    for (const type of Object.keys(HARNESS_LAUNCH_CONTRACTS)) {
        if (!registered.has(type)) {
            throw new Error(`deriveHarnessLaunchSpec: launch contract '${type}' is not a registered harness type (src/ai/fleet/harnessTypes.mjs). Register the type there first — the launch vocabulary must stay a subset of the shared authority.`);
        }
    }
}

/**
 * @summary The launch-TEMPLATED subset of the shared harness-type registry, alphabetical — the ONE
 * derived truth for "can the Fleet Manager launch this family?". Consumers (the onboarding
 * conductor's curated intent, cockpit launchability rendering) read this instead of keeping a
 * second list. `native-neo` is deliberately registered-but-unlaunchable: it names the Body-native
 * agent runtime, not an external harness process — it joins this set only when that runtime exists
 * to be spawned.
 * @type {ReadonlyArray<String>}
 */
export const LAUNCHABLE_HARNESS_TYPES = Object.freeze(Object.keys(HARNESS_LAUNCH_CONTRACTS).sort());

/**
 * @summary The family's operator-owned auth mode — `'marker'` (a documented marker file inside the
 * home drives the lifecycle `authRequired` heuristic; the login is a command) or `'in-app'` (auth
 * is the sign-in inside the launched window; no marker exists and `authRequired` stays honestly
 * `null`, so ANY auth handoff for these families must branch on THIS mode, never on the
 * permanently-null heuristic). `null` for unlaunchable/unknown families — consumers fail closed.
 * @param {String} harnessType
 * @returns {'marker'|'in-app'|null}
 */
export function getHarnessAuthMode(harnessType) {
    return HARNESS_LAUNCH_CONTRACTS[harnessType]?.authMode ?? null;
}

/**
 * @summary Derive the per-family harness launch template for a Fleet Manager agent: the
 * `{command, args, env, versionProbeArgs}` spec that starts one ISOLATED harness instance bound to
 * its own config/state home.
 *
 * The pure half of Fleet Manager harness-launch templating: given a harness family, the agent's
 * derived instance home (see {@link Neo.ai.services.fleet.deriveAgentInstanceHome}) and the
 * config-resolved binary path, decide *how* that harness launches — deterministic template math
 * only, with no fs / spawn / env / config access. `FleetLifecycleService.resolveLaunch` consumes
 * this as the curated-intent normal form (`harnessType` stays classification; the registry payload
 * never carries a command), keeping the correctness-and-security-critical mapping fully
 * unit-testable.
 *
 * Per-family contracts — isolation AND liveness (see the contract map above for the mechanism
 * split: env-var homes for CLI families, `--user-data-dir` profile relocation for app-bundle
 * families):
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
 * - **`'claude-desktop'`** → `{command: binaryPath, args: ['--user-data-dir=<home>'], env: {}}`.
 *   The app-bundle MAIN binary (`Claude.app/Contents/MacOS/Claude`, a universal Mach-O) spawned
 *   DIRECTLY — a real supervisable child, not an `open -n` launcher. Probed on the exact binary
 *   (Claude 1.20186.0, macOS): two instances with distinct `--user-data-dir` homes coexist
 *   (the Electron single-instance lock keys on the profile dir), each home materializes its own
 *   Chromium profile tree, both stop SIGTERM-clean (exit 0), and
 *   `--user-data-dir=<home> --version` answers `1.20186.0` in ~330ms without booting the app.
 *   Auth is the in-app sign-in inside the launched window — no CLI login; no documented auth
 *   marker, so the lifecycle `authRequired` heuristic stays `null` (honest unknown) for this
 *   family.
 *
 * - **`'antigravity'`** → `{command: binaryPath, args: ['--user-data-dir=<home>'], env: {}}`.
 *   Same direct-spawn contract on the VSCode-fork main binary
 *   (`Antigravity.app/Contents/MacOS/Antigravity`). Probed (macOS): dual-instance
 *   coexistence on distinct homes, per-home profile trees, SIGTERM-clean exit 0. Its binary does
 *   NOT answer `--version` without booting the app (wizard log lines instead of a version), so
 *   `versionProbeArgs` is `null` — the supervisor skips the probe and `binaryVersion` stays
 *   honestly `null`. Auth is the in-app sign-in; `authRequired` stays `null` as above.
 *
 * `open -n -a …` launches remain **excluded by design**: `open` detaches — the spawned process is
 * the launcher, not the harness — so the Fleet Manager could never supervise (signal, reap, or
 * observe) the actual harness. The app-bundle families above are templated precisely because their
 * MAIN binaries spawn directly; the exclusion still bars any template built on a detaching
 * launcher.
 *
 * An unknown / absent `harnessType` **throws**, naming the supported set — mirroring the lifecycle
 * service's "classification, not a launcher" stance: this module maps known families; it never
 * guesses a brittle command for an unknown one.
 *
 * @param {Object} options
 * @param {String} options.harnessType  The harness family — one of {@link LAUNCHABLE_HARNESS_TYPES}.
 * @param {String} options.instanceHome The agent's isolated harness home (see
 *                                      {@link Neo.ai.services.fleet.deriveAgentInstanceHome}).
 * @param {String} options.binaryPath   The harness binary to spawn (config-resolved by the caller;
 *                                      never guessed here).
 * @returns {{command: String, args: String[], env: Object, versionProbeArgs: String[]|null}} a
 * fresh spec per call — `args` / `env` / `versionProbeArgs` are caller-mutable without cross-call
 * bleed. `versionProbeArgs` is the argv for the supervisor's best-effort version capture
 * (isolation-flag-prefixed for `homeArgFlag` families) or `null` when the family cannot answer one
 * without booting the app — the supervisor skips the probe.
 * @throws {Error} If any argument is not a non-empty string, or `harnessType` is not a launchable
 * family.
 */
export function deriveHarnessLaunchSpec({harnessType, instanceHome, binaryPath} = {}) {
    assertNonEmptyString(harnessType,  'harnessType');
    assertNonEmptyString(instanceHome, 'instanceHome');
    assertNonEmptyString(binaryPath,   'binaryPath');

    const contract = HARNESS_LAUNCH_CONTRACTS[harnessType];

    if (!contract) {
        const supported = LAUNCHABLE_HARNESS_TYPES.map(type => `'${type}'`).join(', ');
        throw new Error(`deriveHarnessLaunchSpec: unsupported harnessType '${harnessType}'. Supported: ${supported}.`);
    }

    if (contract.homeEnvVar) {
        return {
            command         : binaryPath,
            args            : [...contract.modeArgs],
            env             : {[contract.homeEnvVar]: instanceHome},
            versionProbeArgs: contract.versionProbeArgs && [...contract.versionProbeArgs]
        };
    }

    // homeArgFlag family: the isolation rides argv — on the launch AND on the version probe, so no
    // subprocess of this instance can ever land inside another profile's single-instance scope.
    const homeArg = `${contract.homeArgFlag}=${instanceHome}`;

    return {
        command         : binaryPath,
        args            : [homeArg, ...contract.modeArgs],
        env             : {},
        versionProbeArgs: contract.versionProbeArgs && [homeArg, ...contract.versionProbeArgs]
    };
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

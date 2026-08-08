import {HARNESS_TYPES} from './harnessTypes.mjs';
import path            from 'node:path';

// Per-family launch contracts — ONE entry per LAUNCHABLE family, keyed by the durable harness-type
// from the harness-type authority (./harnessTypes.mjs). Every entry carries the three
// template halves; all of them are CROSS-PROCESS CONTRACTS (each harness reads its exact env var /
// command-line switch), so fixed module data, not configurable fields — an override would set a
// name the harness never reads, silently collapsing the isolation (fail-OPEN):
//
// - isolation — one OR BOTH of:
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
//   `'marker'` = a documented marker file inside the AUTH home flips the lifecycle `authRequired`
//   heuristic (the login is a command; Codex Desktop deliberately uses the sibling bundled CLI
//   against its nested `codex-home`). `'in-app'` = auth is the sign-in INSIDE the
//   launched window — no marker exists, `authRequired` stays honestly `null`, and the handoff
//   instruction must render from THIS mode, never from the (permanently null) heuristic.
//   `'env-key'` = auth rides the SPAWN ENVIRONMENT (a provider API key in the seat env), so no
//   per-home auth step exists at all: no marker to check (`authRequired` stays `null`), no window
//   to sign in through (the supervised mode is headless) — the handoff names the provisioning
//   assumption instead of inventing a login.
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
    },
    'codex-desktop': {
        authMode        : 'marker',
        versionProbeArgs: null
    },
    // Isolation is a TWO-var XDG pair, not a single homeEnvVar: the derivation points BOTH
    // XDG_CONFIG_HOME and XDG_DATA_HOME at the instance home (plus XDG_CACHE_HOME at a child),
    // so config AND state unify beneath it — see the derivation branch + the fn JSDoc probe record.
    'opencode': {
        authMode        : 'env-key',
        modeArgs        : ['serve', '--hostname', '127.0.0.1', '--port', '0'],
        versionProbeArgs: ['--version']
    },
    // v0.28+: `kimi web` is the resident server mode (`kimi server` is hard-deprecated). Isolation
    // is the single KIMI_CODE_HOME var — config AND state unify beneath it. Probe record in the fn JSDoc.
    'kimi-code': {
        authMode        : 'env-key',
        homeEnvVar      : 'KIMI_CODE_HOME',
        modeArgs        : ['web', '--no-open', '--port', '0'],
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
            throw new Error(`deriveHarnessLaunchSpec: launch contract '${type}' is not a registered harness type (ai/services/fleet/harnessTypes.mjs). Register the type there first — the launch vocabulary must stay a subset of the authority.`);
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
 * home drives the lifecycle `authRequired` heuristic; the login is a command), `'in-app'` (auth
 * is the sign-in inside the launched window; no marker exists and `authRequired` stays honestly
 * `null`, so ANY auth handoff for these families must branch on THIS mode, never on the
 * permanently-null heuristic), or `'env-key'` (auth rides the spawned env as a provider API key;
 * no per-home step exists, `authRequired` stays `null`, and the handoff names the provisioning
 * assumption). `null` for unlaunchable/unknown families — consumers fail closed.
 * @param {String} harnessType
 * @returns {'marker'|'in-app'|'env-key'|null}
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
 * - **`'codex-desktop'`** → the packaged app MAIN binary with two fixed child homes beneath the
 *   contained Fleet instance home: `codex-home` (auth/state) + `electron-profile` (native Chromium
 *   profile + single-instance lock). Its launch tuple is
 *   `--user-data-dir=<electronProfile> --open-project=<absolute provisioned cwd>` plus child-only
 *   `CODEX_HOME`, `CODEX_ELECTRON_USER_DATA_PATH` (the app-side mirror of the same profile), and
 *   `CODEX_SPARKLE_ENABLED=false` (secondary residents never own updates). Unlike the other GUI
 *   families, OAuth remains marker-driven through the bundled CLI, so the result carries typed
 *   `authHome` and `electronProfile` metadata for the lifecycle owner. A missing or relative cwd
 *   throws before spawn: silently opening the Fleet server's cwd would fork project-keyed memory.
 *   The app binary is never executed as a version probe — that would boot another GUI/helper set;
 *   installed-bundle capability proof is owned by `manageCodexDesktopRuntime` instead.
 *
 * - **`'claude-code'`** → `{command: binaryPath, args: ['--mcp-config',
 *   '<instanceHome>/mcp-config.json', '--strict-mcp-config', <stream-json print mode>], env:
 *   {CLAUDE_CONFIG_DIR: instanceHome}}`. The explicit strict path binds the secret-free, Fleet-owned
 *   MCP projection prepared before spawn; the CLI's documented `${VAR}` expansion resolves dynamic
 *   Fleet child env only in memory. Isolation empirically verified (claude CLI 2.1.156,
 *   macOS): pointing `CLAUDE_CONFIG_DIR` at a fresh dir yields a logged-out instance materializing
 *   its own config tree (`.claude.json`, `projects/`, `sessions/`) while the default `~/.claude`
 *   stays the untouched ambient auth home. Liveness empirically verified: the stream-JSON session
 *   on a held-open piped stdin stays resident and stops cleanly on SIGTERM. Per-home `/login` is
 *   the operator-owned auth step.
 *
 * - **`'claude-desktop'`** → `{command: binaryPath, args: ['--user-data-dir=<home>'], env:
 *   {CLAUDE_USER_DATA_DIR: instanceHome}}`. The env binding is not redundant: installed Desktop
 *   1.20186.1 otherwise appends its internal `-3p` suffix and reads a sibling config path. Its exact
 *   startup code applies `CLAUDE_USER_DATA_DIR` through Electron `app.setPath('userData', ...)`, so
 *   config, logs, and profile stay contained at the derived resident home.
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
 * - **`'opencode'`** → `{command: binaryPath, args: ['serve', '--hostname', '127.0.0.1', '--port',
 *   '0'], env: {XDG_CONFIG_HOME: instanceHome, XDG_DATA_HOME: instanceHome, XDG_CACHE_HOME:
 *   '<instanceHome>/cache'}}`. The headless `serve` mode is the supervisable shape: stdio-
 *   indifferent (stays resident on an EOF'd stdin as well as a held pipe) and SIGTERM-clean.
 *   `--port 0` auto-assigns; the bound port is discovered from the server's listening log line.
 *   Isolation is a TWO-var XDG pair, not one home var: OpenCode reads its seat config from
 *   `$XDG_CONFIG_HOME/opencode/opencode.json(c)` and its state (db, logs, repos) from
 *   `$XDG_DATA_HOME/opencode/` — pointing BOTH at the instance home unifies the whole footprint
 *   as `<instanceHome>/opencode/` (the seat-config generator's planting target), with
 *   `XDG_CACHE_HOME=<instanceHome>/cache` containing the model-catalog cache; the bun runtime
 *   cache stays HOME-relative (harmless artifact). Probed (opencode-ai 1.18.3, darwin-arm64):
 *   `serve` alive at 4s with stdin held AND with stdin EOF, clean SIGTERM; unified-home census
 *   `<home>/opencode/{opencode.jsonc, opencode.db, log/, repos/}`; `--version` answers `1.18.3`
 *   in milliseconds. Auth is `'env-key'`: the provider API key rides the seat env (the portable
 *   flatrate property — the OpenCode+Kimi path), so NO per-home auth step exists; OAuth via
 *   `opencode auth login` writes provider state into the data home but is not the fleet path,
 *   and no documented marker exists, so `authRequired` stays honestly `null`.
 *
 * - **`'kimi-code'`** → `{command: binaryPath, args: ['web', '--no-open', '--port', '0'], env:
 *   {KIMI_CODE_HOME: instanceHome}}`. The resident `web` server mode is the supervisable shape
 *   (v0.28 hard-deprecated the `server` subcommand in its favor): stdio-indifferent (stays
 *   resident on an EOF'd stdin) and SIGTERM-clean; `--port 0` auto-assigns, with the bound port
 *   + bearer token printed on the startup banner (the supervisor's discovery surface, opencode
 *   parity). Isolation is the single `KIMI_CODE_HOME` var: config and state unify beneath it.
 *   Probed (kimi 0.28.0, darwin-arm64, 2026-07-20): `web --no-open --port 0` alive at 5s on an
 *   EOF'd stdin, bound-port banner line, clean SIGTERM exit, isolation census
 *   `<home>/{device_id, server/, server.token, workspaces.json, telemetry/}`, and a per-home
 *   `server/instances/{server_id}.json` carrying `{pid, host, port, heartbeat_at}` — the exact
 *   coordinate contract the wake daemon's kimi-server adapter discovers, so a
 *   Fleet-launched kimi seat is wake-addressable by construction (daemon subscriptions point
 *   `harnessTargetMetadata.lockPath`/envelope overrides at the instance home; the tracked
 *   SessionStart hook `.kimi-code/hooks/wakeEnvelopeHook.mjs` is `KIMI_CODE_HOME`-aware).
 *   `--version` answers in ~0.3s without booting. Auth is `'env-key'`: the flatrate API key
 *   rides the seat env (the portable-flatrate property), so NO per-home auth step exists;
 *   OAuth file storage under the home is the interactive alternative, and no documented marker
 *   exists, so `authRequired` stays honestly `null`.
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
 * @param {String} [options.cwd]        Final provisioned checkout; required + absolute for
 *                                      `codex-desktop`, ignored by other families.
 * @param {String} [options.serverPassword] Opt-in per-seat wake-server password (`opencode`
 *                                      family only): provisions `OPENCODE_SERVER_USERNAME` /
 *                                      `OPENCODE_SERVER_PASSWORD` into the seat env so the
 *                                      embedded server demands basic auth and the seat-side
 *                                      wake-envelope plugin can copy the pair. Caller-generated
 *                                      (seat generator / lifecycle); this derivation stays
 *                                      deterministic — absent ⇒ no auth keys are provisioned.
 * @returns {{command: String, args: String[], env: Object, versionProbeArgs: String[]|null}} a
 * fresh spec per call — `args` / `env` / `versionProbeArgs` are caller-mutable without cross-call
 * bleed. `versionProbeArgs` is the argv for the supervisor's best-effort version capture
 * (isolation-flag-prefixed for `homeArgFlag` families) or `null` when the family cannot answer one
 * without booting the app — the supervisor skips the probe.
 * @throws {Error} If any argument is not a non-empty string, or `harnessType` is not a launchable
 * family.
 */
export function deriveHarnessLaunchSpec({harnessType, instanceHome, binaryPath, cwd, serverPassword} = {}) {
    assertNonEmptyString(harnessType,  'harnessType');
    assertNonEmptyString(instanceHome, 'instanceHome');
    assertNonEmptyString(binaryPath,   'binaryPath');

    const contract = HARNESS_LAUNCH_CONTRACTS[harnessType];

    if (!contract) {
        const supported = LAUNCHABLE_HARNESS_TYPES.map(type => `'${type}'`).join(', ');
        throw new Error(`deriveHarnessLaunchSpec: unsupported harnessType '${harnessType}'. Supported: ${supported}.`);
    }

    if (harnessType === 'codex-desktop') {
        if (!path.isAbsolute(instanceHome)) {
            throw new Error(`deriveHarnessLaunchSpec: 'instanceHome' must be absolute for codex-desktop, received '${instanceHome}'.`);
        }
        if (typeof cwd !== 'string' || !path.isAbsolute(cwd)) {
            throw new Error("deriveHarnessLaunchSpec: 'cwd' must be an absolute provisioned checkout for codex-desktop.");
        }

        const
            authHome        = path.join(instanceHome, 'codex-home'),
            electronProfile = path.join(instanceHome, 'electron-profile');

        return {
            command: binaryPath,
            args   : [`--user-data-dir=${electronProfile}`, `--open-project=${cwd}`],
            env    : {
                CODEX_HOME                   : authHome,
                CODEX_ELECTRON_USER_DATA_PATH: electronProfile,
                CODEX_SPARKLE_ENABLED        : 'false'
            },
            versionProbeArgs: null,
            authHome,
            electronProfile
        };
    }

    if (harnessType === 'claude-code') {
        return {
            command: binaryPath,
            args   : [
                '--mcp-config', path.join(instanceHome, 'mcp-config.json'),
                '--strict-mcp-config',
                ...contract.modeArgs
            ],
            env             : {[contract.homeEnvVar]: instanceHome},
            versionProbeArgs: [...contract.versionProbeArgs]
        };
    }

    if (harnessType === 'claude-desktop') {
        const homeArg = `${contract.homeArgFlag}=${instanceHome}`;

        return {
            command         : binaryPath,
            args            : [homeArg],
            env             : {CLAUDE_USER_DATA_DIR: instanceHome},
            versionProbeArgs: [homeArg, ...contract.versionProbeArgs]
        };
    }

    if (harnessType === 'opencode') {
        return {
            command: binaryPath,
            args   : [...contract.modeArgs],
            env    : {
                XDG_CONFIG_HOME: instanceHome,
                XDG_DATA_HOME  : instanceHome,
                XDG_CACHE_HOME : path.join(instanceHome, 'cache'),
                // Wake-server auth (opt-in): when the caller provisions a per-seat server
                // password, the seat's embedded server demands basic auth and the seat-side
                // wake-envelope plugin can copy the credential pair from its own env. The
                // secret itself is generated by the caller (seat generator / lifecycle) —
                // this derivation stays deterministic.
                ...(serverPassword ? {
                    OPENCODE_SERVER_USERNAME: 'opencode',
                    OPENCODE_SERVER_PASSWORD: serverPassword
                } : {})
            },
            versionProbeArgs: [...contract.versionProbeArgs]
        };
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

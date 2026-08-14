import os                                                          from 'os';
import path                                                        from 'path';
import {fileURLToPath}                                             from 'url';
import ConfigProvider, {leaf}                                      from './ConfigProvider.mjs';
import {EMBEDDING_SAFE_PROCESSING_LIMIT_TOKENS}                    from './embeddingSafeBand.mjs';
import {CANONICAL_PLANE_ID, parsePlaneIdEnv, resolvePlaneDataRoot} from './planeConfig.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const neoRootDir = path.resolve(__dirname, '../');
// Fallback to neoRootDir if cwd is root (e.g., container/daemon edge cases)
const projectRoot = process.cwd() === '/' ? neoRootDir : process.cwd();
// The single plane-member anchor: every durable data-plane default below derives from this
// const. `resolvePlaneDataRoot` reads no env of its own — the leaf machinery owns all env
// binding — so no member re-derives its own root and no member resolves against ambient cwd.
const planeDataRootDefault  = resolvePlaneDataRoot({rootDir: neoRootDir});
const chromaUnitTestDataDir = path.join(os.tmpdir(), 'neo-chroma-unit-test');

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS  = 24 * HOUR_MS;

/**
 * @summary Env parser for the supervised-child heap ceiling — fails closed on anything that is not
 * a positive integer.
 *
 * A permissive parser is not merely untidy here, it inverts the safety property the ceiling exists
 * for: `-1` passes `Number(v) || fallback`, reaches Node as `--max-old-space-size=-1`, and Node
 * reports the flag out of bounds, **exits 0**, and continues with a ~4.5 GB heap limit — above a
 * 3 GiB cgroup. The invalid value therefore produces a LARGER ceiling than the valid one, and
 * trades a catchable `FATAL ERROR: heap limit` for an uncatchable kernel OOM kill that leaves no
 * diagnostic at all.
 *
 * The signature is the reason this JSDoc is worth reading carefully. A `metadata.parse` hook does
 * NOT receive the value — it receives the env var's NAME and reads the value itself, which is what
 * lets it distinguish "unset" from "set to something invalid". The first draft of this parser was
 * written against the value signature and threw on every input including unset, which would have
 * failed boot for every deployment that never set the override.
 *
 * @param {String} envVarName The env var's NAME, not its value.
 * @param {Object} [options]
 * @param {Object} [options.env=process.env] Env source; injectable for tests.
 * @returns {Number|undefined} `undefined` when unset, so the leaf default applies.
 * @throws {TypeError} When the override is set but is not a positive integer.
 */
function parseSupervisedTaskHeapMb(envVarName, {env = process.env} = {}) {
    const rawValue = env[envVarName];

    // Unset returns undefined so the LEAF DEFAULT applies. Throwing here instead would fail boot on
    // every deployment that never set the override — the parse hook receives the env var NAME and
    // reads the value itself (see `parsePlaneIdEnv`, the sibling this follows).
    if (rawValue === undefined || rawValue === null || rawValue === '') return;

    const parsed = Number(rawValue);

    if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new TypeError(
            `configBase: ${envVarName}="${rawValue}" must be a positive integer (MiB). ` +
            'Refusing rather than falling back: a rejected ceiling lets Node continue with a heap larger than the container.'
        );
    }

    return parsed;
}

/**
 * @summary The extendable Tier-1 configuration BASE — every default leaf and formula of the Agent OS
 * config plane, carried by a non-singleton class so overlays inherit instead of copying.
 *
 * The overlay-drift root fix: `ai/config.mjs` overlays subclass this base and carry DELTA-ONLY
 * `data`, which `Neo.setupClass`'s descriptor-driven hierarchical merge (the `merge: 'deep'`
 * descriptor on the Provider's `data_`) deep-merges over these defaults — a leaf added here reaches
 * every subclass overlay with zero overlay edits. Snapshot-style overlays (full template copies)
 * keep working unchanged: they never import this module and self-register their own singleton.
 *
 * This module has ZERO instantiation side effects — `Neo.setupClass` registers the class only
 * (non-singleton). The eager `Neo.ai.Config` singleton lives in `ai/config.template.mjs`, whose
 * side-effect import the Tier-2 server templates rely on for `getParent` registry resolution.
 *
 * @class Neo.ai.ConfigBase
 * @extends Neo.ai.ConfigProvider
 */
class ConfigBase extends ConfigProvider {
    static config = {
        /**
         * @member {String} className='Neo.ai.ConfigBase'
         * @protected
         */
        className: 'Neo.ai.ConfigBase',
        /**
         * Top-level meta-leaf configuration tree (Tier 1).
         * Defines the core immutable plain-data structures applied universally across all AI/MCP infrastructure.
         * Each leaf owns a `default` plus optional `env` (variable name) and `type` (selecting the env decoder + validator).
         * @member {Object} data
         */
        data: {
            neoRootDir : leaf(neoRootDir),
            projectRoot: leaf(projectRoot),
            /**
             * The declared plane-identity subtree — the first-class object the data-root
             * placement election decides placement FOR. These leaves declare FROM
             * `ai/planeConfig.mjs`, which must never grow an env read or a resolver of its own:
             * env binding belongs to the leaf, alone. A second resolution path beside the leaf
             * is precisely what the retired shape was — two resolvers for one value, free to
             * disagree — and it was removed, not shrunk: the exported defaults map and env-name
             * map are both gone, and the one surviving constant crosses the boundary only
             * because the boot coherence assertion must compare against the same literal this
             * leaf declares. Growing that surface back re-creates the drift channel.
             * Three concepts, never conflated: `id` is opaque identity (no path/checkout content);
             * `dataRoot` is the resolved evidence every plane-member leaf derives from;
             * `NEO_AI_CANONICAL_ROOT` (provisioning-time, `bootstrapWorktree.mjs`) names a
             * checkout and is deliberately NOT part of this subtree.
             * @member {Object} data.plane
             */
            plane: {
                /**
                 * Stable opaque plane identity. Overlays, cloud deployments, and ephemeral
                 * isolation planes (Option F overlays) override via env; equality of `planeId`
                 * is the ONLY sanctioned "same plane?" predicate — never path comparison.
                 * The env layer routes through `parsePlaneIdEnv`, carried on this leaf's own
                 * `parse` hook, so a path-shaped override fails loud at boot — the opacity
                 * invariant holds on RESOLVED values, not only on the frozen default the load
                 * guard covers.
                 * @type {string}
                 */
                id: leaf(CANONICAL_PLANE_ID, 'NEO_PLANE_ID', 'string', {parse: parsePlaneIdEnv}),
                /**
                 * The durable data root this process resolved for the declared plane — the single
                 * anchor plane-member leaves derive from via `path.join`-style derivations, each
                 * member keeping its own env escape.
                 * @type {string}
                 */
                dataRoot: leaf(planeDataRootDefault, 'NEO_PLANE_DATA_ROOT', 'string', {planeMember: false, planeMemberReason: 'the anchor itself — members derive from it; it is not its own member'})
            },
            /**
             * Turn-end stop-hook policy — two INDEPENDENT axes that were previously welded to one
             * all-or-nothing enforcement flag (`NEO_LANE_STATE_ENFORCE`), so switching off the
             * expensive apparatus also switched off the cheap, effective mirror.
             *
             * The turn-end hooks are thread-entrypoints: they bootstrap `Neo` + `core/_export` and
             * read these leaves at the use site, so these stay plain declarative leaves with no
             * companion defaults module. Measured: bootstrap plus resolve is ~50ms against the hook's
             * 10s budget, so the extra indirection would buy nothing.
             * @member {Object} data.stopHook
             */
            stopHook: {
                /**
                 * Reflect helpful-assistant register slips ("would you like me to…?") back as the
                 * equal-peer reminder. One injected paragraph, no forced continuation behind it —
                 * cheap, and the part that empirically earns its cost.
                 * @type {boolean}
                 */
                deferenceMirror: leaf(true, 'NEO_STOP_HOOK_DEFERENCE_MIRROR', 'boolean'),
                /**
                 * The no-hold forced-continuation apparatus: refusing turn-ends, the lane-state JSON
                 * terminal contract, the drive-ratchet, the clean-terminal / material-artifact
                 * acceptance edges, and the injected lifecycle directive.
                 *
                 * Defaults OFF (operator-directed, 2026-07-25). Measured over a 26h window:
                 * ONE refusal spawns a median-20-message continuation chain (mean 34.4, p90 78,
                 * max 239) costing ~1.79M full-rate-equivalent tokens, because every message re-reads
                 * a context that is deep precisely because the session is late — 30.1% of all billed
                 * volume. This is an L3_No_Hold_State teeth change and therefore Tier-4 authority:
                 * operator/deployment-owned, never self-licensable by an agent mid-turn.
                 * @type {boolean}
                 */
                laneContinuation: leaf(false, 'NEO_STOP_HOOK_LANE_CONTINUATION', 'boolean'),
                /**
                 * Optional typed live-lane-awareness projection consumed by Claude/Codex Stop
                 * entrypoints. The path and categorical attestation are injected by the trusted
                 * seat boot boundary; the hook reader never derives them from cwd, session, title,
                 * or raw filesystem paths. Until all six attestation leaves are present the reader
                 * returns no enrichment and the existing bare hook policy is byte-for-byte
                 * unchanged.
                 *
                 * Row and byte caps live HERE rather than in the pure reader. This makes density an
                 * operator/config decision and prevents a primitive-local fallback from silently
                 * diverging across harnesses.
                 * @member {Object} data.stopHook.projection
                 */
                projection: {
                    /**
                     * Trusted absolute path to this seat's published `current.json`.
                     * @type {String|null}
                     */
                    path: leaf(null, 'NEO_HOOK_PROJECTION_PATH', 'string'),
                    /**
                     * Server-derived target id expected inside `publication.targetId`.
                     * @type {String|null}
                     */
                    targetId: leaf(null, 'NEO_HOOK_PROJECTION_TARGET_ID', 'string'),
                    /**
                     * Fixed capability carried by the typed live-lane projection contract.
                     * @type {String}
                     */
                    capability: leaf('self-awareness', null, 'string'),
                    /**
                     * Canonical seat identity. Reuses the established process-lifetime identity
                     * injection; the reader only canonicalizes `@` form and never infers identity.
                     * @type {String|null}
                     */
                    agentId: leaf(null, 'NEO_AGENT_IDENTITY', 'string'),
                    /**
                     * Categorical harness family attested by the seat launcher.
                     * @type {String|null}
                     */
                    harnessType: leaf(null, 'NEO_HOOK_PROJECTION_HARNESS_TYPE', 'string'),
                    /**
                     * Opaque instance category digest; raw user-data paths never enter the file.
                     * @type {String|null}
                     */
                    instanceKeyDigest: leaf(null, 'NEO_HOOK_PROJECTION_INSTANCE_KEY_DIGEST', 'string'),
                    /**
                     * Opaque workspace category digest; raw checkout paths never enter the file.
                     * @type {String|null}
                     */
                    workspaceKeyDigest: leaf(null, 'NEO_HOOK_PROJECTION_WORKSPACE_KEY_DIGEST', 'string'),
                    /**
                     * Maximum logical lifecycle/route/context rows rendered into one hook message.
                     * @type {Number}
                     */
                    maxRows: leaf(12, 'NEO_HOOK_PROJECTION_MAX_ROWS', 'number'),
                    /**
                     * Maximum UTF-8 bytes of projection enrichment rendered into one hook message.
                     * @type {Number}
                     */
                    maxBytes: leaf(4096, 'NEO_HOOK_PROJECTION_MAX_BYTES', 'number')
                }
            },
            /**
             * The current in-flight release version whose milestone / epic work counts as "current
             * release focus" for the Golden Path emitter. Set at cut-prep, advanced by
             * `buildScripts/release/publish.mjs` at release — so a shipped release never lingers as
             * current focus (the release-gate-blind class). Consumers read it at the use site; never
             * a hardcoded release literal.
             * @type {string}
             */
            currentReleaseVersion: leaf('v13.2', 'NEO_CURRENT_RELEASE', 'string'),
            /**
             * Universal JSONL backup/export directory for Agent OS databases.
             *
             * Deliberately NOT plane-anchored, and that is the fix rather than a workaround for the
             * boot walk. A backup exists to survive the plane, so a plane-anchored default resolved
             * it inside a git working tree: `git clean -x` reaches it because `.neo-ai-data` is
             * (correctly) gitignored and `clean -x` is defined as removing ignored files. That
             * deletion vector is what this classification removes.
             *
             * Scope, stated precisely because the neighbouring risk is easy to over-claim: this
             * makes the default CHECKOUT-INDEPENDENT — it is no longer derived from the repository
             * location. It does NOT guarantee a different physical filesystem from the graph, and
             * an explicit override may still place bundles anywhere, including back under a
             * checkout. Separating backup and graph FAILURE DOMAINS is a distinct, latent concern
             * owned elsewhere and is not addressed here.
             *
             * Each deployment profile binds the leaf explicitly — the same profile-pinned shape as
             * `orchestrator.tenantRepoMirrorRoot`. Container profiles MUST place it: the previous
             * agreement between this default and the Compose bind was a coincidence of both deriving
             * from the plane root, not a contract.
             * @type {string}
             */
            backupPath: leaf(path.resolve(os.homedir(), '.neo-ai', 'backups'), 'NEO_BACKUP_PATH', 'string', {planeMember: false, planeMemberReason: 'escape hatch, not a member — a plane-anchored default resolves the backup root inside the checkout, where ordinary repository operations delete it; every profile binds it explicitly'}),
            /**
             * Path to the wake-daemon liveness sentinel touched on every swarm-heartbeat
             * pulse. Operators / tests can isolate the path via `NEO_HEARTBEAT_ALIVE_PATH`.
             * @type {string}
             */
            wakeDaemonHeartbeatAlivePath: leaf(path.resolve(planeDataRootDefault, 'wake-daemon/heartbeat.alive'), 'NEO_HEARTBEAT_ALIVE_PATH', 'string', {planeMember: true}),
            /**
             * Fleet Manager supervision leaves: where per-agent harness instance homes live and
             * which binary each harness family launches. The lifecycle service reads these at the
             * use site (`FleetLifecycleService.getInstanceRoot` / `getHarnessBinaryPath`) — the
             * SSOT owning default + env binding; the service holds no default shadow.
             */
            fleet: {
                /**
                 * @summary Fleet-owned durable root for registry, tenant, encryption-key, and
                 * signing-key material. The root is one plane member so every storage owner reads
                 * the same resolved coordinate and container profiles can place one named volume.
                 * @type {string}
                 */
                dataDir        : leaf(path.resolve(planeDataRootDefault, 'fleet'), 'NEO_FLEET_DATA_DIR', 'string', {planeMember: true}),
                /**
                 * Absolute root under which per-agent isolated harness config/state homes
                 * (`CODEX_HOME` / `CLAUDE_CONFIG_DIR`) are derived — the sibling of the managed
                 * checkouts root.
                 * @type {string}
                 */
                instanceRoot   : leaf(path.resolve(planeDataRootDefault, 'fleet/instances'), 'NEO_FLEET_INSTANCE_ROOT', 'string', {planeMember: true}),
                /**
                 * Canonical base of the containerized Agent OS plane the Fleet server's mailbox,
                 * compose, and catch-up seams consume (`<base>/mc/mcp` is derived — the
                 * connected-tenant resource contract). EMPTY means in-process binding: correct for machines without
                 * the container stack; the dockerized canonical machine activates plane mode via
                 * its operator overlay or env (e.g. `http://127.0.0.1:3102`). Not a plane member —
                 * this is host-edge consumer config, not a data-root path.
                 * @type {string}
                 */
                planeBase: leaf('', 'NEO_FLEET_PLANE_BASE', 'string'),
                /**
                 * Bearer credential for the plane's MCP resources. The plane resolves this to its
                 * canonical subject, and the Fleet entry refuses plane mode unless that subject IS
                 * the boot-resolved viewer (the single-viewer invariant). Empty is accepted
                 * only by planes that admit tokenless callers; admission failure degrades honestly.
                 * @type {string}
                 */
                planeBearer    : leaf('', 'NEO_FLEET_PLANE_BEARER', 'string'),
                /**
                 * Exact hostnames this deployment vouches for as confidential internal hops for
                 * plain-HTTP MC dialing (compose-network service DNS, e.g. `ingress`). Forwarded
                 * to the shared secure-endpoint policy, whose loopback-or-TLS rule stays
                 * unchanged when this is empty — an unnamed internal host remains refused, and
                 * the credential requirement is untouched on every path. CSV-typed like
                 * `cockpitOrigins`.
                 * @type {string[]}
                 */
                planeInternalHosts: leaf([], 'NEO_FLEET_PLANE_INTERNAL_HOSTS', 'csv'),
                /**
                 * Absolute path of a file holding the plane bearer — the secret-file
                 * indirection for containerized profiles, where the canonical composition
                 * already mounts its admission token as a compose secret and env literals are
                 * the wrong custody class for credentials. `planeBearer` (the direct value)
                 * wins when both are set; empty means no file indirection. Read at the use
                 * site by the Fleet entry, never at import.
                 * @type {string}
                 */
                planeBearerFile: leaf('', 'NEO_FLEET_PLANE_BEARER_FILE', 'string'),
                /**
                 * Bearer credential for the PLANE'S FLEET SURFACE (`/fleet`, `/fleet/probe`,
                 * `/fleet/events`) when this process consumes a containerized plane as a fleet
                 * client — a DIFFERENT MINT from `planeBearer`, which serves the plane's MCP
                 * resources. The two audiences can share a verifier, so only distinct mints keep
                 * the credential classes apart: the Fleet entry refuses a value whose bytes alias
                 * either `planeBearer` or the bootstrap admission token. Empty means the
                 * deployment declares no fleet-surface credential; plane-stream consumers then
                 * stay honestly unarmed with that reason instead of dialing with the wrong class.
                 * @type {string}
                 */
                planeAdmissionBearer: leaf('', 'NEO_FLEET_PLANE_ADMISSION_BEARER', 'string'),
                /**
                 * Secret-file indirection for `planeAdmissionBearer` — the same custody split as
                 * `planeBearerFile`: the direct value wins when both are set, empty means no file
                 * indirection, and the Fleet entry reads it at the use site, never at import.
                 * @type {string}
                 */
                planeAdmissionBearerFile: leaf('', 'NEO_FLEET_PLANE_ADMISSION_BEARER_FILE', 'string'),
                /**
                 * Absolute path of the deployment's bootstrap/healthcheck admission token file
                 * — bound to the SAME env name the MCP services already boot on (the
                 * `wakeReceiverManifestPath` same-env-name precedent), so the Fleet entry can
                 * enforce the credential-class non-alias rule with teeth: the plane bearer
                 * (class 3) must never BE the admission/bootstrap token, and a deployment that
                 * aliases them refuses to boot. Read-only comparison target; empty disables
                 * the check, never the rule.
                 * @type {string}
                 */
                admissionTokenFile: leaf('', 'NEO_MCP_HEALTHCHECK_TOKEN_FILE', 'string'),
                /**
                 * Bearer credential for the app<->fleet TRANSPORT — a different credential from
                 * `planeBearer`, which authenticates to the containerized plane. Secret-class, so
                 * the default is empty and never carries a value: `resolveFleetBearer` generates
                 * an ephemeral one when this is unset, which is the correct posture for a local
                 * dev transport. Declared rather than read from env at the use site so the two
                 * bearers cannot be conflated by a reader who finds only one of them in config.
                 * @type {string}
                 */
                bearer         : leaf('', 'NEO_FLEET_BEARER', 'string'),
                /**
                 * Arms the transport's browser bearer-handshake redemption (`GET /fleet/handshake`):
                 * while armed, an exact-allowlisted cockpit ORIGIN may fetch the process bearer once
                 * per page boot, which is how the one-command flow (`npm run cockpit`) hands the
                 * secret to a plain browser page with no agent in the loop. Default OFF — a
                 * standalone `npm run ai:fleet-server` exposes zero new surface; the cockpit
                 * launcher arms it in the fleet child's env because arming is a custody decision
                 * and custody lives with the launcher (`buildScripts/devCockpit.mjs`). While armed,
                 * browser-caller authentication deliberately collapses to the exact-Origin policy —
                 * the documented Option-B dev-mode widening, never the packaged product path.
                 * @type {boolean}
                 */
                bearerHandshake: leaf(false, 'NEO_FLEET_BEARER_HANDSHAKE', 'boolean'),
                /**
                 * Exact origins the Fleet Manager cockpit may call browser-facing Agent OS HTTP
                 * transports from. The legacy local Fleet bridge and the composed KB/MC/Fleet CORS
                 * boundary consume the same resolved array. CSV-typed: the env form is a
                 * comma-separated list, the resolved form is an array, so no consumer splits or
                 * trims a string of its own.
                 * @type {string[]}
                 */
                cockpitOrigins : leaf(['http://localhost:8080', 'http://127.0.0.1:8080'], 'NEO_FLEET_COCKPIT_ORIGIN', 'csv'),
                /**
                 * Port the Fleet transport listens on. Must match the URL the App Worker's cockpit
                 * dials; resolved at boot rather than captured at import so an overlay applied
                 * after module load is still honoured.
                 *
                 * `'port'`, not `'number'`: the domain parser rejects anything outside 1..65535 and
                 * falls back to the default. `'number'` would admit **0**, which binds an EPHEMERAL
                 * port — the listener comes up on a random port and the cockpit's fixed URL reaches
                 * nothing — plus negatives, fractions and 70000. The prior inline
                 * `Number(env) || 8083` caught 0 by accident, via falsiness; this catches it by rule,
                 * and catches the cases falsiness never did.
                 * @type {number}
                 */
                port           : leaf(8083, 'NEO_FLEET_PORT', 'port'),
                /**
                 * Absolute path of the signed host wake receiver's published 0600 route manifest —
                 * the seat-arming read coordinate for the fleet wake-routes axis. ONE deployment
                 * declaration drives every consumer: the local runbook exports
                 * `NEO_WAKE_RECEIVER_MANIFEST` and materializes the receiver's launchd plist from
                 * it, and this leaf binds the SAME env name, so the fleet server observes the
                 * coordinate the receiver actually boots on. EMPTY means the deployment declares
                 * no local wake lane; the arming axis then stays typed-unobserved instead of
                 * guessing a path. Not a plane member — host-edge consumer config pointing at the
                 * operator-materialized receiver root, exactly like `planeBase`.
                 * @type {string}
                 */
                wakeReceiverManifestPath: leaf('', 'NEO_WAKE_RECEIVER_MANIFEST', 'string'),
                /**
                 * Externally-dialable base URL of THIS fleet server's own signed wake receiver —
                 * the address the plane's Shape-B dispatcher (`WebhookDeliveryService`) POSTs
                 * digests to (`<base>/wake` is derived at the use site). In the composed profile
                 * this is the service-DNS origin (e.g. `http://fleet-server:8083`), reachable from
                 * the Memory Core container by construction. EMPTY means the deployment declares
                 * no dialable self-address: relay wake subscriptions are then NOT armed and the
                 * SSE push lane renders its absence with that reason — never a guessed default,
                 * because a wrong self-address turns every wake into a signed POST at a stranger.
                 * Not a plane member — deployment-edge consumer config, exactly like `planeBase`.
                 * @type {string}
                 */
                wakeSelfBase: leaf('', 'NEO_FLEET_WAKE_SELF_BASE', 'string'),
                /**
                 * Patience for ONE tenant-plane probe request (initialize, the initialized
                 * notification, the identity proof) — a single declared bound replacing per-site
                 * literals, env-relocatable. Calibrated from MEASURED plane latency, both modes:
                 * healthy establish+prove answers in well under a second (measured 41-397ms,
                 * 2026-08-02, post-rebuild), while the loaded-window receipts put `initialize`
                 * at ~17s under WAL/embed load — the prior 10s literals read exactly those
                 * healthy-but-loaded windows as degraded, a fabrication class, not caution.
                 * 30s covers the measured loaded tail with margin while keeping boot-path
                 * failure detection bounded; a wedged plane failing this probe after 30s is the
                 * honest outcome, not the defect. Milliseconds.
                 * @type {number}
                 */
                tenantProbeTimeoutMs: leaf(30000, 'NEO_FLEET_TENANT_PROBE_TIMEOUT_MS', 'number'),
                harnessBinaries     : {
                    /**
                     * The antigravity harness binary — the app-bundle MAIN binary (a directly
                     * spawnable, supervisable child), never an `open -n` launcher. macOS default;
                     * other hosts pin this leaf.
                     * @type {string}
                     */
                    antigravity: leaf('/Applications/Antigravity.app/Contents/MacOS/Antigravity', 'NEO_FLEET_ANTIGRAVITY_BIN', 'string'),
                    /**
                     * The claude-code harness binary — PATH-resolved by default.
                     * @type {string}
                     */
                    claudeCode: leaf('claude', 'NEO_FLEET_CLAUDE_CODE_BIN', 'string'),
                    /**
                     * The claude-desktop harness binary — the app-bundle MAIN binary (a directly
                     * spawnable, supervisable child), never an `open -n` launcher. macOS default;
                     * other hosts pin this leaf.
                     * @type {string}
                     */
                    claudeDesktop: leaf('/Applications/Claude.app/Contents/MacOS/Claude', 'NEO_FLEET_CLAUDE_DESKTOP_BIN', 'string'),
                    /**
                     * The Kimi Code CLI — PATH-resolved by default.
                     * @type {string}
                     */
                    kimiCode: leaf('kimi', 'NEO_FLEET_KIMI_CODE_BIN', 'string'),
                    /**
                     * The OpenCode CLI — PATH-resolved by default. The macOS desktop app is not a
                     * CLI substitute; hosts with only the app bundle fail the preflight by design.
                     * @type {string}
                     */
                    openCode: leaf('opencode', 'NEO_FLEET_OPENCODE_BIN', 'string'),
                    /**
                     * The codex harness binary. The default is the ChatGPT-app-bundled CLI — an
                     * alpha channel that self-updates with its app; production fleets pin this
                     * leaf, and the lifecycle status's `binaryVersion` surfaces what actually ran.
                     * @type {string}
                     */
                    codex: leaf('/Applications/ChatGPT.app/Contents/Resources/codex', 'NEO_FLEET_CODEX_BIN', 'string'),
                    /**
                     * The Codex Desktop packaged MAIN binary — directly spawnable and supervised.
                     * Its private app-profile/project/updater capabilities are probed from the
                     * installed bundle before every first spawn; this leaf only owns executable
                     * location, never compatibility policy.
                     * @type {string}
                     */
                    codexDesktop: leaf('/Applications/ChatGPT.app/Contents/MacOS/ChatGPT', 'NEO_FLEET_CODEX_DESKTOP_BIN', 'string')
                }
            },
            /**
             * Global debug flag for all AI processes.
             * @type {boolean}
             */
            debug: leaf(false, 'NEO_DEBUG', 'boolean'),
            /**
             * Server transport protocol. Supported values are exactly `stdio` and `streamable-http`.
             * @type {string}
             */
            transport: leaf('stdio', 'NEO_TRANSPORT', 'string'),
            /**
             * Optional public canonical URL.
             * @type {string|null}
             */
            publicUrl: leaf(null, 'NEO_PUBLIC_URL', 'url'),
            /**
             * Comma-separated extra hostnames added to the MCP transport's Host-header allowlist
             * (the SDK's DNS-rebinding protection). localhost/127.0.0.1/[::1] and the `publicUrl`
             * hostname are always allowed; set this for multi-hostname deployments or where the
             * client `Host` differs from `publicUrl`. Empty/null → only the implicit localhost +
             * publicUrl hosts. Consumed by TransportService.computeAllowedHosts.
             * @type {string|null}
             */
            allowedHosts: leaf(null, 'NEO_MCP_ALLOWED_HOSTS', 'string'),
            /**
             * Hostname (or full `protocol://host` URL) the Streamable HTTP transport advertises when
             * `publicUrl` is unset. Bare hostnames infer their protocol by convention (http for
             * localhost/127.0.0.1, https otherwise); values containing '://' are parsed verbatim.
             * Bound to the platform-standard `HOST` env var. Consumed by TransportService.setup.
             * @type {string}
             */
            mcpHttpHost: leaf('localhost', 'HOST', 'string'),
            /**
             * @summary Optional actual listener bind for the Streamable HTTP transport.
             *
             * When absent, the
             * existing `app.listen(port)` behavior is preserved. Local-bearer mode requires the
             * literal IPv4 loopback address `127.0.0.1`; advertised-host behavior remains owned by
             * `mcpHttpHost` / `publicUrl`.
             * @type {string|null}
             */
            mcpListenHost: leaf(null, 'NEO_MCP_LISTEN_HOST', 'string'),
            /**
             * Port the MCP server's Streamable HTTP transport listens on.
             * Sub-servers will typically override this with their own defaultPort.
             * @type {number}
             */
            mcpHttpPort: leaf(3000, 'MCP_HTTP_PORT', 'port'),
            /**
             * Optional Express middleware function for authentication.
             * @type {Function|null}
             */
            authMiddleware: leaf(null),
            /**
             * Base authentication configuration for the Streamable HTTP transport.
             *
             * `mode` selects the authorization strategy:
             * - `'oidc'` (default, production): OAuth 2.1 / OIDC bearer tokens validated via
             *   RFC 7662 introspection, with `aud` audience enforcement and Protected-Resource-
             *   Metadata advertisement.
             * - `'gitlab-pat'`: a GitLab Personal Access Token (`read_user` scope) presented as the
             *   bearer token, validated against `{gitlabApiBaseUrl}/api/v4/user`. No `aud` claim and
             *   no PRM advertisement (a naked `401` on failure) — the lighter path for clients that
             *   authenticate with a long-lived PAT from an env var instead of an OAuth dance.
             * - `'github-pat'`: a GitHub Personal Access Token (classic or fine-grained) presented
             *   as the bearer token, validated against `{githubApiBaseUrl}/user`. Same naked-401
             *   contract as `'gitlab-pat'`; the resolved GitHub login becomes the caller identity.
             * - `'local-bearer'`: a generated process-lifetime possession credential for an
             *   explicitly loopback-bound listener. It performs no identity lookup or provisioning.
             * @type {Object}
             */
            auth: {
                host              : leaf(null, 'NEO_AUTH_HOST', 'string'),
                port              : leaf(8080, 'NEO_AUTH_PORT', 'port'),
                realm             : leaf('master', 'NEO_AUTH_REALM', 'string'),
                issuerUrl         : leaf(null, 'NEO_AUTH_ISSUER_URL', 'string'),
                clientId          : leaf(null, 'NEO_OAUTH_CLIENT_ID', 'string'),
                clientSecret      : leaf('', 'NEO_OAUTH_CLIENT_SECRET', 'string'),
                trustProxyIdentity: leaf(false, 'NEO_AUTH_TRUST_PROXY_IDENTITY', 'boolean'),
                // Authorization strategy selector: 'oidc' (default) | 'gitlab-pat' | 'github-pat' | 'local-bearer' | 'seat-token'.
                mode              : leaf('oidc', 'NEO_AUTH_MODE', 'string'),
                /**
                 * @summary Seat-token registry path for 'seat-token' mode — the mint-side artifact
                 * the auth verifier reads (hash-only rows binding tokens to `AgentIdentity`
                 * subjects, plane-scoped, generation-invalidated by regeneration).
                 *
                 * A PLANE MEMBER: the default derives from the plane anchor and the path is
                 * claimed in `PLANE_MEMBER_PATHS`, so a relocated plane without an explicitly
                 * placed registry fails the boot-time member-coherence clause.
                 * @type {String}
                 */
                seatTokenRegistryPath: leaf(path.resolve(planeDataRootDefault, 'seat-tokens/registry.json'), 'NEO_AUTH_SEAT_TOKEN_REGISTRY_PATH', 'string', {planeMember: true,
                    requiredFor: [{
                        entrypoints   : '*',
                        modes         : ['seat-token'],
                        consumerClaims: ['readiness'],
                        reason        : 'Seat-token verification cannot certify readiness without a registry path.'
                    }]
                }),
                /**
                 * @summary Disposable process-lifetime possession credential for local-bearer mode.
                 *
                 * Generate exactly 32 random bytes as canonical unpadded base64url. Never persist
                 * or log this value; process exit is the revocation boundary.
                 * @type {String}
                 */
                localBearerToken  : leaf('', 'NEO_AUTH_LOCAL_BEARER_TOKEN', 'string', {
                    requiredFor: [{
                        entrypoints   : '*',
                        modes         : ['local-bearer'],
                        consumerClaims: ['readiness'],
                        reason        : 'Local-bearer readiness requires a process-lifetime possession credential.'
                    }]
                }),
                // GitLab API base URL used by 'gitlab-pat' mode for token validation (self-managed configurable).
                gitlabApiBaseUrl  : leaf('https://gitlab.com', 'NEO_AUTH_GITLAB_API_BASE_URL', 'string', {
                    requiredFor: [{
                        entrypoints   : '*',
                        modes         : ['gitlab-pat'],
                        consumerClaims: ['readiness'],
                        reason        : 'PAT validation cannot certify readiness without a GitLab API base URL.'
                    }]
                }),
                // GitHub API base URL used by 'github-pat' mode for token validation (GHES configurable).
                githubApiBaseUrl  : leaf('https://api.github.com', 'NEO_AUTH_GITHUB_API_BASE_URL', 'string', {
                    requiredFor: [{
                        entrypoints   : '*',
                        modes         : ['github-pat'],
                        consumerClaims: ['readiness'],
                        reason        : 'PAT validation cannot certify readiness without a GitHub API base URL.'
                    }]
                }),
                // Bounded TTL (seconds) for the per-token PAT validation cache → a revoked PAT clears within this window.
                patCacheTtlSeconds     : leaf(300, 'NEO_AUTH_PAT_CACHE_TTL_SECONDS', 'number'),
                // One wall-clock deadline for each cache-miss PAT validation sequence.
                patValidationTimeoutMs: leaf(5000, 'NEO_AUTH_PAT_VALIDATION_TIMEOUT_MS', 'number'),
                // How long a previously-validated token may still be served AFTER its TTL, and only
                // when the provider is UNREACHABLE (timeout, 5xx, network). An authoritative 401/403
                // never consults this. Without it, a third party being slow is indistinguishable from
                // a rejected credential, and every seat's turn-opening call inherits that risk.
                // `0` restores fail-closed-on-transport behaviour exactly.
                patStaleGraceSeconds  : leaf(3600, 'NEO_AUTH_PAT_STALE_GRACE_SECONDS', 'number'),
                // Optional GitLab OAuth app binding for 'gitlab-pat' mode. Empty means no app gate.
                allowedClientIds  : leaf([], 'NEO_AUTH_ALLOWED_CLIENT_IDS', 'csv'),
                // Optional username allowlist for PAT modes ('gitlab-pat' / 'github-pat'). Empty means any resolved user.
                allowedUsers      : leaf([], 'NEO_AUTH_ALLOWED_USERS', 'csv'),
                /**
                 * @summary Optional deployment override for the auth-mode-derived provider pin.
                 *
                 * Null preserves the safe mode default: GitHub-PAT pins the bootstrap provider
                 * subject, while auth modes without a provider bootstrap do not. A plural-resident
                 * GitHub-PAT plane explicitly sets this false; no Compose profile restates true.
                 * @type {Boolean|null}
                 */
                pinFirstProviderSubjectOverride: leaf(null, 'NEO_AUTH_PIN_FIRST_PROVIDER_SUBJECT', 'boolean'),
                /**
                 * @summary Effective first-provider-subject policy derived from `auth.mode`.
                 * @type {Boolean}
                 */
                pinFirstProviderSubject: leaf(false),
                /**
                 * @summary Bootstrap PAT used only when `pinFirstProviderSubject` is enabled.
                 *
                 * AuthService validates the credential against the configured provider before
                 * installing bearer middleware. This direct-value carrier is intended for
                 * non-Compose runtimes and is mutually exclusive with `providerBootstrapPatFile`;
                 * the raw value is never logged.
                 * @type {String}
                 */
                providerBootstrapPat: leaf('', 'NEO_AUTH_PROVIDER_BOOTSTRAP_PAT', 'string'),
                /**
                 * @summary File containing the bootstrap PAT for secret-file-aware runtimes.
                 *
                 * AuthService reads this resolved path once before installing bearer middleware.
                 * Canonical local Compose mounts one environment-backed Docker secret and shares
                 * its file reference with the authenticated health probe, so rendered Compose
                 * configuration never contains the credential.
                 * @type {String}
                 */
                providerBootstrapPatFile: leaf('', 'NEO_AUTH_PROVIDER_BOOTSTRAP_PAT_FILE', 'string'),
                /**
                 * @summary Optional deployment override for auth-mode-derived identity provisioning.
                 *
                 * Null derives the one provider provenance from `auth.mode`; an explicit empty CSV
                 * disables provisioning. This keeps selector and derived source in one config
                 * authority instead of requiring every deployment to repeat the obvious mapping.
                 * @type {String[]|null}
                 */
                autoProvisionIdentitySourcesOverride: leaf(null, 'NEO_AUTH_AUTO_PROVISION_IDENTITY_SOURCES', 'csv'),
                /**
                 * @summary Effective request-time identity-provisioning provenance.
                 * @type {String[]}
                 */
                autoProvisionIdentitySources: leaf([])
            },
            /**
             * @summary Deployment-wide chat / generation model provider.
             *
             * Tier-1 source of truth for model-consuming Agent OS lanes. Memory Core maps
             * this into its historical `modelProvider` key until runtime provider routing
             * converges on one canonical key. Supported values today: `gemini`,
             * `openAiCompatible`.
             * @type {String}
             */
            chatProvider: leaf('openAiCompatible', 'NEO_MODEL_PROVIDER', 'string'),
            /**
             * @summary Runtime alias for the active chat provider.
             *
             * Existing Memory Core consumers read `modelProvider`; keep the Tier-1
             * template aligned with `chatProvider` until provider routing converges on
             * one canonical key.
             * @type {String}
             */
            modelProvider: leaf('openAiCompatible', 'NEO_MODEL_PROVIDER', 'string'),
            /**
             * @summary Provider selector for Dream/Sandman graph-generation work.
             *
             * Graph extraction deliberately does not use the generic chat provider axis:
             * chat/summarization may use Gemini, while graph-generation dispatch only
             * supports native Ollama or OpenAI-compatible endpoints. Defaults to the
             * OpenAI-compatible graph route; set `NEO_GRAPH_PROVIDER=ollama` for
             * deployments that run graph extraction against native Ollama.
             * @type {'ollama'|'openAiCompatible'}
             */
            graphProvider: leaf('openAiCompatible', 'NEO_GRAPH_PROVIDER', 'string'),
            /**
             * @summary Deployment-wide embedding provider selector.
             *
             * Shared by Memory Core embedding consumers and Knowledge Base ingestion
             * paths.
             * @type {String}
             */
            embeddingProvider: leaf('openAiCompatible', 'NEO_EMBEDDING_PROVIDER', 'string'),
            /**
             * @summary Deployment-wide Ollama provider defaults.
             *
             * These are configuration defaults only. Native Ollama dispatch is enabled by
             * runtime provider adapters that explicitly select the `ollama` provider.
             * @type {Object}
             */
            ollama: {
                host          : leaf('http://127.0.0.1:11434', 'NEO_OLLAMA_HOST', 'string'),
                model         : leaf('gemma4:26b', 'NEO_OLLAMA_MODEL', 'string'),
                embeddingModel: leaf('qwen3-embedding', 'NEO_OLLAMA_EMBEDDING_MODEL', 'string'),
                keep_alive    : leaf(-1, 'NEO_OLLAMA_KEEP_ALIVE', 'keepAlive'),
                // Upper bound for one native Ollama embedding HTTP request. Keeps explicit
                // `embeddingProvider: 'ollama'` deployments from stalling the WAL drain.
                embeddingTimeoutMs   : leaf(300000, 'NEO_OLLAMA_EMBEDDING_TIMEOUT_MS', 'number'),
                requireParallelModels: leaf(2, 'NEO_OLLAMA_REQUIRE_PARALLEL_MODELS', 'number'),
                // How many native Ollama embedding requests this process may hold against the
                // provider at once. The openAiCompatible path has been serialized since its post
                // queue existed; this path had NO admission control at all, so its concurrency was
                // emergent from how many callers happened to exist.
                //
                // Scoped honestly: in-flight concurrency here was already near one per process,
                // because a whole batch goes out as a SINGLE /api/embed call with an array input.
                // So this bounds the multi-process and multi-caller case rather than a runaway
                // fan-out, and it does not by itself explain a saturated runner — a single request
                // can peg a container's whole CPU allowance on its own.
                //
                // Default 1 matches the openAiCompatible path's long-standing serialized behaviour
                // and deliberately serializes this path too. Deployments that can safely sustain more
                // concurrency can raise the declared number instead of inheriting caller fan-out.
                maxInFlightEmbeddings: leaf(1, 'NEO_OLLAMA_MAX_INFLIGHT_EMBEDDINGS', 'positiveInt')
            },
            /**
             * @summary Deployment-wide OpenAI-compatible provider defaults.
             *
             * Covers MLX, LM Studio, Ollama's OpenAI-compatible surface, llama.cpp, and
             * managed OpenAI-compatible endpoints.
             * @type {Object}
             */
            openAiCompatible: {
                host                   : leaf('http://127.0.0.1:11434', 'NEO_OPENAI_COMPATIBLE_HOST', 'string'),
                // gemma-4-26b-a4b MoE (~4B active): ~15× faster cold prefill than the dense gemma-4-31b-it
                // (3s vs ~47s on ~9k tok) at quality parity for summary + tri-vector extraction.
                // Exact LM Studio identifier — keep the 'google/' org prefix. No-think toggle:
                // localModels.chat.{summary,graph}ReasoningEffort. The ollama provider configures its own model.
                model                  : leaf('google/gemma-4-26b-a4b', 'NEO_OPENAI_COMPATIBLE_MODEL', 'string'),
                embeddingModel         : leaf('text-embedding-qwen3-embedding-8b', 'NEO_OPENAI_COMPATIBLE_EMBEDDING_MODEL', 'string'),
                apiKey                 : leaf('', 'NEO_OPENAI_COMPATIBLE_API_KEY', 'string'),
                unloadRetryCount       : leaf(3, 'NEO_OPENAI_COMPATIBLE_UNLOAD_RETRY_COUNT', 'number'),
                unloadRetryDelayMs     : leaf(500, 'NEO_OPENAI_COMPATIBLE_UNLOAD_RETRY_DELAY_MS', 'number'),
                contentionRetryCount   : leaf(2, 'NEO_OPENAI_COMPATIBLE_CONTENTION_RETRY_COUNT', 'number'),
                contentionRetryDelayMs : leaf(1000, 'NEO_OPENAI_COMPATIBLE_CONTENTION_RETRY_DELAY_MS', 'number'),
                contentionTimeoutMs    : leaf(15000, 'NEO_OPENAI_COMPATIBLE_CONTENTION_TIMEOUT_MS', 'number'),
                batchEmbeddingChunkSize: leaf(5, 'NEO_OPENAI_COMPATIBLE_BATCH_EMBEDDING_CHUNK_SIZE', 'number'),
                // Upper bound for one batch embedding HTTP request. Batch chunks can legitimately take
                // longer than interactive single embeddings, but must not hold the provider queue forever.
                batchEmbeddingTimeoutMs: leaf(300000, 'NEO_OPENAI_COMPATIBLE_BATCH_EMBEDDING_TIMEOUT_MS', 'number'),
                batchEmbeddingYieldMs  : leaf(0, 'NEO_OPENAI_COMPATIBLE_BATCH_EMBEDDING_YIELD_MS', 'number'),
                keep_alive             : leaf(-1, 'NEO_OPENAI_COMPATIBLE_KEEP_ALIVE', 'keepAlive'),
                requireParallelModels  : leaf(2, 'NEO_OPENAI_COMPATIBLE_REQUIRE_PARALLEL_MODELS', 'number')
            },
            /**
             * @summary Local-model role-keyed context limits.
             *
             * The context-window axis for local-inference consumers is **model-role**
             * (chat vs embedding), not provider-namespace. Remote providers (Gemini and
             * future API-only endpoints) are API-bound — operators have no control over
             * their context cap, so these knobs do not apply. Local providers
             * (`openAiCompatible`, `ollama`) share these caps regardless of which serves
             * the role, because the practical limit comes from the loaded model, not
             * from the provider transport.
             *
             * Consumers read by model-role:
             * - Chat-path consumers (graph extraction, session summary) → `localModels.chat.*`
             * - Embedding-path consumers (Memory Core embedding, KB ingestion) → `localModels.embedding.*`
             *
             * @type {Object}
             */
            localModels: {
                /**
                 * @summary Chat-model context limits in tokens — a WORKLOAD FLOOR, not a RAM-fit target.
                 *
                 * Default is 131072 — half of the 256K native context the deployment's chat models
                 * carry. The number was originally derived from `gemma-4-31b-it`; it is retained
                 * under `google/gemma-4-26b-a4b` because it is a WORKLOAD floor, not a per-model
                 * ceiling, so it does not move when the model does. This is a
                 * deliberate floor, NOT a value auto-shrunk to fit free host RAM: graph extraction
                 * (`SemanticGraphExtractor`, `TopologyInferenceEngine`) and session summaries
                 * (`SessionService`) read this via the AiConfig SSOT and degrade below ~half. The
                 * host is sized to load the model at this window (free co-resident RAM / raise the
                 * env), rather than the config shrinking the window to whatever RAM is spare — total
                 * system RAM does not predict a co-resident model's actual headroom.
                 * `ConsumerFrictionHelper.invokeWithGuardrail` uses these values to fire the upstream
                 * pre-check skip (emits `'context-overflow'` / `'size-precheck-skip'` friction) when
                 * composed input exceeds the safe-processing band.
                 *
                 * `safeProcessingLimitTokens` is the explicit ~76% headroom band (100000) — leaves
                 * ~31K tokens for system-prompt envelope + LLM response generation. Explicit value
                 * avoids implicit `0.75 × cap` derivation drift if the cap moves.
                 *
                 * Per-host tuning is the env override, not a host-RAM heuristic:
                 * `NEO_LOCAL_MODELS_CHAT_CONTEXT_LIMIT_TOKENS`,
                 * `NEO_LOCAL_MODELS_CHAT_SAFE_PROCESSING_LIMIT_TOKENS`.
                 *
                 * @type {Object}
                 */
                chat: {
                    contextLimitTokens       : leaf(131072, 'NEO_LOCAL_MODELS_CHAT_CONTEXT_LIMIT_TOKENS', 'number'),
                    safeProcessingLimitTokens: leaf(100000, 'NEO_LOCAL_MODELS_CHAT_SAFE_PROCESSING_LIMIT_TOKENS', 'number'),
                    // lms `--parallel` request-slot count for the chat model. Each slot holds an
                    // independent KV cache at contextLimitTokens, so the count MULTIPLIES the chat
                    // worker's resident RAM. Default 1: the chat roles (graph extraction / session
                    // summary / miniSummary) are lease-serialized, so concurrent demand is 1 and any
                    // slots beyond the first are idle KV bloat. PER-MODEL knob, distinct from
                    // requireParallelModels (how many DISTINCT models stay co-resident); both the chat
                    // and embedding models stay loaded regardless of this value.
                    parallel                 : leaf(1, 'NEO_LOCAL_MODELS_CHAT_PARALLEL', 'number'),
                    /**
                     * @summary Output-token budget for REM graph structured-output calls.
                     *
                     * Input chunking protects the prompt side; this caps the provider's JSON response
                     * side so an OpenAI-compatible or Ollama graph request cannot monopolize the chat
                     * model while the REM backlog waits for a response.
                     * @type {Number}
                     */
                    graphOutputLimitTokens   : leaf(8192, 'NEO_LOCAL_MODELS_CHAT_GRAPH_OUTPUT_LIMIT_TOKENS', 'number'),
                    /**
                     * @summary Prompt-token target for one REM Tri-Vector graph chunk.
                     *
                     * REM needs enough episodic context to infer useful graph structure, but this is an
                     * input-side bundle size, not the completion cap. `SemanticGraphExtractor` clamps the
                     * effective chunk budget to this leaf, `safeProcessingLimitTokens`, and
                     * `contextLimitTokens - graphOutputLimitTokens` before subtracting the prompt envelope.
                     * @type {Number}
                     */
                    graphChunkLimitTokens    : leaf(50000, 'NEO_LOCAL_MODELS_CHAT_GRAPH_CHUNK_LIMIT_TOKENS', 'number'),
                    /**
                     * @summary Per-task reasoning-effort for the chat model's two structured-output
                     * consumers — passed straight through as the OpenAI / LM-Studio `reasoning_effort`
                     * request param. Default `'none'` disables the gemma MoE's hidden "thinking" pass
                     * (~2× faster, zero measured quality loss for summary OR extraction).
                     * Kept per-task (not a single global) so a future hard-summary test can re-enable
                     * thinking for summaries alone (`'low'|'medium'|'high'`) without touching extraction.
                     * `SessionService.summarizeSession` reads `summaryReasoningEffort`;
                     * `SemanticGraphExtractor.executeTriVectorExtraction` reads `graphReasoningEffort`.
                     * @type {'none'|'low'|'medium'|'high'}
                     */
                    summaryReasoningEffort: leaf('none', 'NEO_LOCAL_MODELS_CHAT_SUMMARY_REASONING_EFFORT', 'string'),
                    graphReasoningEffort  : leaf('none', 'NEO_LOCAL_MODELS_CHAT_GRAPH_REASONING_EFFORT', 'string')
                },
                /**
                 * @summary Embedding-model context limits in tokens.
                 *
                 * Tuned for the default OpenAI-compatible embedding model
                 * `text-embedding-qwen3-embedding-8b`, whose upstream Qwen model card
                 * advertises a 32K context window. Operators serving smaller embedding
                 * models must pin this to the actual loaded-model capacity.
                 *
                 * `safeProcessingLimitTokens` is the explicit 28K operational band —
                 * large enough for file-scale KB / Memory Core ingestion while leaving a
                 * 4K-token margin below the advertised model maximum.
                 *
                 * Env overrides: `NEO_LOCAL_MODELS_EMBEDDING_CONTEXT_LIMIT_TOKENS`,
                 * `NEO_LOCAL_MODELS_EMBEDDING_SAFE_PROCESSING_LIMIT_TOKENS`,
                 * `NEO_LOCAL_MODELS_EMBEDDING_PARALLEL`.
                 *
                 * @type {Object}
                 */
                embedding: {
                    contextLimitTokens       : leaf(32768, 'NEO_LOCAL_MODELS_EMBEDDING_CONTEXT_LIMIT_TOKENS', 'number'),
                    safeProcessingLimitTokens: leaf(EMBEDDING_SAFE_PROCESSING_LIMIT_TOKENS, 'NEO_LOCAL_MODELS_EMBEDDING_SAFE_PROCESSING_LIMIT_TOKENS', 'positiveInt'),
                    // lms `--parallel` request-slot count for the embedding model. Same primitive as
                    // `localModels.chat.parallel`: each slot carries its own KV cache, so slot count
                    // multiplies resident RAM. Default 1 keeps the embedding role resident without
                    // letting the LM Studio default silently spend memory that can force chat/embedding
                    // role-set churn. Distinct from requireParallelModels (distinct model residency).
                    parallel                 : leaf(1, 'NEO_LOCAL_MODELS_EMBEDDING_PARALLEL', 'number')
                }
            },
            /**
             * @summary What THIS DEPLOYMENT declared its provider-lane shape to be — provenance, not
             * an operational value. Nothing reads these to configure anything; the boot shape check
             * reads them to answer "did the operator state an intent I can verify against?".
             *
             * **`null` is the load-bearing default: it means NOT DECLARED.** Every leaf here binds the
             * raw `NEO_PROVIDER_LANE_*` DECLARATION namespace, which a deployment sets only when it is
             * declaring an envelope. The `localModels.embedding.*` leaves above are the CONSUMPTION
             * namespace and are contractually never a comparison authority: they carry non-null
             * operational defaults (`parallel` is 1 for LM Studio residency, per its comment above), so
             * a plane that declares its shape to the engine alone would be compared against a default
             * it never chose — observing 4 slots against a defaulted 1 degrades a correctly-sized
             * deployment. Resolved-vs-declared is exactly the distinction those leaves cannot make.
             *
             * `positiveInt` rather than `number` is deliberate: an out-of-domain declaration (`0`, a
             * typo) returns `undefined` from the parser, so the `null` default stands and the value
             * reads as not-declared. With `number` a declared `0` would be a real declaration and would
             * degrade a healthy lane — a malformed declaration must fail toward silence, never toward
             * a verdict about a lane that is fine.
             *
             * Env overrides: `NEO_PROVIDER_LANE_EMBEDDING_SLOTS`,
             * `NEO_PROVIDER_LANE_EMBEDDING_CONTEXT_TOKENS_PER_SLOT_REQUIRED`.
             *
             * @type {Object}
             */
            providerLaneDeclaration: {
                embedding: {
                    parallelSlots       : leaf(null, 'NEO_PROVIDER_LANE_EMBEDDING_SLOTS', 'positiveInt'),
                    contextTokensPerSlot: leaf(null, 'NEO_PROVIDER_LANE_EMBEDDING_CONTEXT_TOKENS_PER_SLOT_REQUIRED', 'positiveInt')
                }
            },
            /**
             * Memory Core repair strategy controls that participate in durable accepted-loss fingerprints.
             *
             * `strategyVersion` must change whenever repair embeddability behavior changes in a way that can
             * make previously terminal residue recoverable (for example, truncation/chunking/re-embed policy).
             * Keeping it in AiConfig, not a maintenance-script export, preserves the Provider SSOT: consumers read
             * the resolved leaf at the use site, and local overlays/env can make the active fingerprint explicit.
             * @type {Object}
             */
            memoryRepair: {
                /**
                 * Accepted-loss fingerprint strategy version for Memory Core repair embeddability semantics.
                 * @type {string}
                 */
                strategyVersion: leaf('mc-repair-v1', 'NEO_MEMORY_REPAIR_STRATEGY_VERSION', 'string')
            },
            /**
             * @summary Deployment-wide Gemini model defaults.
             *
             * Memory Core still exposes these historical field names for Gemini-backed
             * summary and embedding paths; Tier-1 owns the default tuple.
             * @type {String}
             */
            modelName: leaf('gemini-3.5-flash'),
            /**
             * @summary Deployment-wide Gemini embedding model default.
             * @type {String}
             */
            embeddingModel: leaf('gemini-embedding-001'),
            /**
             * @summary Gemini API key (secret), sourced from the `GEMINI_API_KEY` env var via the leaf
             * (mirrors the OpenAI-compatible `apiKey` leaf). Read at the use site (`aiConfig.geminiApiKey`);
             * consumers must never read `process.env.GEMINI_API_KEY` directly.
             * @type {String}
             */
            geminiApiKey: leaf('', 'GEMINI_API_KEY', 'string'),
            /**
             * @summary Enforced vector dimension across shared vector collections.
             *
             * Hard-configured to prevent schema wipes when operators change embedding
             * providers. Gemini deployments must explicitly pair provider and dimension
             * overrides.
             * @type {Number}
             */
            vectorDimension: leaf(4096, 'NEO_VECTOR_DIMENSION', 'number'),
            /**
             * @summary Deployment-wide storage engine coordinates.
             *
             * `engines.chroma` is the unified production topology: ONE daemon, ONE persist dir,
             * shared by Knowledge Base + Memory Core. The active `host` / `port` / `dataDir` values are
             * formulas (below) that resolve production vs test-harness coordinates from the existing
             * `UNIT_TEST_MODE` toggle or the Playwright-only `NEO_TEST_CONFIG_TEMPLATES` boundary.
             * Tests therefore connect to a separate daemon and persist directory by construction; a
             * database-name swap alone is not isolation.
             * @type {Object}
             */
            engines: {
                chroma: {
                    // Env-bindable like its host/port siblings: a packaged harness ships the organism in a
                    // read-only(ish) resources dir and must move the persist dir to a per-user data root.
                    dataDirProd: leaf(path.resolve(planeDataRootDefault, 'chroma/unified'), 'NEO_CHROMA_DATA_DIR', 'string', {planeMember: true}),
                    dataDirTest: leaf(chromaUnitTestDataDir, 'NEO_CHROMA_DATA_DIR_TEST', 'string'),
                    hostProd   : leaf('localhost', 'NEO_CHROMA_HOST', 'string'),
                    hostTest   : leaf('localhost', 'NEO_CHROMA_HOST_TEST', 'string'),
                    portProd   : leaf(8000, 'NEO_CHROMA_PORT', 'port'),
                    portTest   : leaf(18180, 'NEO_CHROMA_PORT_TEST', 'port'),
                    /**
                     * Chroma database selection — four declarative leaves, all SSOT-inline (config.template
                     * imports no config values):
                     *   - `database`        — the production DB name (literal).
                     *   - `databaseTest`    — the dedicated, droppable unit-test DB name (literal).
                     *   - `useUnitTestDatabase` — the unit-run selector, resolved from `UNIT_TEST_MODE`.
                     *   - `useTestHarness`  — the all-Playwright selector, resolved from the resolver boundary.
                     * `useTestDatabase` is the effective formula composing both selectors.
                     * The consumer (`ChromaManager`) reads the resolved toggle and picks `databaseTest` when
                     * true, else `database`. Both NAMES live in config, so the test path needs no env var the
                     * runner must remember to set — `npx playwright` without `npm run test-unit` still toggles
                     * to the test DB and CANNOT bleed unit collections into production by construction.
                     * `ChromaManager` additionally fails loud if the resolved DB equals `database` while the
                     * effective selector is on (independent defense-in-depth). KB ChromaManager reads only host/port.
                     */
                    database           : leaf('default_database', 'NEO_CHROMA_DATABASE', 'string'),
                    databaseTest       : leaf('neo-unit-test', 'NEO_CHROMA_DATABASE_TEST', 'string'),
                    useUnitTestDatabase: leaf(false, 'UNIT_TEST_MODE', 'boolean'),
                    /**
                     * @summary Extends storage isolation to non-unit Playwright modes without claiming
                     * unit-test application semantics.
                     * @type {boolean}
                     */
                    useTestHarness : leaf(false, 'NEO_TEST_CONFIG_TEMPLATES', 'boolean')
                }
            },
            /**
             * Memory Core service tuning — timeouts, retry, graph-projection cadence, miniSummary.
             * All operator-tunable; consumers read `aiConfig.memoryService.*` at the use site.
             * @type {Object}
             */
            memoryService: {
                miniSummaryTimeoutMs           : leaf(30000, 'NEO_MC_MINI_SUMMARY_TIMEOUT_MS', 'number'),
                miniSummaryBackfillMaxRunMs    : leaf(600000, 'NEO_MC_MINI_SUMMARY_BACKFILL_MAX_RUN_MS', 'number'),
                miniSummaryBackfillFreshReserve: leaf(10, 'NEO_MC_MINI_SUMMARY_BACKFILL_FRESH_RESERVE', 'number'),
                miniSummaryMaxChars            : leaf(280, 'NEO_MC_MINI_SUMMARY_MAX_CHARS', 'number'),
                generateMiniSummaryTimeoutMs   : leaf(20000, 'NEO_MC_GENERATE_MINI_SUMMARY_TIMEOUT_MS', 'number'),
                /**
                 * Consecutive generation failures after which a row is reversibly archived instead of
                 * deferred again. Without a budget the backfill retries the same rows forever: a CPU-only
                 * deployment burned ~2.3 cores for days at `0 updated, 30 deferred` per pass, because the
                 * timeout is per-attempt and nothing counted attempts across passes. Mirrors
                 * `graphProjectionMaxAttempts`; the exit mirrors the loop's existing `no-content` archive.
                 */
                miniSummaryMaxAttempts        : leaf(5, 'NEO_MC_MINI_SUMMARY_MAX_ATTEMPTS', 'number'),
                chromaFetchTimeoutMs          : leaf(10000, 'NEO_MC_CHROMA_FETCH_TIMEOUT_MS', 'number'),
                graphProjectionMaxAttempts    : leaf(5, 'NEO_MC_GRAPH_PROJECTION_MAX_ATTEMPTS', 'number'),
                graphProjectionRetryBaseMs    : leaf(250, 'NEO_MC_GRAPH_PROJECTION_RETRY_BASE_MS', 'number'),
                graphProjectionRetryMaxMs     : leaf(5000, 'NEO_MC_GRAPH_PROJECTION_RETRY_MAX_MS', 'number'),
                graphProjectionDrainIntervalMs: leaf(60000, 'NEO_MC_GRAPH_PROJECTION_DRAIN_INTERVAL_MS', 'number')
            },
            /**
             * Temporal-pyramid durable aggregation lane (L1 session / L2 daily tiers).
             * @type {Object}
             */
            temporalSummary: {
                /**
                 * Master opt-in for the temporal-pyramid aggregation lane (an orchestrator-owned supervised
                 * one-shot child). Disabled by default; the one-shot child exits early when false.
                 * @type {Boolean}
                 */
                aggregationEnabled: leaf(false, 'NEO_MC_TEMPORAL_SUMMARY_ENABLED', 'boolean'),
                /**
                 * Orchestrator dispatch cadence in ms (default 1 h) — the interval the Orchestrator schedules the
                 * one-shot aggregation child at (NOT a self-poll loop). The lane runs under the shared
                 * heavy-maintenance lease, so it yields to REM / defrag siblings.
                 * @type {Number}
                 */
                aggregationIntervalMs: leaf(60 * 60 * 1000, 'NEO_MC_TEMPORAL_SUMMARY_INTERVAL_MS', 'number')
            },
            /**
             * Self-reported V8 heap observation — the one channel through which a Node service can
             * state its own heap/non-heap split.
             *
             * Declared at Tier-1 rather than under `orchestrator` because the writer and the reader are
             * different processes reading the SAME leaves: any Node service writes its observation here,
             * and the orchestrator's deployment-state bridge reads it. Nesting it under the reader would
             * make the writer thread a value it does not own, and duplicating it per server would put two
             * declarations behind one contract.
             *
             * `writeIntervalMs` is deliberately far tighter than the bridge's 30 s snapshot cadence.
             * Container memory on this deployment was measured moving ~93 MiB inside 45 s under ordinary
             * maintenance load, so an observation paired with a container reading taken 30 s later would
             * licence arithmetic across two different memory states. At a 10 s cadence and a 15 s skew
             * bound the pair carries roughly 30 MiB of uncertainty against a 768 MiB ceiling — stated
             * here because a bound whose implied error is unstated reads as precision it does not have.
             * @type {Object}
             */
            heapObservation: {
                enabled        : leaf(true, 'NEO_HEAP_OBSERVATION_ENABLED', 'boolean'),
                dir            : leaf(path.resolve(planeDataRootDefault, 'heap-observation'), 'NEO_HEAP_OBSERVATION_DIR', 'string', {planeMember: true}),
                writeIntervalMs: leaf(10 * 1000, 'NEO_HEAP_OBSERVATION_WRITE_INTERVAL_MS', 'number'),
                staleAfterMs   : leaf(60 * 1000, 'NEO_HEAP_OBSERVATION_STALE_AFTER_MS', 'number'),
                maxSkewMs      : leaf(15 * 1000, 'NEO_HEAP_OBSERVATION_MAX_SKEW_MS', 'number')
            },
            /**
             * Agent OS maintenance orchestrator configuration.
             * @type {Object}
             */
            orchestrator: {
                /**
                 * Directory owning ALL orchestrator-daemon runtime state: the daemon + child-task
                 * PID files, `orchestrator.log`, `orchestrator-state.json`, and the heavy-maintenance
                 * lease + tenant-repo-sync revision files stored beside them. Derives from the
                 * declared plane anchor (absolute) — the prior relative default resolved against
                 * the daemon's ambient cwd, which is exactly the per-process root ambiguity the
                 * plane subtree removes; cloud deployments keep overriding via env. Owning the
                 * default AND the `NEO_AI_ORCHESTRATOR_DIR` env binding here (instead of a
                 * module-level `process.env` read at the consumer) keeps the config-is-SSOT
                 * contract: no consumer re-derives from env, no consumer holds a hidden default.
                 * @type {String}
                 */
                dataDir: leaf(path.resolve(planeDataRootDefault, 'orchestrator-daemon'), 'NEO_AI_ORCHESTRATOR_DIR', 'string', {planeMember: true}),
                /**
                 * SQLite Memory Core graph database file the orchestrator opens for graph-backed
                 * health checks and maintenance decisions. Derives from the declared plane anchor
                 * (absolute) — the prior relative default resolved against the daemon's ambient
                 * cwd, the per-process root ambiguity the plane subtree removes; deployments keep
                 * overriding via env. Owning the default AND the `NEO_AI_DB_PATH` env binding here
                 * (instead of a module-level `process.env` read at the consumer) keeps the
                 * config-is-SSOT contract: no consumer re-derives from env, no consumer holds a
                 * hidden default.
                 * @type {String}
                 */
                dbPath: leaf(path.resolve(planeDataRootDefault, 'sqlite/memory-core-graph.sqlite'), 'NEO_AI_DB_PATH', 'string', {planeMember: true}),
                /**
                 * Deployment profile for Agent OS maintenance ownership.
                 * `cloud` is the canonical Agent OS posture and disables local-only maintenance
                 * lanes unless a host process explicitly opts into `local`.
                 * @type {'local'|'cloud'}
                 */
                deploymentMode: leaf('cloud', 'NEO_AI_DEPLOYMENT_MODE', 'string'),
                /**
                 * Orchestrator task-authority role. This is intentionally independent from
                 * `deploymentMode`: storage/deployment defaults cannot express which process owns
                 * host/session effects versus plane maintenance on the same machine.
                 *
                 * **There is no default: a role is declared, never inherited.** A default
                 * makes the ambiguous command the cheap one — a bare `npm run ai:orchestrator` on a
                 * host resolved `container-plane` and claimed the authority Docker already owns,
                 * with nothing in its name or output saying so. Every launcher now declares: Compose
                 * for both container profiles, `ai:host-edge` (via `hostEdgeProfile.mjs`) for the
                 * machine-local one, and the harness Brain profiles for the smoke and the packaged
                 * product. `legacy-mixed` exists only for rollback to a pre-cutover revision.
                 *
                 * The empty default is what ARMS `requiredFor`: requiredness is evaluated on the
                 * RESOLVED value, so any non-empty default would make the requirement permanently
                 * unfireable. Membership in the frozen enum is a separate gate — requiredness proves
                 * non-empty and typed, never that a value is a role — and `bootOrchestratorCli`
                 * runs both before any plane state is written.
                 * @type {''|'legacy-mixed'|'host-edge'|'container-plane'}
                 */
                /**
                 * Restart-churn detection thresholds.
                 *
                 * Under the config SSOT rather than a local default object: a threshold deciding
                 * whether a deployment reports degraded is deployment POLICY, and an operator whose
                 * plane legitimately restarts more often than ours cannot say so if the number lives
                 * in a frozen literal.
                 * @type {Object}
                 */
                restartChurn: {
                    /**
                     * Unplanned restarts within the window, on ONE container generation, before
                     * churn is reported. Three sits above ordinary transients — one restart is
                     * noise, two can be a slow dependency coming up — and far below a real loop,
                     * which reached 977 on the maintainer plane.
                     * @type {Number}
                     */
                    threshold: leaf(3, 'NEO_RESTART_CHURN_THRESHOLD', 'number'),
                    /**
                     * Window bounding the count to RECENT churn: a container that restarted
                     * repeatedly last month and has been stable since is not sick now.
                     * @type {Number}
                     */
                    windowMs: leaf(900000, 'NEO_RESTART_CHURN_WINDOW_MS', 'number'),
                    /**
                     * Severity carried by the emitted fact — declared rather than literal so a
                     * deployment can down-rank churn without patching the diagnosis service.
                     * @type {'critical'|'warning'}
                     */
                    severity: leaf('critical', 'NEO_RESTART_CHURN_SEVERITY', 'string')
                },
                authorityProfile: leaf('', 'NEO_AI_ORCHESTRATOR_AUTHORITY_PROFILE', 'string', {
                    requiredFor: [{
                        entrypoints: ['orchestrator-daemon'],
                        reason     : 'A role is declared, never inherited. Declare `container-plane` on the containerized Orchestrator (its Compose service sets it), or start the machine-local one with `npm run ai:host-edge`, which declares `host-edge` and its full posture.'
                    }]
                }),
                /**
                 * V8 old-space ceiling, in MiB, for each supervised child process.
                 *
                 * A container memory limit budgets a process TREE; a heap ceiling is PER PROCESS.
                 * Children are spawned with `{...process.env}`, so a ceiling carried at the service
                 * level is re-spent by every concurrent child rather than once. The inverse is why
                 * the container cannot be sized alone: with no explicit ceiling Node derives its
                 * default old-space from the cgroup, so raising the limit silently raises every
                 * unbounded child's implicit ceiling. Explicit-per-process is the only arrangement
                 * where the limit and the ceilings can be reasoned about together.
                 *
                 * The `parse` hook FAILS CLOSED on a non-positive or non-integer override. Without
                 * it, `-1` reaches Node, which reports the flag out of bounds, **exits 0**, and
                 * continues with a ~4.5 GB heap limit — above the cgroup, converting a catchable
                 * heap error into an uncatchable kernel OOM kill with no diagnostic.
                 *
                 * Sized with the orchestrator container limit and the parent ceiling as one decision
                 * — see `ai/deploy/docker-compose.yml`, the orchestrator `deploy.resources` block.
                 * Raising this alone overruns the container; raising the container alone lifts the
                 * implicit ceiling of any child that lacks an explicit one. Lowering it is an
                 * optimization gated on a plane that has run unbroken long enough to show a real
                 * steady-state maximum, not on the next incident: a crash loop wipes the logs that
                 * would diagnose it, so an under-provisioned ceiling destroys its own evidence.
                 * @type {Number}
                 */
                supervisedTaskHeapMb: leaf(1024, 'NEO_SUPERVISED_TASK_HEAP_MB', 'number', {
                    parse: parseSupervisedTaskHeapMb
                }),
                /**
                 * Filesystem root under which tenant-repo mirrors are stored. The
                 * `deriveTenantRepoMirrorPath` helper appends `tenant-repos/<tenant>/<repo>`,
                 * so this value names the PARENT of that directory — typically
                 * `/app/.neo-ai-data` in containerized cloud deployments. Per-repo
                 * `tenantRepos[].mirrorRoot` overrides this value when present; absent
                 * per-repo overrides fall back through this Tier-1 default. Env override:
                 * `NEO_TENANT_REPO_MIRROR_ROOT`.
                 * Deliberately NOT derived from the local plane anchor: this default names the
                 * canonical base/cloud profile's plane root (the lane is cloud-only), and
                 * re-anchoring the default locally would silently break containerized deployments.
                 * Relocated profiles bind this leaf explicitly; the dev parity profile does so in
                 * its shared `x-plane-env` map.
                 * @type {String}
                 */
                tenantRepoMirrorRoot: leaf('/app/.neo-ai-data', 'NEO_TENANT_REPO_MIRROR_ROOT', 'string', {planeMember: false, planeMemberReason: 'profile-pinned — canonical in base/cloud; relocated profiles bind explicitly (#15800)'}),
                /**
                 * Provider-readiness probe parameters consumed by the orchestrator dream task
                 * and the standalone Sandman CLI runner. The probe issues an HTTP GET against
                 * the resolved graph provider's `/api/tags` (Ollama) or `/v1/models`
                 * (OpenAI-compatible) endpoint, retrying `attempts` times with `delayMs`
                 * between retries, abandoning each probe after `timeoutMs`.
                 *
                 * Defaults are sized for a developer-laptop cold start (30 × 1s + 3s timeout
                 * per probe ≈ 2 min absolute ceiling). Cloud-deployment operators tune these
                 * via gitignored `ai/config.mjs` or the env vars below. Routine readiness
                 * consumers share a short model-discovery cache to avoid flooding user-facing
                 * provider logs; recovery and force-refresh diagnostics bypass it.
                 * @type {Object}
                 */
                providerReadiness: {
                    attempts         : leaf(30, 'NEO_ORCHESTRATOR_PROVIDER_READY_ATTEMPTS', 'number'),
                    delayMs          : leaf(1000, 'NEO_ORCHESTRATOR_PROVIDER_READY_DELAY_MS', 'number'),
                    timeoutMs        : leaf(3000, 'NEO_ORCHESTRATOR_PROVIDER_READY_TIMEOUT_MS', 'number'),
                    routineCacheTtlMs: leaf(1000, 'NEO_ORCHESTRATOR_PROVIDER_READY_ROUTINE_CACHE_TTL_MS', 'number'),
                    /**
                     * Reserved stuck-runner policy coordinates for a safe detector and admitted
                     * recovery boundary. The former inference-canary `healthProbe` is
                     * intentionally retired: timing out an already-dispatched inference request can
                     * itself leave provider work running. No current consumer may interpret
                     * `canaryTimeoutMs` as permission to dispatch or abort inference. The leaves stay
                     * stable for deployment compatibility until non-intervening, multi-fact evidence
                     * is bound to an admitted recovery action.
                     * @type {Object}
                     */
                    stuckRunner: {
                        enabled            : leaf(true,  'NEO_ORCHESTRATOR_STUCK_RUNNER_ENABLED', 'boolean'),
                        consecutiveFailures: leaf(3,     'NEO_ORCHESTRATOR_STUCK_RUNNER_CONSECUTIVE_FAILURES', 'number'),
                        canaryTimeoutMs    : leaf(10000, 'NEO_ORCHESTRATOR_STUCK_RUNNER_CANARY_TIMEOUT_MS', 'number')
                    }
                },
                /**
                 * L0 deployment-runtime access holder used by the self-healing stack.
                 *
                 * The deny-by-default mechanism (the recovery-actuator privilege-boundary design):
                 * docker-socket + deny-by-default wrapper is the MVP, while a privileged sidecar
                 * remains the hardening fallback if the wrapper cannot prove strict service
                 * identity and operation allowlisting. The holder exposes two separate
                 * capability envelopes over the same runtime handle:
                 *
                 * - `readOperations`: logs / stats / inspect for observability.
                 * - `lifecycleOperations`: restart for recovery, plus update-memory-limit — the
                 *   store-class ceiling raise, which must land on the RUNNING container because a
                 *   store's restart mid-ingestion is the harm the raise exists to avoid.
                 *
                 * `allowedServices` names Docker Compose service labels, not arbitrary
                 * container ids. When runtime access is enabled, `composeProject` is mandatory:
                 * `(composeProject, composeService)` is the target identity even on a host that
                 * currently runs only one stack.
                 *
                 * Env overrides:
                 * `NEO_ORCHESTRATOR_RUNTIME_ACCESS_ENABLED`,
                 * `NEO_ORCHESTRATOR_RUNTIME_ACCESS_MECHANISM`,
                 * `NEO_ORCHESTRATOR_RUNTIME_ACCESS_SOCKET_PATH`,
                 * `NEO_ORCHESTRATOR_RUNTIME_ACCESS_COMPOSE_PROJECT`,
                 * `NEO_ORCHESTRATOR_RUNTIME_ACCESS_ALLOWED_SERVICES`,
                 * `NEO_ORCHESTRATOR_RUNTIME_ACCESS_READ_OPERATIONS`,
                 * `NEO_ORCHESTRATOR_RUNTIME_ACCESS_LIFECYCLE_OPERATIONS`,
                 * `NEO_ORCHESTRATOR_RUNTIME_ACCESS_TIMEOUT_MS`,
                 * `NEO_ORCHESTRATOR_RUNTIME_ACCESS_RESPONSE_MAX_BYTES`,
                 * `NEO_ORCHESTRATOR_RUNTIME_ACCESS_LOG_TAIL`,
                 * `NEO_ORCHESTRATOR_RUNTIME_ACCESS_RESTART_TIMEOUT_SECONDS`,
                 * `NEO_ORCHESTRATOR_RUNTIME_ACCESS_AUDIT_MODE`.
                 *
                 * @type {Object}
                 */
                deploymentRuntimeAccess: {
                    enabled                     : leaf(false, 'NEO_ORCHESTRATOR_RUNTIME_ACCESS_ENABLED', 'boolean'),
                    mechanism                   : leaf('docker-socket', 'NEO_ORCHESTRATOR_RUNTIME_ACCESS_MECHANISM', 'string'),
                    socketPath                  : leaf('/var/run/docker.sock', 'NEO_ORCHESTRATOR_RUNTIME_ACCESS_SOCKET_PATH', 'string'),
                    composeProject              : leaf(null, 'NEO_ORCHESTRATOR_RUNTIME_ACCESS_COMPOSE_PROJECT', 'string'),
                    allowedServices             : leaf(['chroma', 'kb-server', 'mc-server', 'local-model'], 'NEO_ORCHESTRATOR_RUNTIME_ACCESS_ALLOWED_SERVICES', 'csv'),
                    readOperations              : leaf(['inspect', 'logs', 'stats'], 'NEO_ORCHESTRATOR_RUNTIME_ACCESS_READ_OPERATIONS', 'csv'),
                    lifecycleOperations         : leaf(['restart', 'update-memory-limit'], 'NEO_ORCHESTRATOR_RUNTIME_ACCESS_LIFECYCLE_OPERATIONS', 'csv'),
                    timeoutMs                   : leaf(5000, 'NEO_ORCHESTRATOR_RUNTIME_ACCESS_TIMEOUT_MS', 'number'),
                    responseMaxBytes            : leaf(1024 * 1024, 'NEO_ORCHESTRATOR_RUNTIME_ACCESS_RESPONSE_MAX_BYTES', 'number'),
                    logTail                     : leaf(200, 'NEO_ORCHESTRATOR_RUNTIME_ACCESS_LOG_TAIL', 'number'),
                    defaultRestartTimeoutSeconds: leaf(10, 'NEO_ORCHESTRATOR_RUNTIME_ACCESS_RESTART_TIMEOUT_SECONDS', 'number'),
                    auditMode                   : leaf('metadata', 'NEO_ORCHESTRATOR_RUNTIME_ACCESS_AUDIT_MODE', 'string')
                },
                /**
                 * Graph-independent deployment-state bridge. The orchestrator writes a bounded JSON
                 * snapshot to shared storage; KB/MC read tools consume it without receiving Docker
                 * socket, shell, exec, or actuator authority. Enabled by default: deployment
                 * overlays may explicitly disable the writer, and must mount the same
                 * `snapshotPath` into the public KB/MC containers.
                 *
                 * Env overrides:
                 * `NEO_DEPLOYMENT_STATE_BRIDGE_ENABLED`,
                 * `NEO_DEPLOYMENT_STATE_BRIDGE_SNAPSHOT_PATH`,
                 * `NEO_DEPLOYMENT_STATE_BRIDGE_WRITE_INTERVAL_MS`,
                 * `NEO_DEPLOYMENT_STATE_BRIDGE_STALE_AFTER_MS`,
                 * `NEO_DEPLOYMENT_STATE_BRIDGE_MAX_BYTES`,
                 * `NEO_DEPLOYMENT_STATE_BRIDGE_ALLOWED_SERVICES`,
                 * `NEO_DEPLOYMENT_STATE_BRIDGE_INCLUDE_LOGS`,
                 * `NEO_DEPLOYMENT_STATE_BRIDGE_LOG_TAIL`,
                 * `NEO_DEPLOYMENT_STATE_BRIDGE_LOG_MAX_BYTES`,
                 * `NEO_DEPLOYMENT_STATE_BRIDGE_STATS_SAMPLE_WINDOW`,
                 * `NEO_DEPLOYMENT_STATE_BRIDGE_PROVIDER_RESIDENCY_SERVICE_KEYS`,
                 * `NEO_DEPLOYMENT_STATE_BRIDGE_RECOVERY_RUN_LIMIT`.
                 *
                 * @type {Object}
                 */
                deploymentStateBridge: {
                    enabled                     : leaf(true, 'NEO_DEPLOYMENT_STATE_BRIDGE_ENABLED', 'boolean'),
                    snapshotPath                : leaf(path.resolve(planeDataRootDefault, 'deployment-state/snapshot.json'), 'NEO_DEPLOYMENT_STATE_BRIDGE_SNAPSHOT_PATH', 'string', {planeMember: true}),
                    writeIntervalMs             : leaf(30000, 'NEO_DEPLOYMENT_STATE_BRIDGE_WRITE_INTERVAL_MS', 'number'),
                    staleAfterMs                : leaf(2 * 60 * 1000, 'NEO_DEPLOYMENT_STATE_BRIDGE_STALE_AFTER_MS', 'number'),
                    maxSnapshotBytes            : leaf(256 * 1024, 'NEO_DEPLOYMENT_STATE_BRIDGE_MAX_BYTES', 'number'),
                    allowedServices             : leaf([], 'NEO_DEPLOYMENT_STATE_BRIDGE_ALLOWED_SERVICES', 'csv'),
                    includeLogs                 : leaf(true, 'NEO_DEPLOYMENT_STATE_BRIDGE_INCLUDE_LOGS', 'boolean'),
                    logTail                     : leaf(120, 'NEO_DEPLOYMENT_STATE_BRIDGE_LOG_TAIL', 'number'),
                    logMaxBytes                 : leaf(32 * 1024, 'NEO_DEPLOYMENT_STATE_BRIDGE_LOG_MAX_BYTES', 'number'),
                    statsSampleWindow           : leaf(2, 'NEO_DEPLOYMENT_STATE_BRIDGE_STATS_SAMPLE_WINDOW', 'number'),
                    providerResidencyServiceKeys: leaf(['local-model', 'model'], 'NEO_DEPLOYMENT_STATE_BRIDGE_PROVIDER_RESIDENCY_SERVICE_KEYS', 'csv'),
                    /**
                     * @summary Services the EMBEDDING-lane shape receipt attaches to — deliberately its
                     * own key rather than a reuse of `providerResidencyServiceKeys`.
                     *
                     * Those two sets name different lanes on a split-lane plane: residency observes the
                     * CHAT provider (`chat-model` in the provider-lanes profile), while the shape reading
                     * is taken against the EMBEDDING host and compared to the embedding declaration.
                     * Gating the receipt on the residency predicate publishes embedding-lane facts on the
                     * chat service's record and degrades the wrong container, while the service the data
                     * describes carries nothing. Widening the residency set instead would misroute
                     * residency and provider-activity onto the embedding lane — the same error inverted.
                     *
                     * The default covers both shipped topologies without a compose entry: `local-model`
                     * where one service holds both roles, `embedding-model` where the lanes are split.
                     * @type {String[]}
                     */
                    providerLaneShapeServiceKeys: leaf(['local-model', 'embedding-model'], 'NEO_DEPLOYMENT_STATE_BRIDGE_PROVIDER_LANE_SHAPE_SERVICE_KEYS', 'csv'),
                    recoveryRunLimit            : leaf(10, 'NEO_DEPLOYMENT_STATE_BRIDGE_RECOVERY_RUN_LIMIT', 'number'),
                    // Self-heal snapshot's recent-event cap — a DIFFERENT surface from recoveryRunLimit (heal-ledger
                    // events vs recovery-run states). collectSelfHealSnapshot validates it finite/non-negative (0 = no
                    // recent-event list) so a negative value can never expand the snapshot to every retained event.
                    selfHealRecentEventLimit    : leaf(10, 'NEO_DEPLOYMENT_STATE_BRIDGE_SELF_HEAL_RECENT_EVENT_LIMIT', 'number'),
                    /**
                     * Direct service probes — the SECOND evidence channel ADR-0025 §2.4 requires before a // ticket-ref-ok: the ADR clause is what this leaf exists to satisfy
                     * container-unhealthy state may license a restart. The orchestrator asks the service
                     * itself whether it is serving, instead of trusting the runtime's canary.
                     *
                     * The URL's HOSTNAME is the compose service key, so the list is self-describing and
                     * needs no parallel key list to drift out of step with it.
                     *
                     * **Empty by default, and that is the safe direction.** A probe pointed at a host that
                     * does not resolve would fail on every sweep; if such a failure were read as "the
                     * service did not answer" it would complete the evidence pair and restart a healthy
                     * container on every cycle. Opt-in per deployment, with the canonical composes
                     * declaring their own hosts.
                     */
                    directProbeUrls             : leaf([], 'NEO_DEPLOYMENT_STATE_BRIDGE_DIRECT_PROBE_URLS', 'csv'),
                    /**
                     * Statuses the direct probe accepts as SERVING. `degraded` is included deliberately and
                     * is the whole reason this leaf is not hardcoded: a Memory Core answering correctly
                     * while its provider-dependent canary fails reports `degraded`, and a probe that
                     * rejected it would manufacture the failed-probe half of the pair against a service
                     * that is working — restarting it and destroying the in-flight work whose slowness
                     * caused the red. This mirrors the canonical compose healthcheck's own
                     * `--expected-status healthy,degraded`.
                     */
                    directProbeExpectedStatus: leaf('healthy,degraded', 'NEO_DEPLOYMENT_STATE_BRIDGE_DIRECT_PROBE_EXPECTED_STATUS', 'string'),
                    /**
                     * **Must EXCEED the container healthcheck it second-guesses, and the first value
                     * here did not.** It was `8000`, copied from `mcpHealthcheck`'s own default, while
                     * the canonical MCP healthchecks run `timeout: 10s`. A second opinion with a
                     * tighter deadline than the opinion it is checking does not corroborate it — it
                     * fails MORE often, manufactures the failed-probe half of the evidence pair, and
                     * licenses a restart of a service that is merely slow.
                     *
                     * That is not hypothetical: measured on the canonical plane on 2026-08-09, Memory
                     * Core ran a `FailingStreak` of 4 against the 10s container probe while the same
                     * probe given a 20s budget returned `healthy` with `startupMs: 400`. An 8s
                     * independent probe would have agreed with the failing one and called a serving
                     * container wedged.
                     *
                     * 30s is three times the container probe's ceiling — generous enough that only a
                     * genuinely unresponsive service fails it, and still bounded so a hung probe cannot
                     * stall the sweep.
                     */
                    directProbeTimeoutMs     : leaf(30000, 'NEO_DEPLOYMENT_STATE_BRIDGE_DIRECT_PROBE_TIMEOUT_MS', 'number')
                },
                /**
                 * Cross-process heavy-maintenance lease (Chroma / SQLite / LLM maintenance mutex).
                 * `staleAfterMs`: a lease older than this is treated as abandoned and reclaimable — it must
                 * exceed the longest legitimate heavy-maintenance run (scales with data size), so it is an
                 * operator-tunable threshold, not a hardcoded ceiling. AiConfig-aware entrypoints pass the
                 * resolved value into Neo/Base-free lease primitives; primitives carry no TTL default/env binding.
                 * @type {Object}
                 */
                heavyMaintenanceLease: {
                    staleAfterMs: leaf(6 * 60 * 60 * 1000, 'NEO_HEAVY_MAINTENANCE_LEASE_TTL_MS', 'number'),
                    // Fairness bound: an acquirer that is NOT the waiter yields to a registered waiter
                    // whose unbroken deferral streak exceeds this. Deliberately generous — sized as a
                    // starvation ceiling, not a scheduling optimization — thresholds derived from a
                    // misbehaving system's observations bound the wrong quantity.
                    fairnessYieldAfterMs: leaf(30 * 60 * 1000, 'NEO_HEAVY_MAINTENANCE_LEASE_FAIRNESS_YIELD_MS', 'number'),
                    /**
                     * Starvation bound for the HEALTH surface — sized above `fairnessYieldAfterMs`
                     * BY DEFAULT (1h vs 30min; the relationship is advisory, not enforced — an
                     * operator who inverts them gets degrade-before-yield, which is noisier but
                     * never unsafe): fairness yields the lease at that bound, so a live
                     * waiter still deferred past THIS one means fairness itself failed, and the
                     * orchestrator health surface degrades with a receipt naming the waiter, its
                     * class, `deferredSince`, and the current lease holder — instead of leaving
                     * starvation as per-deferral log lines (the 8.5h-starved-backup incident shape).
                     * Recomputed from the live ledger every check — never latched; acquisition or
                     * entry expiry clears it on the next check. `<= 0` disables. Consumed by
                     * `scheduling/heavyMaintenanceStarvationWatchdog.mjs`.
                     */
                    starvationDegradeAfterMs: leaf(HOUR_MS, 'NEO_HEAVY_MAINTENANCE_LEASE_STARVATION_DEGRADE_MS', 'number')
                },
                /**
                 * Maintenance-loop intervals consumed by the orchestrator daemon.
                 * Env vars at the daemon boundary retain precedence over these defaults.
                 * @type {Object}
                 */
                intervals: {
                    pollMs              : leaf(3000, 'NEO_ORCHESTRATOR_POLL_INTERVAL_MS', 'number'),
                    summarySweepMs      : leaf(10 * 60 * 1000, 'NEO_ORCHESTRATOR_SUMMARY_SWEEP_INTERVAL_MS', 'number'),
                    kbSyncMs            : leaf(30 * 60 * 1000, 'NEO_ORCHESTRATOR_KB_SYNC_INTERVAL_MS', 'number'),
                    githubWorkflowSyncMs: leaf(2 * HOUR_MS, 'NEO_ORCHESTRATOR_GITHUB_WORKFLOW_SYNC_INTERVAL_MS', 'number'),
                    backupMs            : leaf(DAY_MS, 'NEO_ORCHESTRATOR_BACKUP_INTERVAL_MS', 'number'),
                    /**
                     * Minimum spacing between retries of a FAILED backup run, and how long the retry
                     * window stays open. `0` on either disables retry and restores the earlier
                     * behaviour, where a run that died seconds after spawn forfeited a full `backupMs`
                     * because `markStarted` stamps `lastRunAt` pre-spawn.
                     *
                     * The window is measured from `failureStreakStartedAt` — the FIRST failure after a
                     * success, written once and never advanced while the streak is open. It must be
                     * the failure and not the last success: a periodic run fails roughly one
                     * `backupMs` after the last success, so a window anchored there is already expired
                     * before the first retry can be spaced, and the whole policy silently no-ops.
                     *
                     * The effective attempt budget is `floor(backupRetryWindowMs / backupRetryDelayMs)`
                     * — 4 at these defaults. It is bounded deliberately: `backup` is the only
                     * priority-0 lane and wins the pick unconditionally, so an unbounded retry would
                     * monopolize the heavy-maintenance lease and starve the REM chain.
                     */
                    backupRetryDelayMs     : leaf(15 * 60 * 1000, 'NEO_ORCHESTRATOR_BACKUP_RETRY_DELAY_MS', 'number'),
                    backupRetryWindowMs    : leaf(HOUR_MS, 'NEO_ORCHESTRATOR_BACKUP_RETRY_WINDOW_MS', 'number'),
                    graphLogCompactionMs   : leaf(DAY_MS, 'NEO_ORCHESTRATOR_GRAPHLOG_COMPACTION_INTERVAL_MS', 'number'),
                    primaryDevSyncMs       : leaf(10 * 60 * 1000, 'NEO_ORCHESTRATOR_PRIMARY_DEV_SYNC_INTERVAL_MS', 'number'),
                    tenantRepoSyncMs       : leaf(30 * 60 * 1000, 'NEO_ORCHESTRATOR_TENANT_REPO_SYNC_INTERVAL_MS', 'number'),
                    dreamMs                : leaf(HOUR_MS, 'NEO_ORCHESTRATOR_DREAM_INTERVAL_MS', 'number'),
                    messageConceptHarvestMs: leaf(6 * HOUR_MS, 'NEO_ORCHESTRATOR_MESSAGE_CONCEPT_HARVEST_INTERVAL_MS', 'number'),
                    /**
                     * Fraction of `dreamMs` runtime that triggers completion-time cooldown for the
                     * next dream cycle. This is intentionally below the cycle-overflow telemetry
                     * signal: it prevents tight reacquire windows before a cycle exceeds the full
                     * cadence.
                     */
                    dreamOverflowThreshold: leaf(0.8, 'NEO_ORCHESTRATOR_DREAM_OVERFLOW_THRESHOLD', 'number'),
                    /**
                     * Cooldown for REM backlog catch-up after a successful cycle saturates the configured
                     * REM batch. This is shorter than `dreamMs`, but only activates for bounded
                     * non-overflow cycles that prove backlog remains.
                     */
                    remBacklogCatchupCooldownMs: leaf(5 * 60 * 1000, 'NEO_ORCHESTRATOR_REM_BACKLOG_CATCHUP_COOLDOWN_MS', 'number'),
                    /**
                     * Staleness threshold past which a genuine REM consolidation STARVATION (stale + an
                     * undigested backlog) forces one cycle regardless of the catch-up cooldown / heavy-slot
                     * contention. Multi-hour by design — well past normal contention-yielding, so only real
                     * starvation trips it; `0` disables. Consumed by the starvation-breaker in `dream.mjs`.
                     */
                    remStarvationBreakerMs: leaf(2 * HOUR_MS, 'NEO_ORCHESTRATOR_REM_STARVATION_BREAKER_MS', 'number'),
                    /**
                     * Wall-clock budget for one REM cycle's session-digest loop. When a cycle exceeds
                     * it, remaining sessions are deferred, the cycle returns saturated (so the
                     * existing backlog catch-up re-queues it after its cooldown), and the caller-held
                     * heavy-maintenance lease releases at the task boundary — waiters interleave
                     * instead of starving for the whole span. At least one session is always digested
                     * per cycle, so a small budget throttles without stalling forward progress.
                     * `0` disables (default): GPU/local planes keep uninterrupted cycles. Sized for
                     * CPU-only planes where a single cycle can hold a lane for hours.
                     */
                    dreamCycleBudgetMs: leaf(0, 'NEO_ORCHESTRATOR_DREAM_CYCLE_BUDGET_MS', 'number'),
                    /**
                     * Minimum idle gap after any dream run before the scheduler admits the next one,
                     * regardless of trigger source (periodic, backlog catch-up, starvation breaker).
                     * On CPU-only planes this makes cores visibly return to idle between cycles, so
                     * monitors and humans can distinguish "working in pulses" from "wedged" — the
                     * 2026-08-13 external-plane incident read 5+ hours of back-to-back REM as frozen
                     * cores. `0` disables (default). Keep well below `remStarvationBreakerMs` so the
                     * gap can never mask genuine starvation.
                     */
                    dreamBreathingGapMs: leaf(0, 'NEO_ORCHESTRATOR_DREAM_BREATHING_GAP_MS', 'number'),
                    /**
                     * Multiplier applied to `dreamMs` for the periodic trigger while the undigested
                     * backlog is zero: an idle-corpus plane consolidates at reduced cadence instead
                     * of burning heavy cycles over nothing. Backlog arrival restores the base cadence
                     * on the next evaluation, and the catch-up / starvation-breaker triggers are
                     * unaffected (both require a backlog by construction). `1` disables (default).
                     * Keep `dreamMs × multiplier` below the 24h decay Algorithmic Lock window, since
                     * cycle firing is what gives decay its chance to run.
                     */
                    dreamIdleBacklogCadenceMultiplier: leaf(1, 'NEO_ORCHESTRATOR_DREAM_IDLE_CADENCE_MULTIPLIER', 'number'),
                    goldenPathMs                     : leaf(HOUR_MS, 'NEO_ORCHESTRATOR_GOLDEN_PATH_INTERVAL_MS', 'number'),
                    /**
                     * Generic swarm-heartbeat / watchdog nudge cadence — the periodic pulse that fires a
                     * wake digest even with no new messages. Set to 20 min so the generic watchdog nudge
                     * sits in the operator's 20-30 min target, cutting wake noise. DIRECT actionable A2A
                     * wakes (review-request / REQUEST_CHANGES / task-state) stay event-driven and are NOT
                     * affected by this cadence — this slot is only the periodic pulse. The pulse cadence is
                     * a layer ABOVE the wake-coalescing window (the 300s digest-batching cap, an orthogonal
                     * mechanism), so widening it does not change coalescing semantics.
                     */
                    swarmHeartbeatMs      : leaf(20 * 60 * 1000, 'NEO_ORCHESTRATOR_SWARM_HEARTBEAT_INTERVAL_MS', 'number'),
                    /**
                     * Cadence of the embed-drain liveness watchdog — the read-only, never-fail health
                     * check that computes the age of the oldest un-embedded WAL record and raises a
                     * one-shot alarm when it exceeds `memoryWal.embedDrainStallThresholdMs`. Hourly is
                     * frequent enough to surface a stalled drain in hours (not the ~8 days of the silent
                     * drain-death incident) while staying far below the threshold so the check itself adds
                     * negligible load. `<= 0` disables the lane.
                     */
                    embedDrainLivenessWatchdogCheckMs: leaf(HOUR_MS, 'NEO_ORCHESTRATOR_EMBED_DRAIN_WATCHDOG_INTERVAL_MS', 'number'),
                    /**
                     * Cadence of the REM consolidation-liveness watchdog — the read-only, never-fail
                     * health check (consolidation-side analog of the embed-drain watchdog) that computes
                     * the age since the last successful REM cycle and raises a one-shot alarm when it
                     * exceeds `memoryWal`-sibling `remConsolidationStallThresholdMs`.
                     * Hourly surfaces a stalled dream in hours. `<= 0` disables the lane.
                     */
                    remConsolidationWatchdogCheckMs  : leaf(HOUR_MS, 'NEO_ORCHESTRATOR_REM_CONSOLIDATION_WATCHDOG_INTERVAL_MS', 'number'),
                    /**
                     * Cadence of the heavy-maintenance starvation watchdog — the read-only,
                     * never-fail health check that scans the durable waiter ledger and degrades
                     * health when any live waiter's deferral streak exceeds
                     * `heavyMaintenanceLease.starvationDegradeAfterMs`. Ten minutes keeps detection
                     * latency small next to the hour-scale bound while the check itself stays one
                     * directory listing. `<= 0` disables the lane.
                     */
                    heavyMaintenanceStarvationWatchdogCheckMs: leaf(10 * 60 * 1000, 'NEO_ORCHESTRATOR_HEAVY_STARVATION_WATCHDOG_INTERVAL_MS', 'number'),
                    /**
                     * Cadence of the data-integrity sweep — the read-only, never-fail health check that
                     * audits Memory Core metadata-vs-vector coverage and emits a `data-integrity`
                     * diagnosis on drift (the "up but data-gutted reports green" blind spot). The
                     * diagnosis routes to the autonomous data-recovery actuator — the store is HEALED,
                     * not paged: a cloud deployment has no operator to gate. Hourly surfaces a silent
                     * vector-loss in hours, not weeks. `<= 0` disables the lane.
                     */
                    dataIntegritySweepCheckMs        : leaf(HOUR_MS, 'NEO_ORCHESTRATOR_DATA_INTEGRITY_SWEEP_INTERVAL_MS', 'number')
                },
                /**
                 * Chroma daemon recycle policy. The orchestrator kills and respawns the supervised
                 * Chroma daemon once its uptime exceeds `maxRuntimeMs`, then runs a unified-store-safe
                 * defrag against the fresh daemon. `0` disables recycling.
                 * Env override: `NEO_CHROMA_MAX_RUNTIME_MS`. The lane is gated by
                 * `localOnly.chromaDaemonEnabled` — a no-op when Chroma is externally managed.
                 * @type {Object}
                 */
                chroma: {
                    maxRuntimeMs: leaf(DAY_MS, 'NEO_CHROMA_MAX_RUNTIME_MS', 'number')
                },
                /**
                 * Local webpack dev-server supervision policy. `enabled: null` means the
                 * deployment profile decides (local enables, cloud disables); explicit true/false
                 * lets operators opt in/out without changing the manual `server-start --open`
                 * command. The orchestrator-owned task never passes `--open`.
                 * @type {Object}
                 */
                devServer: {
                    enabled               : leaf(null, 'NEO_ORCHESTRATOR_DEV_SERVER_ENABLED', 'boolean'),
                    port                  : leaf(8080, 'NEO_ORCHESTRATOR_DEV_SERVER_PORT', 'port'),
                    livenessProbeTimeoutMs: leaf(1000, 'NEO_ORCHESTRATOR_DEV_SERVER_LIVENESS_TIMEOUT_MS', 'number')
                },
                /**
                 * GraphLog compaction policy. The scheduled lane invokes the existing
                 * `compactGraphLog.mjs --apply` maintenance script; the script owns retention
                 * safety and cursor handling. `vacuum` stays explicit because SQLite VACUUM is
                 * heavier than logical GraphLog compaction and physically rewrites the DB file.
                 * @type {Object}
                 */
                graphLogCompaction: {
                    enabled: leaf(true, 'NEO_ORCHESTRATOR_GRAPHLOG_COMPACTION_ENABLED', 'boolean'),
                    vacuum : leaf(false, 'NEO_ORCHESTRATOR_GRAPHLOG_COMPACTION_VACUUM', 'boolean')
                },
                /**
                 * Heavy-maintenance lease fairness — the bound on continuous lease hold. A long-running
                 * heavy task (e.g. a multi-hour KB re-embed) yields the single heavy-maintenance lease
                 * after `maxActiveHoldMs` of continuous hold — polled via `shouldYieldHeavyMaintenanceLease`
                 * — so a starved heavy peer (e.g. `githubWorkflowSync`, which otherwise stales the sandman
                 * handoff for the whole run) interleaves; the next sweep re-acquires for the remaining work.
                 * A holder must only yield at a resumable checkpoint (a preserved shadow + resume-marker keep
                 * completed work), so the release window is torn-read-free. `0`/falsy ⇒ never yields
                 * (byte-identical back-compat). Default 30min (the fairness decision with
                 * @neo-opus-grace): independent of `staleAfterMs` but kept smaller (a live holder yields before
                 * it would be stale-reclaimed); a SOFT knob — the holder yields at the first between-batch
                 * checkpoint after the bound, never mid-batch — so it is tunable on observed yield-churn.
                 * Env override: `NEO_ORCHESTRATOR_HEAVY_MAINTENANCE_MAX_ACTIVE_HOLD_MS`.
                 * @type {Object}
                 */
                heavyMaintenance: {
                    maxActiveHoldMs: leaf(HOUR_MS / 2, 'NEO_ORCHESTRATOR_HEAVY_MAINTENANCE_MAX_ACTIVE_HOLD_MS', 'number')
                },
                /**
                 * Neural Link Bridge local-supervision policy. The bridge port itself is owned
                 * by `ai/mcp/server/neural-link/config.mjs` (`NEO_NL_PORT`); this block only
                 * controls orchestrator-side probing.
                 * @type {Object}
                 */
                neuralLinkBridge: {
                    livenessProbeTimeoutMs: leaf(1000, 'NEO_ORCHESTRATOR_NL_BRIDGE_LIVENESS_TIMEOUT_MS', 'number')
                },
                /**
                 * Swarm-heartbeat target-resolver config. Controls which identity set
                 * `SwarmHeartbeatService.pulse()` targets per cycle via the resolver
                 * precedence chain. Env override: `NEO_ORCHESTRATOR_SWARM_HEARTBEAT_TARGET_SOURCE`.
                 * Explicit list override (highest precedence):
                 * `NEO_ORCHESTRATOR_SWARM_HEARTBEAT_TARGETS` (comma-separated handles).
                 * @type {Object}
                 */
                swarmHeartbeat: {
                    /**
                     * Resolver source enum. Tracked default is `'active-a2a-participants'`:
                     * the pulse candidate set is auto-discovered from A2A `MESSAGE` activity
                     * within the last 3h (sibling to the per-identity `active` signal). This is
                     * per-MC-instance derived (no team-registry coupling), so external workspaces
                     * only ever see their own MC's activity — tenant-safe.
                     *
                     * Valid values: `'self'`, `'active-local-team'`, `'active-subscribers'`,
                     * `'active-a2a-participants'`, `'disabled'`. `null` falls through to
                     * `'self'` (deployment-portable code-side safety net).
                     *
                     * - `'self'` — pulse only the harness owner (`NEO_AGENT_IDENTITY`)
                     * - `'active-local-team'` — reads `identityRoots.mjs` Neo-team registry
                     * - `'active-subscribers'` — unions self with `WAKE_SUBSCRIPTION` nodes
                     * - `'active-a2a-participants'` — unions self with identities active in
                     *   A2A graph within last 3h (the default)
                     * - `'disabled'` — no pulse targets
                     *
                     * @type {'self'|'active-local-team'|'active-subscribers'|'active-a2a-participants'|'disabled'|null}
                     */
                    targetSource: leaf('active-a2a-participants', 'NEO_ORCHESTRATOR_SWARM_HEARTBEAT_TARGET_SOURCE', 'string'),
                    /**
                     * Explicit comma-separated handle list override (highest resolver precedence).
                     * Raw string; the consumer (`Orchestrator.swarmHeartbeatExplicitTargets`) splits
                     * and trims. `null`/absent → resolver falls through to `targetSource` semantics.
                     * @type {String|null}
                     */
                    targets: leaf(null, 'NEO_ORCHESTRATOR_SWARM_HEARTBEAT_TARGETS', 'string'),
                    /**
                     * Idle-out threshold (ms): a `WAKE_SUBSCRIPTION`-active agent whose latest
                     * `AGENT_MEMORY` is older than this is an `idle_out_candidate` for the bounded
                     * in-place heartbeat nudge. Read at the use site by the lifecycle detectors
                     * (`checkSunsetted.mjs`, `checkAllAgentIdle.mjs`). Bound to the
                     * `NEO_IDLE_THRESHOLD_MS` env name (NEO_ prefix convention).
                     * @type {Number}
                     */
                    idleThresholdMs: leaf(10 * 60 * 1000, 'NEO_IDLE_THRESHOLD_MS', 'number'),
                    /**
                     * Swarm wake cooldown TTL (seconds): minimum gap between swarm-wide
                     * all-agent-idle WAKE dispatches, enforced by `swarmWakeCooldown.mjs` to keep
                     * the heartbeat idempotent. Bound to the `NEO_SWARM_WAKE_COOLDOWN_SECONDS`
                     * env name (NEO_ prefix convention).
                     * @type {Number}
                     */
                    swarmWakeCooldownSeconds: leaf(600, 'NEO_SWARM_WAKE_COOLDOWN_SECONDS', 'number'),
                    /**
                     * Explicit override for the all-agent-idle CHECK set (`checkAllAgentIdle.mjs`) —
                     * the identities whose collective idleness triggers a swarm-wide wake. Distinct
                     * from `targets`/`targetSource` above (those choose pulse RECIPIENTS via the
                     * resolver): idle detection needs the registered active team, not the recently-
                     * A2A-active subset, so `null` resolves via `resolveTargets({targetSource:
                     * 'active-local-team'})` (deployment-portable `identityRoots` active maintainers,
                     * never a hardcoded roster). Bound to the `NEO_SWARM_IDENTITIES` env name.
                     * @type {String[]|null}
                     */
                    allIdleIdentities: leaf(null, 'NEO_SWARM_IDENTITIES', 'csv')
                },
                /**
                 * Event-wake dispatch policy — how the wake daemon batches EVENT wakes (message /
                 * task / permission) into digests. Distinct from `swarmHeartbeat` above (the
                 * idle-watchdog lane): these knobs shape per-event delivery rate, not idle nudges.
                 * @type {Object}
                 */
                wakeDispatch: {
                    /**
                     * Default coalescing window (seconds) for event wakes: after an event queues,
                     * the daemon waits this long for FURTHER events before flushing one digest —
                     * and the window is ROLLING (each new arrival extends the wait; the hard
                     * 300s flush cap in `ai/services/memory-core/wakeCoalescePolicy.mjs` bounds total
                     * latency). Sized for the swarm's real INTER-turn cadence — lifecycle
                     * messages land minutes apart, and every wake costs a full harness turn, so
                     * waking per-message is the dominant token waste (the prior 30s fixed
                     * window produced exactly that). Per-subscription override stays
                     * `harnessTargetMetadata.coalesceWindow` (same clamp; `0` = explicit
                     * immediate dispatch). Bound to the `NEO_WAKE_COALESCE_WINDOW_SECONDS`
                     * env name (NEO_ prefix convention).
                     * @type {Number}
                     */
                    coalesceWindowSeconds: leaf(150, 'NEO_WAKE_COALESCE_WINDOW_SECONDS', 'number'),
                    /**
                     * Post-flush refractory (seconds): after a CONFIRMED delivery, the next digest
                     * for the same subscription is held to at least this distance — the
                     * anti-chatter floor that stops wake-per-message at just-outside-window
                     * spacing. A mechanism parameter more than an operator knob: change with
                     * care, the witnesses drive short spans through it. Bound to the
                     * `NEO_WAKE_FLUSH_REFRACTORY_SECONDS` env name.
                     * @type {Number}
                     */
                    flushRefractorySeconds: leaf(120, 'NEO_WAKE_FLUSH_REFRACTORY_SECONDS', 'number'),
                    /**
                     * Hard digest-latency cap (seconds) measured from a queue's FIRST event:
                     * rolling extension and the refractory both yield to it. The long-standing
                     * "max 5 minutes" §6.4.1 design ceiling, now a declared leaf. Bound to the
                     * `NEO_WAKE_FLUSH_HARD_CAP_SECONDS` env name.
                     * @type {Number}
                     */
                    flushHardCapSeconds: leaf(300, 'NEO_WAKE_FLUSH_HARD_CAP_SECONDS', 'number'),
                    /**
                     * Delivery-attempt bound (seconds): one adapter attempt may hold the
                     * per-subscription delivery owner at most this long — a hung transport
                     * times out as a FAILED attempt (retry path), so an unresponsive adapter
                     * can never starve the queue behind the in-flight reservation and defeat
                     * the hard cap. Bound to the `NEO_WAKE_ATTEMPT_TIMEOUT_SECONDS` env name.
                     * @type {Number}
                     */
                    attemptTimeoutSeconds: leaf(30, 'NEO_WAKE_ATTEMPT_TIMEOUT_SECONDS', 'number')
                },
                /**
                 * Local-only maintenance lane switches. Cloud deployments can disable these
                 * without changing remote graph-backed A2A / Memory Core behavior.
                 * `null` means "use the deployment profile default" (`local` enables,
                 * `cloud` disables); set `true` only when explicitly opting a lane back in.
                 * Exceptions default `false`: `githubWorkflowSyncEnabled` because the Data Sync
                 * workflow owns scheduled corpus publication, plus `bridgeDaemonEnabled` and
                 * `swarmHeartbeatEnabled` because the Stop hook makes wake + heartbeat redundant
                 * flood. All remain env-overridable to re-enable.
                 * @type {Object}
                 */
                localOnly: {
                    primaryDevSyncEnabled: leaf(null, 'NEO_ORCHESTRATOR_PRIMARY_DEV_SYNC_ENABLED', 'boolean'),
                    // Scheduled corpus emission belongs to CI's read-only/Publisher split. Local
                    // checkouts retain the manual CLI but must not regenerate the corpus every two
                    // hours and accumulate changes they cannot publish through the dev ruleset.
                    githubWorkflowSyncEnabled: leaf(false, 'NEO_ORCHESTRATOR_GITHUB_WORKFLOW_SYNC_ENABLED', 'boolean'),
                    // Local profile may supervise a child Chroma process; cloud profile
                    // reaches the compose-owned `chroma` peer container instead.
                    chromaDaemonEnabled    : leaf(null, 'NEO_ORCHESTRATOR_CHROMA_DAEMON_ENABLED', 'boolean'),
                    // Desktop wake-DELIVERY gate. Defaults OFF: the lane-state Stop hook forces turn
                    // continuation, so wake interrupts are redundant duplicate-flood at multi-peer
                    // scale (A2A messages still persist + surface on the next list_messages).
                    // Set `true` (or `NEO_ORCHESTRATOR_BRIDGE_DAEMON_ENABLED=true`) to restore delivery.
                    bridgeDaemonEnabled    : leaf(false, 'NEO_ORCHESTRATOR_BRIDGE_DAEMON_ENABLED', 'boolean'),
                    neuralLinkBridgeEnabled: leaf(null, 'NEO_ORCHESTRATOR_NL_BRIDGE_ENABLED', 'boolean'),
                    // The embed daemon durably drains the add_memory WAL into the content store
                    // (ai/daemons/embed/daemon.mjs). Local profile supervises it as a child
                    // process; cloud deployments own their drain story per-container (mirror of
                    // the chromaDaemonEnabled split).
                    embedDaemonEnabled             : leaf(null, 'NEO_ORCHESTRATOR_EMBED_DAEMON_ENABLED', 'boolean'),
                    // The message daemon observes the accepted A2A-message WAL. Local profile may
                    // supervise it as a child process; cloud deployments use Memory Core's
                    // messageWal.inProcessDrain host mode instead.
                    messageDaemonEnabled           : leaf(null, 'NEO_ORCHESTRATOR_MESSAGE_DAEMON_ENABLED', 'boolean'),
                    goldenPathRepoEnrichmentEnabled: leaf(null, 'NEO_ORCHESTRATOR_GOLDEN_PATH_REPO_ENRICHMENT_ENABLED', 'boolean'),
                    // Swarm-heartbeat lane: emits wake-substrate pulses + heartbeat-driven idle/swarm
                    // wakes (`WakeDecisionService.decideWake` runs INSIDE `SwarmHeartbeatService.pulse()`).
                    // Defaults OFF: the lane-state Stop hook covers turn continuation, so these pulses
                    // are redundant duplicate-flood at multi-peer scale. Substrate maintenance
                    // (GraphLog compaction, integrity sweep, embed/message daemons) runs via its own
                    // separate task toggles and is unaffected. Set `true` (or
                    // `NEO_ORCHESTRATOR_SWARM_HEARTBEAT_ENABLED=true`) to restore.
                    swarmHeartbeatEnabled          : leaf(false, 'NEO_ORCHESTRATOR_SWARM_HEARTBEAT_ENABLED', 'boolean'),
                    // Reserved policy placeholder: no runtime consumer yet.
                    // `bridgeDaemonEnabled` is the active scheduler gate for desktop wake delivery.
                    wakeDispatchEnabled            : leaf(null)
                },
                /**
                 * Cloud-only maintenance lane switches (mirror of `localOnly` with inverted
                 * deployment-default: `null` means "use the deployment-profile default" —
                 * cloud enables, local disables. Set `true` only when explicitly opting a
                 * lane back in for the LOCAL profile (e.g. operator-side smoke testing of
                 * tenant-repo-sync without a cloud-profile container).
                 * @type {Object}
                 */
                cloudOnly: {
                    // Tenant-repo-sync is a cloud-deployable lane: cloud profile defaults enabled
                    // when tenant repos are configured; local Neo-maintainer profile defaults
                    // disabled unless explicitly opted in.
                    tenantRepoSyncEnabled: leaf(null, 'NEO_ORCHESTRATOR_TENANT_REPO_SYNC_ENABLED', 'boolean'),
                    // Both scan the Neo repo's own corpus. That used to mean "the maintainer's local
                    // checkout" and now means the container image, which is built FROM the repo and
                    // carries `learn/`, `src/`, `resources/content/` and `.git`. They live here rather
                    // than in `localOnly` because no non-containerized scheduler exists to run them:
                    // a `localOnly` leaf resolves to disabled on the only role left that can, leaving
                    // the Knowledge Base with no producer at all.
                    //
                    // The group is what makes the default right, so the production compose inherits it
                    // and does not restate it — `mcpHealthcheck.spec.mjs` refuses a compose that pins
                    // `NEO_ORCHESTRATOR_KB_SYNC_ENABLED`, because a deployment restating an AiConfig
                    // default silently freezes today's value.
                    kbSyncEnabled         : leaf(null, 'NEO_ORCHESTRATOR_KB_SYNC_ENABLED', 'boolean'),
                    temporalSummaryEnabled: leaf(null, 'NEO_ORCHESTRATOR_TEMPORAL_SUMMARY_ENABLED', 'boolean'),
                    // B1 docker-socket sibling-container recovery (the immune system's privileged tier).
                    // Cloud profile defaults enabled (no operator present to manually restart a wedged
                    // sibling); local profile defaults disabled (the operator IS present + autonomously
                    // recycling a dev container is disruptive). B0 in-process recycle + data-integrity
                    // re-embed + the read-only deployment-state bridge stay active locally regardless.
                    // ORTHOGONAL to `recoveryActuator.blockedComposeServices` (ADR-26): this mode-gate is
                    // "is B1 active in this deployment at all"; the blocklist is the per-service opt-out
                    // WITHIN an active mode. They compose; do not overload the blocklist to express the mode gate.
                    composeServiceRecoveryEnabled: leaf(null, 'NEO_ORCHESTRATOR_COMPOSE_SERVICE_RECOVERY_ENABLED', 'boolean'),
                    // Whether an off-host copy of the backup bundle is REQUIRED for this deployment.
                    // Cloud profile defaults required (the named volumes and the host that carries them
                    // are the same failure domain); local profile defaults not-required (the operator's
                    // own machine is not a durability boundary we can reason about).
                    //
                    // This gate exists because off-host sync CANNOT be defaulted on: enablement is a
                    // non-empty `maintenance.backup.offHostSync.command` naming an executable
                    // (`validateOffHostSyncConfig`), and no default command is knowable for a given
                    // deployment. So the deployment declares the REQUIREMENT here and the durability
                    // posture reports whether it is met — an explicit `false` is a deliberate opt-out,
                    // which is what distinguishes it from an unconfigured hook nobody noticed.
                    offHostBackupRequired: leaf(null, 'NEO_ORCHESTRATOR_OFF_HOST_BACKUP_REQUIRED', 'boolean')
                },
                /**
                 * Recovery actuator envelope. Enabled by default so deployed immune-system
                 * lanes can heal without per-deployment recovery target allowlists. Operators
                 * can block specific supervised tasks, compose services, or deploy targets while
                 * the runtime-access holder still gates compose services to known labels.
                 * @type {Object}
                 */
                recoveryActuator: {
                    enabled                    : leaf(true, 'NEO_RECOVERY_ACTUATOR_ENABLED', 'boolean'),
                    blockedSupervisedTasks     : leaf([], 'NEO_RECOVERY_ACTUATOR_BLOCKED_SUPERVISED_TASKS', 'csv'),
                    blockedComposeServices     : leaf([], 'NEO_RECOVERY_ACTUATOR_BLOCKED_COMPOSE_SERVICES', 'csv'),
                    blockedDeployTargets       : leaf([], 'NEO_RECOVERY_ACTUATOR_BLOCKED_DEPLOY_TARGETS', 'csv'),
                    healAttemptsPath           : leaf(path.resolve(planeDataRootDefault, 'orchestrator-daemon/heal-attempts.json'), 'NEO_RECOVERY_ACTUATOR_HEAL_ATTEMPTS_PATH', 'string', {planeMember: true}),
                    recoveryRunStateDir        : leaf(path.resolve(planeDataRootDefault, 'orchestrator-daemon/recovery-runs'), 'NEO_RECOVERY_ACTUATOR_RUN_STATE_DIR', 'string', {planeMember: true}),
                    recoveryRunRetentionLimit  : leaf(100, 'NEO_RECOVERY_ACTUATOR_RUN_RETENTION_LIMIT', 'number'),
                    maxAttemptsPerWindow       : leaf(3, 'NEO_RECOVERY_ACTUATOR_MAX_ATTEMPTS_PER_WINDOW', 'number'),
                    maxAttemptsWindowMs        : leaf(HOUR_MS, 'NEO_RECOVERY_ACTUATOR_MAX_ATTEMPTS_WINDOW_MS', 'number'),
                    baseBackoffMs              : leaf(5 * 60 * 1000, 'NEO_RECOVERY_ACTUATOR_BASE_BACKOFF_MS', 'number'),
                    maxBackoffMs               : leaf(HOUR_MS, 'NEO_RECOVERY_ACTUATOR_MAX_BACKOFF_MS', 'number'),
                    verifyCooldownMs           : leaf(60 * 1000, 'NEO_RECOVERY_ACTUATOR_VERIFY_COOLDOWN_MS', 'number'),
                    healthyObservationThreshold: leaf(1, 'NEO_RECOVERY_ACTUATOR_HEALTHY_OBSERVATION_THRESHOLD', 'number'),
                    // Due-only freeze re-probes own a transport deadline distinct from healthcheck cadence.
                    // The orchestrator reads this leaf at the use site; consumers never re-derive it from env.
                    freezeReprobeTimeoutMs     : leaf(30 * 1000, 'NEO_RECOVERY_ACTUATOR_FREEZE_REPROBE_TIMEOUT_MS', 'number'),
                    /**
                     * Heal-event ledger retention (the observability sink must not become its own disk leak). The
                     * append-time auto-prune keeps the newest `maxEvents` once the file crosses `pruneTriggerBytes`.
                     * Read at the orchestrator/actuator boundary and passed EXPLICITLY into the pure ledger helper
                     * (which owns no production default — this leaf is the source of truth). `maxEvents` sits well above the dispatch
                     * anti-thrash window so a prune can never evict a within-window attempt; the byte-trigger
                     * amortizes the O(N) prune (at ~150 B/entry the 5000-event cap is ~750 KB; a 1 MB trigger leaves headroom).
                     * @type {Object}
                     */
                    healLedger: {
                        maxEvents        : leaf(5000,        'NEO_RECOVERY_ACTUATOR_HEAL_LEDGER_MAX_EVENTS',          'number'),
                        pruneTriggerBytes: leaf(1024 * 1024, 'NEO_RECOVERY_ACTUATOR_HEAL_LEDGER_PRUNE_TRIGGER_BYTES', 'number')
                    },
                    /**
                     * Systemic-fault circuit-breaker bounds — the cross-collection layer above the per-collection
                     * anti-thrash (`maxAttemptsPerWindow`/`maxAttemptsWindowMs`). >= `systemicThreshold` DISTINCT
                     * collections failing with a shared embedder-outage signature inside `windowMs` trips the circuit
                     * OPEN (suppress every heal) for `openDurationMs`, then allows one half-open recovery probe.
                     * Consumed by `decideSystemicCircuit`: read at the actuator use-site and passed as its `bounds`.
                     * @type {Object}
                     */
                    systemicCircuit: {
                        systemicThreshold: leaf(3,              'NEO_RECOVERY_ACTUATOR_SYSTEMIC_CIRCUIT_THRESHOLD',        'number'),
                        windowMs         : leaf(10 * 60 * 1000, 'NEO_RECOVERY_ACTUATOR_SYSTEMIC_CIRCUIT_WINDOW_MS',        'number'),
                        openDurationMs   : leaf(10 * 60 * 1000, 'NEO_RECOVERY_ACTUATOR_SYSTEMIC_CIRCUIT_OPEN_DURATION_MS', 'number')
                    },
                    /**
                     * Chronic `unsafe-input` detector bounds — the immune system's self-observability for a
                     * MIS-WIRE. `dispatchHeal` fails CLOSED to `unsafe-input` on under-specified input (no
                     * collection / non-finite clock / missing recordRun); a single one is routine, but >=
                     * `threshold` for the SAME (action, collection) inside `windowMs` means a caller is
                     * chronically mis-wired and that heal silently never executes. Consumed by
                     * `detectChronicUnsafeInput`: read at the use-site and passed as its bounds.
                     * @type {Object}
                     */
                    chronicUnsafeInput: {
                        threshold: leaf(5,              'NEO_RECOVERY_ACTUATOR_CHRONIC_UNSAFE_INPUT_THRESHOLD', 'number'),
                        windowMs : leaf(60 * 60 * 1000, 'NEO_RECOVERY_ACTUATOR_CHRONIC_UNSAFE_INPUT_WINDOW_MS', 'number')
                    }
                },
                /**
                 * Optional local Neo repo roots for the primary-dev-sync lane.
                 * Keep the template machine-neutral; set real absolute paths in gitignored
                 * `ai/config.mjs` or via `NEO_ORCHESTRATOR_DEV_SYNC_ROOTS`.
                 * @type {String[]}
                 */
                devSyncRoots: leaf([], 'NEO_ORCHESTRATOR_DEV_SYNC_ROOTS', 'string'),
                /**
                 * Tenant-repo-sync per-repo scheduling parameters.
                 *
                 * The cadence floor lives in `intervals.tenantRepoSyncMs` above (30min default).
                 * Per-repo cadence in `tenantRepos[].cadenceMs` (operator-set) overrides global.
                 *
                 * - `backoffCapMs` bounds the per-repo failure backoff: the effective cadence
                 *   (base + jitter, doubled per consecutive failure) can never exceed this cap,
                 *   so a failing repo is guaranteed a retry inside the cap window regardless of
                 *   streak length — including across restarts, since the streak is persisted
                 *   state (an uncapped multiplier suppressed a never-ingested repo for 25+
                 *   hours while sweeps read green). Must comfortably exceed the per-repo
                 *   base cadence (floor `intervals.tenantRepoSyncMs`, 30min default) so it binds
                 *   only on failure streaks; the 2-hour default mirrors the operator-visible
                 *   recovery expectation for a transient mirror/credential outage.
                 * - `jitterRatio` caps the deterministic per-repo jitter offset as a fraction
                 *   of the base cadence. Default `0.20` keeps jitter within the operator-visible
                 *   cadence window.
                 *   Set `0` to disable jitter entirely (deterministic-cadence-only, no anti-
                 *   thundering-herd protection — only safe for low-tenant deployments).
                 * - `sweepCadenceMs` is the frequency at which the orchestrator wakes the
                 *   tenant-repo-sync task. Decoupled from per-repo cadence (`intervals.tenantRepoSyncMs`)
                 *   so deterministic jitter can actually spread per-repo sync attempts across
                 *   the jitter window. A short sweep cadence + a long per-repo cadence means
                 *   each sweep checks all repos against their individual due-times; repos
                 *   become due at different sweeps based on their deterministic jitter offset.
                 * - `leaseStaleAfterMs` bounds the cross-process tenant-repo-sync lease that
                 *   serializes the daemon's periodic sweep against the manual CLI over the
                 *   shared revisions manifest. Crashed owners are reclaimed immediately via
                 *   pid-liveness; this TTL is only the backstop for a live-but-wedged owner
                 *   and MUST comfortably exceed the longest legitimate sweep (clone + ingest
                 *   across every configured repo) — the six-hour default mirrors the
                 *   heavy-maintenance lease authority. Ownership is additionally re-verified
                 *   at every manifest commit point, so an evicted writer aborts instead of
                 *   overlapping the new owner.
                 * - `starvedAfterMs` is the duration floor for the starved-lane self-heal
                 *   record: a sweep whose every repo is backoff-suppressed with zero
                 *   lifetime successes reports `starved` immediately, but the heal-ledger
                 *   event (a record-with-diagnosis, exactly once per episode) fires
                 *   only once the oldest suppression is this old. Must exceed `backoffCapMs`
                 *   so a lane whose capped retries keep failing (fresh attempts, visible
                 *   `failed` sweeps) stays quiet — a stale suppression means a wedged lane,
                 *   not an ordinary outage. Set `0` to disable the event (never the status).
                 *
                 * @type {Object}
                 */
                tenantRepoSync: {
                    backoffCapMs     : leaf(2 * 60 * 60 * 1000, 'NEO_ORCHESTRATOR_TENANT_REPO_SYNC_BACKOFF_CAP_MS', 'number'),
                    jitterRatio      : leaf(0.20, 'NEO_ORCHESTRATOR_TENANT_REPO_SYNC_JITTER_RATIO', 'number'),
                    leaseStaleAfterMs: leaf(6 * 60 * 60 * 1000, 'NEO_ORCHESTRATOR_TENANT_REPO_SYNC_LEASE_STALE_AFTER_MS', 'number'),
                    starvedAfterMs   : leaf(6 * 60 * 60 * 1000, 'NEO_ORCHESTRATOR_TENANT_REPO_SYNC_STARVED_AFTER_MS', 'number'),
                    sweepCadenceMs   : leaf(60 * 1000, 'NEO_ORCHESTRATOR_TENANT_REPO_SYNC_SWEEP_CADENCE_MS', 'number')
                },
                /**
                 * Orchestrator-owned MLX inference server config. Operators tune via gitignored
                 * `ai/config.mjs` or env vars (`NEO_ORCHESTRATOR_MLX_ENABLED`,
                 * `NEO_ORCHESTRATOR_MLX_MODEL`, `NEO_ORCHESTRATOR_MLX_PORT`).
                 *
                 * - `enabled`: whether the orchestrator should supervise an `mlx_lm.server` child
                 *   process. Disabled by default because LM Studio / other OpenAI-compatible
                 *   providers already own the normal inference endpoint; enable only when this
                 *   orchestrator should own MLX directly.
                 * - `model`: Hugging Face repo id or local path for `mlx_lm.server --model`.
                 *   Distinct from the OpenAI-compatible API payload model label (`NEO_OPENAI_COMPATIBLE_MODEL`).
                 * - `port`: OpenAI-compatible local-inference port.
                 * @type {Object}
                 */
                mlx: {
                    enabled: leaf(false, 'NEO_ORCHESTRATOR_MLX_ENABLED', 'boolean'),
                    // The 26b MoE, matching `openAiCompatible.model` — one agreed chat model across
                    // every runtime. A different id here does not merely disagree on paper: MLX and
                    // LM Studio JIT-load whatever they are handed, so a second dense 31b would sit
                    // resident (~20 GB) beside the 26b already serving traffic.
                    // `-it` is load-bearing: the INSTRUCTION-TUNED weights, carried over from the
                    // `gemma-4-31b-it-bf16` this replaces. Verified against the mlx-community
                    // registry, where `gemma-4-26b-a4b-bf16` (no `-it`) ALSO exists — so dropping
                    // the suffix swaps the BASE model into a chat/graph-parsing role with no 404 to
                    // notice it, just quietly worse output.
                    model: leaf('mlx-community/gemma-4-26b-a4b-it-bf16', 'NEO_ORCHESTRATOR_MLX_MODEL', 'string'),
                    port : leaf('11435', 'NEO_ORCHESTRATOR_MLX_PORT', 'string')
                },
                /**
                 * Orchestrator-owned native Ollama server config. Operators tune via gitignored
                 * `ai/config.mjs` or env var `NEO_ORCHESTRATOR_OLLAMA_ENABLED`.
                 *
                 * - `enabled`: whether the orchestrator may supervise `ollama serve` for local-dev
                 *   roles explicitly routed through the native `ollama` provider. The task is
                 *   still omitted when no configured chat / embedding role targets `ollama`, so
                 *   the operator must explicitly opt a host edge into supervising Ollama.
                 *   When active, `OLLAMA_HOST`, `OLLAMA_KEEP_ALIVE`, `OLLAMA_CONTEXT_LENGTH`, and
                 *   `OLLAMA_MAX_LOADED_MODELS` are derived from the canonical provider and
                 *   local-model config leaves.
                 * @type {Object}
                 */
                ollama: {
                    enabled: leaf(false, 'NEO_ORCHESTRATOR_OLLAMA_ENABLED', 'boolean')
                },
                /**
                 * Orchestrator-owned LM Studio CLI (`lms`) inference server config. Operators
                 * tune via gitignored `ai/config.mjs` or env vars (`NEO_ORCHESTRATOR_LMS_ENABLED`,
                 * `NEO_ORCHESTRATOR_LMS_MODEL`, `NEO_ORCHESTRATOR_LMS_PORT`).
                 *
                 * Parallel alternative to `orchestrator.mlx` — both serve OpenAI-compatible HTTP
                 * for local chat + embedding workloads; pick at most one via the respective `enabled` flag.
                 *
                 * - `enabled`: whether the orchestrator should supervise an `lms server start`
                 *   child process. Disabled by default: provider processes are deployment choices,
                 *   not implicit Orchestrator children. The launcher remains **macOS-only** (LM Studio CLI is not
                 *   shipped for Linux containers, so this lane is local-dev substrate, not
                 *   cloud-deployment substrate).
                 * - `model`: legacy single-model field kept for existing operator overlays. The
                 *   orchestrator-managed `lms server start` lane pre-warms the configured
                 *   OpenAI-compatible models for roles actively routed through the
                 *   `openAiCompatible` provider via `lms load <model>` after server spawn.
                 *   Distinct from the OpenAI-compatible API payload label (`NEO_OPENAI_COMPATIBLE_MODEL`).
                 * - `port`: OpenAI-compatible local-inference port (LM Studio CLI default `1234`).
                 * @type {Object}
                 */
                lms: {
                    enabled: leaf(false, 'NEO_ORCHESTRATOR_LMS_ENABLED', 'boolean'),
                    model  : leaf('qwen3-embedding-8b', 'NEO_ORCHESTRATOR_LMS_MODEL', 'string'),
                    port   : leaf('1234', 'NEO_ORCHESTRATOR_LMS_PORT', 'string')
                }
            },
            /**
             * Business-engine layer configuration (the graph-as-business-operating-system substrate).
             * Read at the use site per the AiConfig SSOT discipline; the metric-ingestion probe is the
             * first consumer. Source descriptors needing endpoints/cadences join this subtree when a
             * source that reads them lands — no speculative leaves.
             * @type {Object}
             */
            business: {
                /**
                 * Master switch for the read-only business-metric ingestion probe. The probe refuses
                 * to run when disabled — fail-closed by construction, so metric writes into the
                 * production graph are always an explicit operator decision.
                 * @type {boolean}
                 */
                metricProbeEnabled: leaf(false, 'NEO_BUSINESS_METRIC_PROBE', 'boolean'),
                /**
                 * Comma-separated allowlist of metric categories (`metricName` values) the probe may
                 * ingest with `publicFlag: true`. Categories are public by design; anything not listed
                 * is refused at the probe boundary — the schema-side redaction gate's config half.
                 * @type {string}
                 */
                publicCategoryAllowlist: leaf('merged-prs,review-latency,stars-total,npm-downloads', 'NEO_BUSINESS_PUBLIC_CATEGORIES', 'string')
            },
            /**
             * Agent OS maintenance policy shared by operator scripts and daemons.
             * @type {Object}
             */
            maintenance: leaf({
                /**
                 * Canonical atomic-bundle backup policy. Bundles remain atomic; per-substrate
                 * retention is intentionally not represented here.
                 * @type {Object}
                 */
                backup: {
                    intervalMs: DAY_MS,
                    retention : {
                        keepMinimum: 3,
                        maxDays    : 30,
                        /**
                         * How many `.backup-partial-*` staging directories left by ABRUPT death
                         * survive the residue sweep, newest first.
                         *
                         * A count rather than an age bound, deliberately. The residue is the only
                         * surviving evidence of a termination that recorded no terminal outcome,
                         * and any age short enough to cap capacity is also short enough to delete
                         * the artifact an operator is mid-investigation on. A count bounds growth
                         * without making that judgement. `0` reclaims every partial not currently
                         * in flight; the in-flight staging root is excluded explicitly, never by
                         * relying on it being the newest.
                         * @type {Number}
                         */
                        keepPartials: 2
                    },
                    /**
                     * How many candidate bundles `verifyLatestBackupRestorable` may FULLY validate
                     * before giving up and reporting the newest failure.
                     *
                     * The probe walks newest-first because a single unusable newest bundle must not
                     * hide recoverable history behind it, but full validation streams and parses every
                     * row of every JSONL in a bundle — on a multi-GB bundle that is not free, and an
                     * unbounded walk would let a run of corrupt bundles turn a deploy preflight into an
                     * arbitrarily long scan. Exhausting it logs which bundles went unexamined rather
                     * than reporting a clean "nothing restorable" — a silent cap reads exactly like an
                     * exhaustive search, which is the same false-negative the walk exists to end.
                     * @type {Number}
                     */
                    restorabilityScanLimit: 5,
                    /**
                     * Off-host durability hook (plain nested keys inside this object leaf — the owning
                     * ticket owns validation; see backup.mjs#validateOffHostSyncConfig). An empty
                     * `command` disables the hook entirely. Secrets never enter this tree: `envAllowlist`
                     * names env vars the sync child may inherit; values live only in the process env.
                     * @type {Object}
                     */
                    offHostSync: {
                        argv        : [],
                        command     : '',
                        envAllowlist: [],
                        killGraceMs : 5000,
                        timeoutMs   : 600000
                    }
                },
                /**
                 * Chroma defrag policy. Cadence here is operator policy only — no daemon
                 * auto-spawns defrag from THIS value. The orchestrator's max-runtime recycle
                 * path can auto-spawn `ai:defrag-kb`, driven by `orchestrator.chroma.maxRuntimeMs`;
                 * that is a distinct config, not this cadence.
                 * @type {Object}
                 */
                defrag: {
                    intervalMs       : 7 * DAY_MS,
                    snapshotRetention: {
                        keepMinimum: 3,
                        maxDays    : 7
                    }
                }
            }),
            /**
             * Knowledge Base operations configuration for cloud-native ingestion, reconciliation,
             * alerting, and garbage-collection policy.
             * @type {Object}
             */
            knowledgeBase: leaf({
                /**
                 * Operator alert rules. Each entry is
                 * `{metric, threshold, severity, channels, deliveryMode?}`. Empty by default —
                 * the alerting daemon no-ops with no rules.
                 * @type {Object[]}
                 */
                alertRules: [],
                /**
                 * Master opt-in for the KB operator-alerting daemon.
                 * Disabled by default; the daemon exits early when false.
                 * @type {Boolean}
                 */
                alertingEnabled: false,
                /**
                 * Alerting daemon poll interval in ms (default 15 min).
                 * @type {Number}
                 */
                alertingIntervalMs: 15 * 60 * 1000,
                /**
                 * Per-`(tenant, metric, severity, channel)` hysteresis
                 * cooldown window in ms (default 1 h).
                 * @type {Number}
                 */
                alertingCooldownMs: 60 * 60 * 1000,
                /**
                 * Rolling look-back window in ms for the per-tenant
                 * telemetry rollup the rule engine evaluates (default 1 h).
                 * @type {Number}
                 */
                alertWindowMs: 60 * 60 * 1000,
                /**
                 * Master opt-in for the KB reconciliation daemon.
                 * Disabled by default; the daemon exits early when false.
                 * @type {Boolean}
                 */
                reconciliationEnabled: false,
                /**
                 * Reconciliation daemon poll interval in ms (default 1 h).
                 * @type {Number}
                 */
                reconciliationIntervalMs: 60 * 60 * 1000,
                /**
                 * Opt-in for the destructive auto-tombstone reconciliation
                 * action. Disabled by default — the daemon then detects config-stale chunks and
                 * emits config-stale telemetry only, issuing no `collection.delete`.
                 * @type {Boolean}
                 */
                reconciliationAutoTombstone: false,
                /**
                 * Config-version-gap threshold above which a config-stale
                 * chunk becomes auto-tombstone-eligible: a chunk is actioned when
                 * `currentConfigVersion - chunk.tenantConfigVersion >= this`. Default `2` gives
                 * one full config epoch of grace. Consulted only when `reconciliationAutoTombstone`.
                 * @type {Number}
                 */
                reconciliationOrphanVersionGap: 2,
                /**
                 * Master opt-in for the KB garbage-collection daemon.
                 * Disabled by default; the daemon exits early when false.
                 * @type {Boolean}
                 */
                gcEnabled: false,
                /**
                 * GC daemon poll interval in ms (default 24 h).
                 * @type {Number}
                 */
                gcIntervalMs: 24 * 60 * 60 * 1000,
                /**
                 * Retention policy: `{maxAgeMs?, maxCount?}`. A chunk is
                 * retention-expired if it is older than `maxAgeMs` (by its `ingestedAt` stamp) OR
                 * ranks beyond the `maxCount` most-recent of its `{tenantId, repoSlug}` bucket.
                 * Empty `{}` (the default) expires nothing — conservative.
                 * @type {Object}
                 */
                gcRetention: {},
                /**
                 * Opt-in for the destructive GC delete. Disabled by default —
                 * the daemon then detects retention-expired chunks and emits telemetry only,
                 * issuing no `collection.delete`.
                 * @type {Boolean}
                 */
                gcAutoDelete: false,
                /**
                 * Cumulative-deletion fraction above which a GC tick emits a
                 * `defrag-recommended` signal (operators should then run `ai:defrag-kb`). `0`
                 * disables the signal. V1 emits the signal only — it does not spawn defrag.
                 * @type {Number}
                 */
                gcDefragThreshold: 0.10
            }),
            /**
             * A dummy embedding function to satisfy ChromaDB when embeddings are provided manually.
             * @returns {Object}
             */
            dummyEmbeddingFunction: leaf({
                generate   : () => null,
                name       : 'dummy_embedding_function',
                getConfig  : () => ({}),
                constructor: {
                    buildFromConfig: () => ({
                        generate : () => null,
                        name     : 'dummy_embedding_function',
                        getConfig: () => ({})
                    })
                }
            })
        },
        /**
         * Reactive computed config values (`Neo.state.Provider` formulas).
         */
        formulas: {
            'auth.pinFirstProviderSubject': data => data.auth.pinFirstProviderSubjectOverride ??
                data.auth.mode === 'github-pat',
            'auth.autoProvisionIdentitySources': data => data.auth.autoProvisionIdentitySourcesOverride ??
                (['github-pat', 'gitlab-pat'].includes(data.auth.mode) ? [data.auth.mode] : []),
            'engines.chroma.useTestDatabase': data => data.engines.chroma.useUnitTestDatabase || data.engines.chroma.useTestHarness,
            'engines.chroma.dataDir'        : data => data.engines.chroma.useTestDatabase ? data.engines.chroma.dataDirTest : data.engines.chroma.dataDirProd,
            'engines.chroma.host'           : data => data.engines.chroma.useTestDatabase ? data.engines.chroma.hostTest    : data.engines.chroma.hostProd,
            'engines.chroma.port'           : data => data.engines.chroma.useTestDatabase ? data.engines.chroma.portTest    : data.engines.chroma.portProd
        }
    }
}

/**
 * @summary The plane-member paths this Tier-1 base claims — the enumerable input for the
 * F-invariant's member-coherence clause (`assertPlaneMemberCoherence`): each entry must
 * resolve beneath the resolved `plane.dataRoot` or be explicitly placed per profile.
 * Deliberately excludes `orchestrator.tenantRepoMirrorRoot` (profile-pinned: canonical in
 * base/cloud, explicitly bound by relocated profiles).
 */
export const PLANE_MEMBER_PATHS = Object.freeze([
    'auth.seatTokenRegistryPath',
    'wakeDaemonHeartbeatAlivePath',
    'fleet.dataDir',
    'fleet.instanceRoot',
    'engines.chroma.dataDirProd',
    'heapObservation.dir',
    'orchestrator.dataDir',
    'orchestrator.dbPath',
    'orchestrator.deploymentStateBridge.snapshotPath',
    'orchestrator.recoveryActuator.healAttemptsPath',
    'orchestrator.recoveryActuator.recoveryRunStateDir'
]);

export default Neo.setupClass(ConfigBase);

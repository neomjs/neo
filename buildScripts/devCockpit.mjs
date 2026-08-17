#!/usr/bin/env node
/**
 * @module buildScripts/devCockpit
 * @summary The one-command cockpit boot: `npm run cockpit` supervises BOTH processes a live
 * Fleet-Manager session needs — the webpack dev server (opened DIRECTLY on the AgentOS cockpit
 * surface via `--open-target`) and the fleet HTTP transport (`ai/services/fleet/devFleetServer.mjs`)
 * — so a fresh boot lands on a live cockpit instead of the fail-closed sample seeds.
 *
 * Placement: npm-script entries live in the buildScripts tooling family; the fleet server itself
 * stays a Brain service under `ai/` — this file only supervises.
 *
 * Endpoint authority (one source, fail-closed): the browser consumer (`apps/agentos/app.mjs` →
 * `installFleetBridge`) pins the default `http://127.0.0.1:8083/fleet` endpoint. Until an endpoint
 * propagation seam ships, a non-default `NEO_FLEET_PORT` would boot a server the browser never
 * reaches — so this launcher REFUSES non-default ports with a named reason instead of composing a
 * silently-broken session. (`devFleetServer` keeps honoring the env var for standalone use.)
 *
 * Fleet identity, not "some TCP listener": before reusing a busy port, the launcher PROBES the
 * fleet protocol — an UNAUTHENTICATED `POST /fleet {method:'__cockpit_probe__'}`. On the
 * authenticated transport the ingress guard answers 401 with its exact fail-closed envelope
 * (`{ok:false, error:'fleet: bearer required'}`) BEFORE reading a body byte — deterministic,
 * side-effect-free, and unforgeable-by-accident, so the refusal itself is the identity signature.
 * (The legacy allowlist-rejection signature is still recognized for pre-boundary servers.) A
 * listener that answers anything else is an INCOMPATIBLE occupant and the launcher refuses with a
 * named reason — never a silent second server, never a false reuse.
 *
 * Protocol identity is COMPATIBILITY, never ADOPTION AUTHORITY: the unauthenticated probe proves
 * "a fleet server", not "our fleet server". Because the cockpit page this launcher opens can
 * REDEEM the incumbent's bearer (the armed handshake), adopting an unverified incumbent would let
 * an unauthenticated port-probe hand the page another launch's credential and server-bound viewer.
 * So reuse requires the established authenticated proof — `probeExistingFleetServer`, "same token,
 * same viewer", driven by this environment's pinned `NEO_FLEET_BEARER` + resolved identity claim —
 * and an incumbent this launcher cannot verify is REFUSED with the remediation named, before any
 * page exists to redeem anything.
 *
 * The launch contract (bearer half): this launcher IS the cockpit launch path — it generates the
 * one process-lifetime bearer in its own memory and hands it to the fleet child via env
 * (`NEO_FLEET_BEARER`, the in-memory channel), never via URL, log, or file. The browser side then
 * redeems it itself over the armed handshake (`NEO_FLEET_BEARER_HANDSHAKE` →
 * `GET /fleet/handshake`, exact-Origin-gated): the page fills its designed in-memory slot before
 * app boot with no agent in the loop, so no secret ever persists anywhere restartable. The
 * worker-realm injector (`ViewportController.wireFleetBridge`) stays the explicit-selection seam
 * for Neural Link / tooling flows.
 *
 * Signals: SIGINT/SIGTERM forward to every child this launcher spawned; a webpack exit tears the
 * session down; a fleet-server exit logs loudly while the cockpit degrades to its honest
 * seed/stale states (the operable-cold banner names it on the surface).
 *
 * Live mode (`--live`, the `cockpit:live` script): the same supervised boot, but the fleet child
 * is composed against the containerized plane — one command for the real-fleet journey, no
 * hand-assembled wiring. Before any spawn, the launcher resolves the plane binding
 * ({@link resolveLivePlaneConfig}: `NEO_FLEET_PLANE_BASE` else the canonical local plane address;
 * bearer from `NEO_FLEET_PLANE_BEARER`, else a `NEO_FLEET_PLANE_BEARER_FILE` secret file, else the
 * `gh auth token` identity — the same account the viewer claim resolves through) and probes the
 * plane's MCP ingress unauthenticated ({@link probePlaneIdentity}: the auth guard's 401 IS the
 * plane signature). Bearer custody is deliberate: the value materializes ONLY into the fleet
 * child's env ({@link buildFleetChildEnv}) — never `process.env`, never the webpack child, never
 * a log line. Bearer VALIDITY stays with the fleet entry's plane-side verified admission (one
 * verification authority); this launcher fails fast only on "no plane serving there at all".
 * Live mode never adopts an incumbent fleet transport: the incumbent's plane binding is not
 * observable through `/fleet/probe`, so reuse could silently point the cockpit at the wrong
 * plane — an occupied endpoint refuses with the remediation named.
 */
import {spawn}        from 'node:child_process';
import {readFileSync} from 'node:fs';
import http           from 'node:http';

const FLEET_PORT_DEFAULT = 8083;

/**
 * @summary The cockpit page the composed command opens — the close-target surface, not the
 * dev-server root.
 * @type {String}
 */
export const COCKPIT_OPEN_TARGET = 'apps/agentos/index.html';

/**
 * @summary The wire-protocol identity signature: `dispatchFleetRequest` rejects any method not on
 * the `FLEET_WIRE_METHODS` allowlist with this exact envelope error — deterministic, stable, and
 * side-effect-free (an unlisted method never reaches the control bridge), so it doubles as a
 * fleet-service identity check.
 * @type {String}
 */
export const FLEET_PROBE_METHOD = '__cockpit_probe__';

/**
 * @summary Probes what occupies the fleet endpoint. Three-way, fail-honest:
 *  - `free` — nothing accepts connections (ECONNREFUSED / timeout on connect);
 *  - `fleet` — the occupant speaks the fleet wire protocol (the allowlist-rejection envelope for
 *    {@link FLEET_PROBE_METHOD} comes back HTTP 200 with `ok:false` naming the method);
 *  - `incompatible` — SOMETHING listens but does not answer as a fleet server (wrong body, wrong
 *    shape, non-HTTP, hang). Reuse would silently serve the wrong thing: the caller must refuse.
 * @param {Number} port
 * @param {Number} [timeoutMs=1500]
 * @returns {Promise<{status: ('free'|'fleet'|'incompatible'), detail: String}>}
 */
export function probeFleetEndpoint(port, timeoutMs = 1500) {
    return new Promise(resolve => {
        const body = JSON.stringify({method: FLEET_PROBE_METHOD}),
              req  = http.request({
                  // one-shot socket (no keep-alive pooling): a probe must never hold a server's
                  // close() open — and a supervisor's probe socket outliving the probe is a leak
                  agent  : false,
                  host   : '127.0.0.1',
                  port,
                  path   : '/fleet',
                  method : 'POST',
                  headers: {Connection: 'close', 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body)},
                  timeout: timeoutMs
              }, res => {
                  let data = '';
                  res.on('data', chunk => data += chunk);
                  res.on('end', () => {
                      try {
                          const envelope = JSON.parse(data);
                          // The authenticated boundary's own fail-closed refusal IS the identity:
                          // 401 + the exact ingress envelope, emitted before any body parsing.
                          if (res.statusCode === 401 && envelope && envelope.ok === false && envelope.error === 'fleet: bearer required') {
                              return resolve({status: 'fleet', detail: 'wire-protocol identity confirmed (authenticated ingress refusal)'});
                          }
                          // Legacy pre-boundary signature: the allowlist rejection naming the probe method.
                          if (envelope && envelope.ok === false &&
                              typeof envelope.error === 'string' && envelope.error.includes(FLEET_PROBE_METHOD)) {
                              return resolve({status: 'fleet', detail: 'wire-protocol identity confirmed'});
                          }
                          resolve({status: 'incompatible', detail: `listener answered, but not with the fleet envelope (${data.slice(0, 80)})`});
                      } catch {
                          resolve({status: 'incompatible', detail: 'listener answered non-JSON — not a fleet server'});
                      }
                  });
              });

        req.on('timeout', () => {
            req.destroy();
            resolve({status: 'incompatible', detail: 'listener accepted the connection but never answered — not a fleet server'});
        });
        req.on('error', error => {
            resolve(error.code === 'ECONNREFUSED'
                ? {status: 'free', detail: 'nothing listening'}
                : {status: 'incompatible', detail: `probe error: ${error.code || error.message}`});
        });

        req.end(body);
    });
}

/**
 * @summary The pure boot-plan decision the witnesses pin: given the port authority and the probed
 * endpoint occupant, which processes spawn — or why the launcher refuses.
 *
 * Refusals are fail-closed AND named:
 *  - a non-default port cannot compose a working session (the browser consumer pins the default
 *    endpoint) — refuse with the remedy;
 *  - an incompatible occupant on the fleet port means reuse would serve the wrong thing — refuse
 *    with the occupant detail.
 * @param {Object} options
 * @param {Number} options.fleetPort The resolved fleet port.
 * @param {('free'|'fleet'|'incompatible')} [options.endpointStatus] The probe result (omitted when refused pre-probe).
 * @param {String} [options.endpointDetail=''] The probe detail line.
 * @param {Object|null} [options.reuseProof=null] The AUTHENTICATED reuse verdict for a `fleet`
 *     occupant (`probeExistingFleetServer` shape: `{reusable, reason, viewer?, pid?}`), or `null`
 *     when no proof could be attempted. Protocol identity alone never authorizes reuse: the page
 *     this plan opens can redeem the incumbent's bearer, so an unproven incumbent is refused.
 * @returns {{refuse: Boolean, spawnFleet: Boolean, spawnWebpack: Boolean, notes: String[]}}
 */
export function planCockpitBoot({fleetPort, endpointStatus, endpointDetail = '', reuseProof = null}) {
    if (fleetPort !== FLEET_PORT_DEFAULT) {
        return {
            refuse      : true,
            spawnFleet  : false,
            spawnWebpack: false,
            notes       : [
                `REFUSED: NEO_FLEET_PORT=${fleetPort} — the browser consumer (installFleetBridge) pins the default :${FLEET_PORT_DEFAULT} endpoint, so a non-default port would boot a server the cockpit never reaches.`,
                `Unset NEO_FLEET_PORT (or use the default) to compose a working session; endpoint propagation to the consumer is a tracked follow-up.`
            ]
        };
    }

    if (endpointStatus === 'incompatible') {
        return {
            refuse      : true,
            spawnFleet  : false,
            spawnWebpack: false,
            notes       : [
                `REFUSED: :${fleetPort} is occupied by something that is NOT a fleet server (${endpointDetail}).`,
                `Free the port or stop the foreign process — reusing it would silently serve the wrong thing.`
            ]
        };
    }

    if (endpointStatus === 'fleet') {
        if (reuseProof?.reusable === true) {
            return {
                refuse      : false,
                spawnFleet  : false,
                spawnWebpack: true,
                notes       : [`fleet transport already serving :${fleetPort} — VERIFIED same token, same viewer (${reuseProof.viewer}, pid ${reuseProof.pid}); reusing it; not spawning a second server`]
            };
        }

        return {
            refuse      : true,
            spawnFleet  : false,
            spawnWebpack: false,
            notes       : [
                `REFUSED: :${fleetPort} is occupied by a fleet server this launcher cannot verify (${reuseProof?.reason || 'no authenticated reuse proof was possible'}).`,
                `The cockpit page can redeem the transport's bearer, so an UNVERIFIED incumbent must never become its credential authority — stop that process to let this launcher own a fresh transport, or export the incumbent's exact NEO_FLEET_BEARER (with the matching identity) so the authenticated reuse probe can prove "same token, same viewer".`
            ]
        };
    }

    return {
        refuse      : false,
        spawnFleet  : true,
        spawnWebpack: true,
        notes       : [`starting fleet transport on :${fleetPort}`]
    };
}

/**
 * @summary The canonical local Agent OS plane's published loopback base — the deployment fact the
 * live journey defaults to when `NEO_FLEET_PLANE_BASE` is not pinned. Path-routed `/mc/mcp` +
 * `/kb/mcp` live behind this address in the canonical local profile; the literal names the
 * DEPLOYMENT's published port (never a hash-derived or guessed one), and the env leaf always wins.
 * @type {String}
 */
export const CANONICAL_LOCAL_PLANE_BASE = 'http://127.0.0.1:3102';

/**
 * @summary Default gh-CLI seam for {@link resolveLivePlaneConfig}: `gh auth token` resolves the
 * active gh identity's PAT — the same account the fleet viewer claim resolves through, which is
 * exactly the subject the plane's provider-PAT authority verifies. Captured into launcher memory
 * only: stdout is read, never echoed; a missing/failing gh resolves `''` and the caller decides.
 * @returns {Promise<String>} The trimmed token, or `''` on every failure path.
 */
function readGhAuthToken() {
    return new Promise(resolve => {
        const child = spawn('gh', ['auth', 'token'], {stdio: ['ignore', 'pipe', 'ignore']});
        let   out   = '';

        child.stdout.on('data', chunk => out += chunk);
        child.on('error', () => resolve(''));
        child.on('close', code => resolve(code === 0 ? out.trim() : ''));
    })
}

/**
 * @summary Resolves the live journey's plane binding — the pure decision seam the witnesses pin.
 *
 * Precedence, each half named in the notes so a boot log always shows WHICH source armed the run:
 *  - base: `NEO_FLEET_PLANE_BASE` (an explicit pin always wins) else {@link CANONICAL_LOCAL_PLANE_BASE}.
 *  - bearer: `NEO_FLEET_PLANE_BEARER` (direct) else the `NEO_FLEET_PLANE_BEARER_FILE` secret file
 *    (materialized into the direct env channel for the fleet child — the dev fleet entry reads only
 *    the direct leaf, so the launcher is where the file's value crosses) else `gh auth token`.
 *
 * Fail-closed: a pinned-but-unreadable file REFUSES (a launcher that thinks it pinned a credential
 * must not silently run on a different one), and all-three-empty refuses with the remediation.
 * The bearer VALUE never enters the notes — sources are named, secrets are not.
 *
 * @param {Object}   [options]
 * @param {Object}   [options.env=process.env]        Environment to resolve from.
 * @param {Function} [options.readGhToken]            Injectable gh seam; default {@link readGhAuthToken}.
 * @param {Function} [options.readFile]               Injectable file seam for tests; defaults to `readFileSync`.
 * @returns {Promise<{refuse: Boolean, planeBase: String, planeBearer: String, bearerSource: ('env'|'file'|'gh'|null), notes: String[]}>}
 */
export async function resolveLivePlaneConfig({env = process.env, readGhToken = readGhAuthToken, readFile = null} = {}) {
    const
        planeBase = env.NEO_FLEET_PLANE_BASE?.trim() || CANONICAL_LOCAL_PLANE_BASE,
        notes     = [
            env.NEO_FLEET_PLANE_BASE?.trim()
                ? `plane base pinned via NEO_FLEET_PLANE_BASE (${planeBase})`
                : `plane base defaulted to the canonical local plane (${planeBase}) — pin NEO_FLEET_PLANE_BASE to target a different deployment`
        ];

    let planeBearer = env.NEO_FLEET_PLANE_BEARER?.trim() || '',
        source      = planeBearer ? 'env' : null;

    if (!planeBearer && env.NEO_FLEET_PLANE_BEARER_FILE?.trim()) {
        const bearerFile = env.NEO_FLEET_PLANE_BEARER_FILE.trim();

        try {
            const read = readFile ?? (target => readFileSync(target, 'utf8'));
            planeBearer = String(read(bearerFile)).trim();
            source      = planeBearer ? 'file' : null
        } catch (error) {
            return {
                refuse      : true,
                planeBase,
                planeBearer : '',
                bearerSource: null,
                notes       : [
                    ...notes,
                    `REFUSED: NEO_FLEET_PLANE_BEARER_FILE is pinned but unreadable (${bearerFile}: ${error.message}) — a pinned credential must never silently fall through to another source. Fix the file or unset the variable.`
                ]
            }
        }

        if (!planeBearer) {
            return {
                refuse      : true,
                planeBase,
                planeBearer : '',
                bearerSource: null,
                notes       : [
                    ...notes,
                    `REFUSED: NEO_FLEET_PLANE_BEARER_FILE (${bearerFile}) read empty — a pinned credential must never silently fall through to another source. Fix the file or unset the variable.`
                ]
            }
        }
    }

    if (!planeBearer) {
        planeBearer = (await readGhToken()).trim();
        source      = planeBearer ? 'gh' : null
    }

    if (!planeBearer) {
        return {
            refuse      : true,
            planeBase,
            planeBearer : '',
            bearerSource: null,
            notes       : [
                ...notes,
                'REFUSED: no plane credential resolved — export NEO_FLEET_PLANE_BEARER, point NEO_FLEET_PLANE_BEARER_FILE at a token file, or `gh auth login`. The live journey authenticates to the plane as your gh identity, and a credential it cannot resolve must never become a guess.'
            ]
        }
    }

    notes.push(`plane bearer resolved from ${source === 'env' ? 'NEO_FLEET_PLANE_BEARER' : source === 'file' ? 'NEO_FLEET_PLANE_BEARER_FILE' : '`gh auth token` (the viewer-claim identity)'} — value held in launcher memory, injected into the fleet child only`);

    return {refuse: false, planeBase, planeBearer, bearerSource: source, notes}
}

/**
 * @summary Probes the live plane's MCP ingress WITHOUT credentials: the auth guard's 401 before
 * any session is the plane's identity signature — deterministic, side-effect-free, and exactly as
 * unforgeable-by-accident as the fleet transport's own refusal envelope. Reachability is the only
 * question this probe answers; bearer validity stays with the fleet entry's verified admission.
 * @param {Object}   options
 * @param {String}   options.planeBase                    The resolved plane base URL.
 * @param {Function} [options.fetchImpl=globalThis.fetch] Injectable fetch for tests.
 * @param {Number}   [options.timeoutMs=3000]             Probe patience.
 * @returns {Promise<{status: ('plane'|'unreachable'|'incompatible'), detail: String}>}
 */
export async function probePlaneIdentity({planeBase, fetchImpl = globalThis.fetch, timeoutMs = 3000}) {
    const url = `${planeBase.replace(/\/+$/, '')}/mc/mcp`;

    let response;

    try {
        response = await fetchImpl(url, {
            method : 'POST',
            headers: {'Content-Type': 'application/json'},
            body   : JSON.stringify({jsonrpc: '2.0', id: 0, method: 'initialize', params: {}}),
            signal : AbortSignal.timeout(timeoutMs)
        })
    } catch (error) {
        return {
            status: 'unreachable',
            detail: `no plane answering at ${url} (${error.cause?.code || error.message}) — start the canonical local plane first: docker compose --env-file .env -f ai/deploy/docker-compose.yml -f ai/deploy/docker-compose.local-agent-os.yml --profile cloud --profile ingress --profile fleet up -d --wait (see ai/scripts/lifecycle/local-agent-os/README.md)`
        }
    }

    if (response.status === 401) {
        return {status: 'plane', detail: 'plane identity confirmed (authenticated ingress refusal)'}
    }

    return {status: 'incompatible', detail: `${url} answered HTTP ${response.status} — not the plane's authenticated MCP ingress; check NEO_FLEET_PLANE_BASE`}
}

/**
 * @summary Builds the fleet child's environment — the ONE place launch-resolved credentials cross
 * into a process. The transport bearer + handshake arm always ride; the live plane binding rides
 * only in live mode. Custody rule: this env goes to the fleet child ALONE — the webpack child
 * keeps the launcher's own environment untouched, so a gh/file-materialized plane bearer never
 * reaches a process that does not need it. Pure: the input env is copied, never mutated.
 * @param {Object}      options
 * @param {Object}      options.baseEnv            The launcher's environment to extend.
 * @param {String}      options.fleetBearer        The process-lifetime transport bearer.
 * @param {Object|null} [options.livePlane=null]   The resolved live binding ({planeBase, planeBearer}).
 * @returns {Object} The child environment.
 */
export function buildFleetChildEnv({baseEnv, fleetBearer, livePlane = null}) {
    const env = {...baseEnv, NEO_FLEET_BEARER: fleetBearer, NEO_FLEET_BEARER_HANDSHAKE: '1'};

    if (livePlane) {
        env.NEO_FLEET_PLANE_BASE   = livePlane.planeBase;
        env.NEO_FLEET_PLANE_BEARER = livePlane.planeBearer
    }

    return env
}

/**
 * @summary Process entry: resolve authority, probe, plan, spawn, supervise. The webpack child is
 * spawned via an injectable command seam (`NEO_COCKPIT_WEBPACK_CMD`, JSON `[cmd, ...args]`) so the
 * composed-boot integration witness can substitute a stub without touching the production default.
 * Live mode (`--live`) resolves + probes the plane binding BEFORE anything spawns, never adopts an
 * incumbent fleet transport (its plane binding is not probe-observable), and refuses named.
 * @returns {Promise<void>}
 * @protected
 */
async function main() {
    const
        liveMode  = process.argv.includes('--live'),
        fleetPort = Number(process.env.NEO_FLEET_PORT) || FLEET_PORT_DEFAULT;

    // Live journey first: resolve the plane binding and prove the plane serves BEFORE anything
    // spawns — a misresolved credential or an absent plane fails fast with no browser opened.
    let livePlane = null;

    if (liveMode) {
        const resolved = await resolveLivePlaneConfig({env: process.env});

        resolved.notes.forEach(note => console.log(`[cockpit:live] ${note}`));

        if (resolved.refuse) {
            process.exit(1)
        }

        const planeProbe = await probePlaneIdentity({planeBase: resolved.planeBase});

        if (planeProbe.status !== 'plane') {
            console.error(`[cockpit:live] REFUSED: ${planeProbe.detail}`);
            process.exit(1)
        }

        console.log(`[cockpit:live] ${planeProbe.detail} at ${resolved.planeBase}`);
        livePlane = resolved
    }

    const probe = fleetPort === FLEET_PORT_DEFAULT ? await probeFleetEndpoint(fleetPort) : null;

    // Live mode never adopts an incumbent: the reuse proof binds token + viewer but NOT the
    // incumbent's plane read — an in-process incumbent would silently boot the cockpit off the
    // wrong plane. Refuse named; the operator stops it or takes the in-process journey.
    if (liveMode && probe?.status === 'fleet') {
        console.error(`[cockpit:live] REFUSED: :${fleetPort} already serves a fleet transport — its plane binding is not observable through /fleet/probe, so adopting it could point the cockpit at the wrong plane. Stop the incumbent and re-run, or use \`npm run cockpit\` for the in-process journey.`);
        process.exit(1)
    }

    // A protocol-identity occupant needs the AUTHENTICATED reuse proof before it may become the
    // page's credential authority. The proof can only be attempted when this environment pins the
    // incumbent's bearer (`NEO_FLEET_BEARER`) — the coordinated-launch mode; without a pin the
    // launcher HOLDS no credential to authenticate with, and the plan refuses fail-closed.
    let reuseProof = null;

    if (probe?.status === 'fleet') {
        const {isLocalBearerToken} = await import('../ai/mcp/server/shared/helpers/localBearer.mjs');

        if (isLocalBearerToken(process.env.NEO_FLEET_BEARER)) {
            try {
                // The identity claim rides the shared stdio resolver, whose chain needs the Neo
                // namespace — bootstrap it here, on this rare branch only, exactly like the fleet
                // entrypoints do (the happy paths stay import-light).
                await import('../src/Neo.mjs');
                await import('../src/core/_export.mjs');
                await import('../src/manager/Instance.mjs');

                const {probeExistingFleetServer, resolveFleetViewerClaim} = await import('../ai/services/fleet/fleetLaunchContract.mjs'),
                      viewer                                              = await resolveFleetViewerClaim();

                reuseProof = await probeExistingFleetServer({
                    probeUrl           : `http://127.0.0.1:${fleetPort}/fleet/probe`,
                    bearerToken        : process.env.NEO_FLEET_BEARER,
                    agentIdentityNodeId: viewer.agentIdentityNodeId
                })
            } catch (error) {
                reuseProof = {reusable: false, reason: `reuse-proof attempt failed (${error.message})`}
            }
        } else {
            reuseProof = {reusable: false, reason: 'no NEO_FLEET_BEARER pin in this environment — the launcher holds no credential to authenticate the incumbent with'}
        }
    }

    const
        plan     = planCockpitBoot({
            fleetPort,
            endpointStatus: probe?.status,
            endpointDetail: probe?.detail ?? '',
            reuseProof
        }),
        children = [];

    plan.notes.forEach(note => console.log(`[cockpit] ${note}`));

    if (plan.refuse) {
        process.exit(1);
    }

    if (plan.spawnFleet) {
        // The launch contract: ONE process-lifetime bearer, generated here in launcher memory and
        // handed to the fleet child via env — the in-memory channel. Never logged, never a file.
        // An operator-pinned NEO_FLEET_BEARER wins (the child refuses a malformed pin itself).
        const {generateLocalBearerToken} = await import('../ai/mcp/server/shared/helpers/localBearer.mjs'),
              fleetBearer                = process.env.NEO_FLEET_BEARER || generateLocalBearerToken();

        // Injectable fleet-cmd seam (mirrors NEO_COCKPIT_WEBPACK_CMD): the composed-boot witness
        // substitutes a fixture transport; the production default stays the real devFleetServer.
        let fleetCmd = [process.execPath, 'ai/services/fleet/devFleetServer.mjs'];
        try {
            const override = process.env.NEO_COCKPIT_FLEET_CMD && JSON.parse(process.env.NEO_COCKPIT_FLEET_CMD);
            if (Array.isArray(override) && override.length && override.every(part => typeof part === 'string')) {
                fleetCmd = override;
            }
        } catch {
            // a malformed override is ignored — the production default stands
        }

        // NEO_FLEET_BEARER_HANDSHAKE: this launcher opens the page AND holds the bearer, so it is
        // the one place arming the browser handshake is a coherent custody decision — the page the
        // webpack child opens redeems the secret itself (apps/agentos/fleet/redeemFleetBearerHandshake.mjs),
        // closing the launcher→page hand-off without an agent seam. The live plane binding (when
        // `--live` resolved one) rides the same child-only channel — never the webpack env.
        const fleet = spawn(fleetCmd[0], fleetCmd.slice(1), {
            env  : buildFleetChildEnv({baseEnv: process.env, fleetBearer, livePlane}),
            stdio: 'inherit'
        });

        children.push(fleet);

        fleet.on('exit', code => {
            // fail-closed, not fail-silent: the cockpit keeps serving on seeds/stale states,
            // and the log names the loss so the operator knows why controls degraded
            console.error(`[cockpit] fleet transport exited (code ${code}) — the cockpit degrades to its honest offline states; restart with: npm run ai:fleet-server`)
        })
    }

    let webpackCmd = ['npx', 'webpack', 'serve', '-c', './buildScripts/webpack/webpack.server.config.mjs', '--open-target', COCKPIT_OPEN_TARGET];
    try {
        const override = process.env.NEO_COCKPIT_WEBPACK_CMD && JSON.parse(process.env.NEO_COCKPIT_WEBPACK_CMD);
        if (Array.isArray(override) && override.length && override.every(part => typeof part === 'string')) {
            webpackCmd = override;
        }
    } catch {
        // a malformed override is ignored — the production default stands
    }

    const webpack = spawn(webpackCmd[0], webpackCmd.slice(1), {
        env  : process.env,
        stdio: 'inherit'
    });

    children.push(webpack);

    webpack.on('exit', code => {
        // the app server is the session: tear everything down with it
        children.forEach(child => child !== webpack && !child.killed && child.kill('SIGTERM'));
        process.exit(code ?? 0)
    });

    ['SIGINT', 'SIGTERM'].forEach(signal => {
        process.on(signal, () => {
            children.forEach(child => !child.killed && child.kill(signal))
        })
    })
}

// Process-entry only: never run on import, so the witnesses can import the pure helpers.
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
    main()
}

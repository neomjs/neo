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
 */
import {spawn} from 'node:child_process';
import http    from 'node:http';

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
 * @returns {{refuse: Boolean, spawnFleet: Boolean, spawnWebpack: Boolean, notes: String[]}}
 */
export function planCockpitBoot({fleetPort, endpointStatus, endpointDetail = ''}) {
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
        return {
            refuse      : false,
            spawnFleet  : false,
            spawnWebpack: true,
            notes       : [`fleet transport already serving :${fleetPort} (${endpointDetail}) — reusing it; not spawning a second server`]
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
 * @summary Process entry: resolve authority, probe, plan, spawn, supervise. The webpack child is
 * spawned via an injectable command seam (`NEO_COCKPIT_WEBPACK_CMD`, JSON `[cmd, ...args]`) so the
 * composed-boot integration witness can substitute a stub without touching the production default.
 * @returns {Promise<void>}
 * @protected
 */
async function main() {
    const
        fleetPort = Number(process.env.NEO_FLEET_PORT) || FLEET_PORT_DEFAULT,
        probe     = fleetPort === FLEET_PORT_DEFAULT ? await probeFleetEndpoint(fleetPort) : null,
        plan      = planCockpitBoot({
            fleetPort,
            endpointStatus: probe?.status,
            endpointDetail: probe?.detail ?? ''
        }),
        children  = [];

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
        // closing the launcher→page hand-off without an agent seam.
        const fleet = spawn(fleetCmd[0], fleetCmd.slice(1), {
            env  : {...process.env, NEO_FLEET_BEARER: fleetBearer, NEO_FLEET_BEARER_HANDSHAKE: '1'},
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

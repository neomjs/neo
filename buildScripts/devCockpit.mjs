#!/usr/bin/env node
/**
 * @module buildScripts/devCockpit
 * @summary The one-command cockpit boot: `npm run cockpit` supervises BOTH processes a live
 * Fleet-Manager session needs — the webpack dev server (`npm run server-start`, byte-untouched)
 * and the fleet HTTP transport (`ai/services/fleet/devFleetServer.mjs`) — so a fresh boot lands
 * on a live cockpit instead of the fail-closed sample seeds.
 *
 * Placement: npm-script entries live in the buildScripts tooling family; the fleet server itself
 * stays a Brain service under `ai/` — this file only supervises.
 *
 * Shared-machine honesty (multiple checkouts, one loopback): the fleet port is PROBED first.
 * A port already serving means another checkout (or a prior run) owns the transport — the
 * launcher REUSES it with a named log line and spawns only webpack, never a silent second
 * server fighting over the socket. `NEO_FLEET_PORT` passes through (default 8083, matching
 * `installFleetBridge`'s target).
 *
 * Signals: SIGINT/SIGTERM forward to every child this launcher spawned; a webpack exit tears
 * the session down; a fleet-server exit logs loudly but keeps webpack serving — the cockpit
 * degrades fail-closed to its honest seed/stale states (the operable-cold surface names it).
 */
import {spawn}            from 'node:child_process';
import {createConnection} from 'node:net';

const FLEET_PORT_DEFAULT = 8083;

/**
 * @summary Probes whether a loopback TCP port already accepts connections.
 * @param {Number} port
 * @param {Number} [timeoutMs=750]
 * @returns {Promise<Boolean>} `true` when something is listening.
 */
export function probePort(port, timeoutMs = 750) {
    return new Promise(resolve => {
        const socket = createConnection({host: '127.0.0.1', port});

        const settle = listening => {
            socket.destroy();
            resolve(listening)
        };

        socket.setTimeout(timeoutMs);
        socket.once('connect', () => settle(true));
        socket.once('timeout', () => settle(false));
        socket.once('error',   () => settle(false))
    })
}

/**
 * @summary The pure boot-plan decision the witness pins: given the probed fleet-port state,
 * which processes does the launcher spawn and what does it tell the operator?
 * @param {Object} options
 * @param {Boolean} options.fleetPortBusy The probe result for the fleet port.
 * @param {Number}  options.fleetPort     The resolved fleet port.
 * @returns {{spawnFleet: Boolean, spawnWebpack: Boolean, notes: String[]}}
 */
export function planCockpitBoot({fleetPortBusy, fleetPort}) {
    return {
        spawnFleet  : !fleetPortBusy,
        spawnWebpack: true,
        notes       : fleetPortBusy
            ? [`fleet transport already serving :${fleetPort} — reusing it (another checkout or a prior run); not spawning a second server`]
            : [`starting fleet transport on :${fleetPort}`]
    }
}

/**
 * @summary Process entry: probe, plan, spawn, supervise.
 * @returns {Promise<void>}
 * @protected
 */
async function main() {
    const
        fleetPort = Number(process.env.NEO_FLEET_PORT) || FLEET_PORT_DEFAULT,
        busy      = await probePort(fleetPort),
        plan      = planCockpitBoot({fleetPort, fleetPortBusy: busy}),
        children  = [];

    plan.notes.forEach(note => console.log(`[cockpit] ${note}`));

    if (plan.spawnFleet) {
        const fleet = spawn(process.execPath, ['ai/services/fleet/devFleetServer.mjs'], {
            env  : process.env,
            stdio: 'inherit'
        });

        children.push(fleet);

        fleet.on('exit', code => {
            // fail-closed, not fail-silent: the cockpit keeps serving on seeds/stale states,
            // and the log names the loss so the operator knows why controls degraded
            console.error(`[cockpit] fleet transport exited (code ${code}) — the cockpit degrades to its honest offline states; restart with: npm run ai:fleet-server`)
        })
    }

    const npmCmd  = process.platform === 'win32' ? 'npm.cmd' : 'npm',
          webpack = spawn(npmCmd, ['run', 'server-start'], {
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

// Process-entry only: never run on import, so the witness can import the pure helpers.
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
    main()
}

// The Arm-B Brain supervision module (the recorded topology of the hosting spike — see the
// falsifier-1 verdict on its ticket): the Electron main supervises ONE system-Node child — the
// orchestrator daemon — which supervises the rest of the Agent OS through its own
// ProcessSupervisorService (Chroma, wake/embed/message daemons, scheduled maintenance). Arm A
// (in-process) is falsified in this repo by the native-ABI split: better-sqlite3 builds for ONE
// ABI, and the shared node_modules must keep serving the system-Node dev loop.
//
// Shell-ADR bindings implemented here:
//   §2.1.1  one lifecycle owner — the main process starts/stops the Brain; no daemon fork
//   §2.1.3  injectable data-root — every path below arrives via env leaves, nothing hardcoded
//   §2.1.4  port discipline — the isolated env shifts every port-bearing task off the defaults
//   §2.1.5  teardown on quit — SIGTERM, bounded grace, SIGKILL escalation; settle-or-reject
//
// DEV-MACHINE SAFETY (load-bearing): the orchestrator daemon performs single-instance TAKEOVER —
// on boot it SIGTERMs any PID found in its PID file. A child launched with default env on a
// machine running the canonical Brain would kill it. `buildIsolatedBrainEnv` is therefore not
// politeness; it is the precondition for booting a Brain here at all. The isolation rides the
// config's own by-construction test contract (UNIT_TEST_MODE flips Chroma to the env-bindable
// test coordinates — "a database-name swap alone is not isolation", per the config template).

import {spawn} from 'node:child_process';
import fs      from 'node:fs';
import path    from 'node:path';

const ORCHESTRATOR_ENTRY = 'ai/daemons/orchestrator/daemon.mjs';

/**
 * @summary Builds the isolated environment for a harness-supervised Brain on a dev machine:
 * own orchestrator data-root (PID files, db, logs — makes the daemon's single-instance takeover
 * target ITSELF, never the canonical), Chroma on the test coordinates (own persist dir + port,
 * the config's by-construction isolation), and the dev-server task shifted off :8080 (which the
 * canonical orchestrator owns on shared machines; the harness serves via app:// anyway).
 * @param {Object} options
 * @param {String} options.isolationRoot Directory that will own every mutable path.
 * @returns {Object} env fragment to merge over process.env
 */
export function buildIsolatedBrainEnv({isolationRoot}) {
    return {
        NEO_AI_ORCHESTRATOR_DIR         : path.join(isolationRoot, 'orchestrator'),
        NEO_CHROMA_DATA_DIR_TEST        : path.join(isolationRoot, 'chroma'),
        NEO_CHROMA_PORT_TEST            : '18201',
        NEO_ORCHESTRATOR_DEV_SERVER_PORT: '8093',
        UNIT_TEST_MODE                  : '1'
    }
}

/**
 * @summary Spawns the orchestrator daemon as a supervised system-Node child. The system Node is
 * deliberate (the Arm-B core): the repo's native modules are built for the system ABI, and
 * `ELECTRON_RUN_AS_NODE` children would carry Electron's ABI back into the same conflict. The
 * packaged-app arm (bundled per-target node_modules) is the packaging leaf's problem, recorded
 * on the ticket so it inherits correctly.
 * @param {Object} options
 * @param {String}   options.repoRoot Repo root (cwd for the child; the daemon resolves the rest).
 * @param {Object}   options.env      Env fragment merged over process.env (see {@link buildIsolatedBrainEnv}).
 * @param {Function} [options.onLog]  Receives trimmed child stdout/stderr lines.
 * @returns {import('node:child_process').ChildProcess}
 */
export function startBrain({repoRoot, env, onLog}) {
    const child = spawn(process.env.NEO_HARNESS_NODE_BIN || 'node', [ORCHESTRATOR_ENTRY], {
        cwd  : repoRoot,
        env  : {...process.env, ...env},
        stdio: ['ignore', 'pipe', 'pipe']
    });

    if (onLog) {
        const forward = chunk => String(chunk).split('\n').filter(Boolean).forEach(line => onLog(line));

        child.stdout.on('data', forward);
        child.stderr.on('data', forward)
    }

    return child
}

/**
 * @summary Awaits the Brain's up-observable: the daemon writes `<dataDir>/orchestrator-daemon.pid`
 * containing ITS OWN pid once ownership is established — pid-file-matches-child is therefore the
 * honest "the supervisor owns its root" signal (a foreign pid would mean we probed someone else's
 * Brain, which the isolated env exists to prevent).
 * @param {Object} options
 * @param {import('node:child_process').ChildProcess} options.child
 * @param {String} options.dataDir The child's `NEO_AI_ORCHESTRATOR_DIR`.
 * @param {Number} [options.timeoutMs=20000]
 * @returns {Promise<{up: Boolean, pidFileSeen: Boolean, exitedEarly: Boolean}>}
 */
export function awaitBrainUp({child, dataDir, timeoutMs = 20000}) {
    const pidFile = path.join(dataDir, 'orchestrator-daemon.pid');

    return new Promise(resolve => {
        const t0 = Date.now();

        const timer = setInterval(() => {
            if (child.exitCode !== null) {
                clearInterval(timer);
                resolve({up: false, pidFileSeen: fs.existsSync(pidFile), exitedEarly: true});
                return
            }

            try {
                if (parseInt(fs.readFileSync(pidFile, 'utf8'), 10) === child.pid) {
                    clearInterval(timer);
                    resolve({up: true, pidFileSeen: true, exitedEarly: false});
                    return
                }
            } catch (error) {
                // pid file not written yet — keep polling
            }

            if (Date.now() - t0 > timeoutMs) {
                clearInterval(timer);
                resolve({up: false, pidFileSeen: fs.existsSync(pidFile), exitedEarly: false})
            }
        }, 250)
    })
}

/**
 * @summary Settle-or-reject teardown: SIGTERM (the daemon's cleanup path tears down ITS children),
 * a bounded grace wait, SIGKILL escalation — and the promise always settles with what actually
 * happened, so a caller can gate an exit code on `forced === false`.
 * @param {import('node:child_process').ChildProcess} child
 * @param {Object} [options]
 * @param {Number} [options.graceMs=10000]
 * @returns {Promise<{exited: Boolean, forced: Boolean, code: Number|null, signal: String|null}>}
 */
export function stopBrain(child, {graceMs = 10000} = {}) {
    return new Promise(resolve => {
        if (child.exitCode !== null) {
            resolve({exited: true, forced: false, code: child.exitCode, signal: child.signalCode});
            return
        }

        const killTimer = setTimeout(() => child.kill('SIGKILL'), graceMs);

        child.once('exit', (code, signal) => {
            clearTimeout(killTimer);
            resolve({exited: true, forced: signal === 'SIGKILL', code, signal})
        });

        child.kill('SIGTERM')
    })
}

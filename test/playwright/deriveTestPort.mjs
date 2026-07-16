import {spawnSync} from 'node:child_process';

/**
 * @summary Per-checkout test-port derivation — the isolation half the per-PID data dir always had.
 *
 * A machine running several agent checkouts (plus worktrees) executes unit suites concurrently; a
 * fixed default port serializes them at best and, combined with `reuseExistingServer: false`,
 * wedges every run machine-wide behind one orphaned server at worst. Deriving the default from the
 * CHECKOUT ROOT gives each checkout — and each worktree, whose toplevel is its own path — a stable,
 * distinct port with zero configuration, while an explicit env override always wins (CI pinning and
 * deliberate claims keep working). Stability-per-checkout is deliberate: two runs in ONE checkout
 * share their port intentionally (`workers` config governs concurrency there), so the derivation
 * hashes the path, never the process.
 * @module test/playwright/deriveTestPort
 */

/**
 * @summary Derives a stable port offset from a checkout-root path via FNV-1a.
 *
 * FNV-1a is deliberate: dependency-free, deterministic across processes and Node versions, and
 * well-distributed over short ASCII paths. The result is `base + (hash % range)` — bounded so the
 * whole derived family stays inside an operator-recognizable window above the historic fixed port.
 * @param {String} rootPath Absolute checkout-root path (a worktree's toplevel is its own path).
 * @param {Object} [opts]
 * @param {Number} [opts.base=18180] Bottom of the derived window (the historic fixed default).
 * @param {Number} [opts.range=512] Window size; collisions across checkouts are 1/range per pair.
 * @returns {Number}
 */
export function deriveTestPort(rootPath, {base = 18180, range = 512} = {}) {
    let hash = 0x811c9dc5;

    for (let i = 0; i < rootPath.length; i++) {
        hash ^= rootPath.charCodeAt(i);
        hash  = Math.imul(hash, 0x01000193) >>> 0
    }

    return base + (hash % range)
}

/**
 * @summary Walks forward from a candidate port to the first one that binds, via a synchronous
 * child probe.
 *
 * Playwright configs are evaluated synchronously, but a bind check is async in-process — so the
 * probe runs in a short-lived child (`node -e`) that tries to listen and exits 0 (free) or 1
 * (taken). This is the collision fallback for the 1/range cross-checkout hash-collision case and
 * for a derived port squatted by an orphaned server: the run walks to a free port instead of
 * wedging. Probe failures (spawn errors, timeouts) fail OPEN to the candidate — the derivation is
 * the primary mechanism; the probe only improves the rare unlucky case.
 * @param {Number} startPort First candidate.
 * @param {Object} [opts]
 * @param {Number} [opts.tries=8] How many sequential ports to probe before falling back.
 * @param {String} [opts.host='127.0.0.1'] Interface the test server will bind.
 * @returns {Number} The first probed-free port, or `startPort` when probing is unavailable.
 */
export function probeFreePort(startPort, {tries = 8, host = '127.0.0.1'} = {}) {
    const probeScript =
        'const net=require("net");const s=net.createServer();' +
        's.once("error",()=>process.exit(1));' +
        's.listen(Number(process.argv[1]),process.argv[2],()=>s.close(()=>process.exit(0)));';

    for (let i = 0; i < tries; i++) {
        const port   = startPort + i,
              result = spawnSync(process.execPath, ['-e', probeScript, String(port), host], {timeout: 3000});

        if (result.status === 0) {
            return port
        }

        if (result.error || result.status === null) {
            // Probing itself is unavailable (spawn failure / timeout) — fail open to the candidate:
            // the derivation already isolates checkouts; the probe is only the tiebreaker.
            return startPort
        }
    }

    return startPort
}

/**
 * @plane host
 */
import {execFile} from 'node:child_process';

import {
    buildBackupReceipt,
    utf8SafeTail,
    writeBackupReceipt
} from '../../services/memory-core/helpers/offHostSyncStore.mjs';

export {buildBackupReceipt, writeBackupReceipt};
export {readBackupReceipt, OFFHOST_SYNC_SCHEMA_VERSION} from '../../services/memory-core/helpers/offHostSyncStore.mjs';
// Re-exported, not re-implemented. The config contract lives in the store so the read-only
// deployment-state bridge can reach it without importing this CLI module, which would pull
// `node:child_process` into the diagnostic path. Callers of this script are unaffected.
export {validateOffHostSyncConfig} from '../../services/memory-core/helpers/offHostSyncStore.mjs';

/**
 * @module ai/scripts/maintenance/offHostSync
 * @summary Off-host durability hook for the atomic backup lane: validates the configured sync,
 * executes it as a direct child with a bounded TERM→grace→KILL escalation, and redacts diagnostics.
 * The durable receipt store lives in `services/memory-core/helpers/offHostSyncStore.mjs` (shared
 * with the orchestrator's snapshot projection).
 *
 * Ownership contract: the lease-owning CLI wrapper of `backup.mjs` invokes this module.
 * Exported `runBackup()` never touches it — direct module callers (including disposable-`bundleRoot`
 * tests) must never fire a configured off-host command or overwrite the deployment-global receipt.
 *
 * Truth contract (intake-forged): the lease is bounded at the direct-child boundary
 * (`timeoutMs + killGraceMs`); the sync side effect is NOT claimed bounded — a surviving descendant
 * may continue after a timeout receipt (`completionScope: 'direct-child'`, `descendants: 'unknown'`).
 * `status: 'success'` means the configured command exited 0 for the named bundle — the generic hook
 * cannot attest remote object state.
 */

const BASE_ENV_NAMES = ['PATH', 'HOME', 'USER', 'TMPDIR'],
      MAX_TAIL_BYTES = 4 * 1024;

/**
 * Builds the sync child's environment: minimal base set + exactly the allowlisted names that are
 * set and non-empty. No implicit process.env inheritance.
 * @param {String[]} allowlist
 * @param {Object} [processEnv=process.env]
 * @returns {Object}
 */
export function buildSyncChildEnv(allowlist, processEnv = process.env) {
    const env = {};

    for (const name of BASE_ENV_NAMES) {
        if (typeof processEnv[name] === 'string' && processEnv[name] !== '') env[name] = processEnv[name]
    }
    for (const name of allowlist) {
        if (typeof processEnv[name] === 'string' && processEnv[name] !== '') env[name] = processEnv[name]
    }

    return env
}

/**
 * Redacts allowlisted env VALUES from diagnostic text (longest-value-first, overlap-safe), then
 * bounds the result. Redaction happens before bounding so a secret can never straddle a cut. Every
 * allowlisted value redacts regardless of length — the allowlist IS the credential set; base-env
 * values (PATH/HOME/USER/TMPDIR) redact only when long enough to carry meaning (≥6), so ordinary
 * diagnostics are not mangled.
 * @param {String} text
 * @param {Object} env The exact child env (allowlisted values always redact; base values ≥6 only).
 * @param {Number} [maxBytes=MAX_TAIL_BYTES]
 * @param {String[]} [allowlist=[]] The envAllowlist names (values at these keys always redact).
 * @returns {String}
 */
export function redactAndBound(text, env, maxBytes = MAX_TAIL_BYTES, allowlist = []) {
    let out = String(text ?? '');

    const values = Object.entries(env)
        .filter(([name, value]) => typeof value === 'string' && (allowlist.includes(name) || value.length >= 6))
        .map(([, value]) => value)
        .sort((a, b) => b.length - a.length);

    for (const value of values) {
        if (value.length > 0) out = out.split(value).join('***')
    }

    return utf8SafeTail(out, maxBytes)
}

function substituteArgv(argv, {bundleDir, bundleName}) {
    return argv.map(token =>
        token === '{bundleDir}' ? bundleDir : token === '{bundleName}' ? bundleName : token
    )
}

/**
 * Executes the configured sync as a direct child with a TERM→grace→KILL escalation and returns a
 * truthful outcome. Resolves (never rejects) — every outcome is receipt material.
 * @param {Object} options
 * @param {Object} options.config Validated config (from {@link validateOffHostSyncConfig}.value).
 * @param {String} options.bundleDir Absolute bundle directory.
 * @param {String} options.bundleName Bundle directory name.
 * @param {Function} [options.execFileImpl=execFile] Injection seam for tests.
 * @param {Object} [options.processEnv=process.env]
 * @returns {Promise<Object>} `{status, durationMs, exitCode, signal, terminatedVia, completionScope, descendants, stderrTail}`
 */
export async function runOffHostSync({config, bundleDir, bundleName, execFileImpl = execFile, processEnv = process.env}) {
    const
        startedAt = Date.now(),
        childEnv  = buildSyncChildEnv(config.envAllowlist, processEnv),
        args      = substituteArgv(config.argv, {bundleDir, bundleName});

    return new Promise(resolve => {
        let
            killTimer = null,
            settled   = false;

        // terminatedVia is the signal that actually ENDED the child: a cooperative child dies on
        // execFile's timeout SIGTERM ('sigterm'); an ignoring child dies on our escalation ('sigkill').
        const done = ({status, exitCode = null, signal = null, error = null, terminatedVia = 'exit'}) => {
            if (settled) return;
            settled = true;
            killTimer && clearTimeout(killTimer);

            const stderrTail = redactAndBound(error?.stderr ?? error?.message ?? '', childEnv, MAX_TAIL_BYTES, config.envAllowlist);

            resolve({
                completionScope: 'direct-child',
                descendants    : 'unknown',
                durationMs     : Date.now() - startedAt,
                exitCode,
                signal,
                status,
                stderrTail,
                terminatedVia
            })
        };

        let child;

        try {
            child = execFileImpl(
            config.command,
            args,
            {env: childEnv, shell: false, timeout: config.timeoutMs, killSignal: 'SIGTERM', maxBuffer: 1024 * 1024},
            error => {
                if (error?.killed || error?.signal === 'SIGTERM' || error?.signal === 'SIGKILL') {
                    // The callback fires when the child actually dies: on SIGTERM (cooperative) or
                    // after our SIGKILL escalation (uncooperative).
                    // The callback's signal is the authority: a failed SIGKILL send (ESRCH) can never
                    // be reported as a sigkill completion — only a kill that actually landed counts.
                    done({signal: error.signal ?? 'SIGTERM', status: 'timeout', error, terminatedVia: error?.signal === 'SIGKILL' ? 'sigkill' : 'sigterm'})
                } else if (error) {
                    // A spawn-level ENOENT means no child ever started — null, not an invented signal.
                    done({exitCode: typeof error.code === 'number' ? error.code : null, signal: error.signal ?? null, status: 'failed', error, terminatedVia: error?.code === 'ENOENT' ? null : 'exit'})
                } else {
                    done({exitCode: 0, status: 'success'})
                }
            }
        );

        killTimer = setTimeout(() => {
            if (settled || !child?.pid) return;
            try { process.kill(child.pid, 'SIGKILL') } catch { /* already gone — the callback's signal remains the authority */ }
        }, config.timeoutMs + config.killGraceMs);

        killTimer.unref?.()
        } catch (spawnError) {
            // A synchronous spawn failure means no child ever started — the termination field is
            // null, not an invented signal.
            done({status: 'failed', error: spawnError, terminatedVia: null})
        }
    })
}

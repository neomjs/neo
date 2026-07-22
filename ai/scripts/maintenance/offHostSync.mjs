import {execFile} from 'node:child_process';

import {
    buildBackupReceipt,
    writeBackupReceipt
} from '../../services/memory-core/helpers/offHostSyncStore.mjs';

export {buildBackupReceipt, writeBackupReceipt};
export {readBackupReceipt, OFFHOST_SYNC_SCHEMA_VERSION} from '../../services/memory-core/helpers/offHostSyncStore.mjs';

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

const BASE_ENV_NAMES      = ['PATH', 'HOME', 'USER', 'TMPDIR'],
      ENV_NAME_PATTERN    = /^[A-Z_][A-Z0-9_]*$/,
      MAX_TAIL_BYTES      = 4 * 1024,
      PLACEHOLDER_PATTERN = /^\{(bundleDir|bundleName)\}$/,
      ANY_PLACEHOLDER     = /\{[^}]*\}/,
      TIMEOUT_MIN_MS      = 1000,
      TIMEOUT_MAX_MS      = 30 * 60 * 1000,
      GRACE_MAX_MS        = 60000;

/**
 * Validates the nested offHostSync config keys. This module owns the contract because the keys are
 * plain nested values inside the `maintenance.backup` object leaf (ADR-0019: no leaf() nodes here; ticket-ref-ok: decision-record authority for the config SSOT).
 * @param {Object} [config={}] The `AiConfig.maintenance.backup.offHostSync` subtree (may be undefined).
 * @returns {{enabled: Boolean, error: String|null, value: Object}}
 */
export function validateOffHostSyncConfig(config = {}) {
    const {
        argv          = [],
        command       = '',
        envAllowlist  = [],
        killGraceMs   = 5000,
        timeoutMs     = 600000
    } = config ?? {};

    const fail = error => ({enabled: false, error, value: null});

    // Validate EVERY key before the disabled early-return: a disabled hook with malformed keys is a
    // validation failure, not a silent pass.
    if (config === null || typeof config !== 'object' || Array.isArray(config)) return fail('config must be an object');
    if (typeof command !== 'string') return fail('command must be a string');
    if (command.includes('\0') || argv.some(token => typeof token === 'string' && token.includes('\0'))) {
        return fail('command/argv must not contain NUL bytes')
    }
    if (!Array.isArray(argv) || argv.some(token => typeof token !== 'string')) return fail('argv must be an array of strings');

    for (const token of argv) {
        if (ANY_PLACEHOLDER.test(token) && !PLACEHOLDER_PATTERN.test(token)) {
            return fail(`argv token must be a whole-token placeholder {bundleDir} or {bundleName}, got: ${token}`)
        }
    }

    if (!Array.isArray(envAllowlist) || envAllowlist.some(name => typeof name !== 'string' || !ENV_NAME_PATTERN.test(name))) {
        return fail('envAllowlist entries must match /^[A-Z_][A-Z0-9_]*$/')
    }

    if (!Number.isInteger(timeoutMs) || timeoutMs < TIMEOUT_MIN_MS || timeoutMs > TIMEOUT_MAX_MS) {
        return fail(`timeoutMs must be an integer between ${TIMEOUT_MIN_MS} and ${TIMEOUT_MAX_MS}`)
    }
    if (!Number.isInteger(killGraceMs) || killGraceMs < 0 || killGraceMs > GRACE_MAX_MS) {
        return fail(`killGraceMs must be an integer between 0 and ${GRACE_MAX_MS}`)
    }

    if (command.trim() === '') return {enabled: false, error: null, value: null};

    return {
        enabled: true,
        error  : null,
        value  : {argv, command: command.trim(), envAllowlist, killGraceMs, timeoutMs}
    }
}

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

    return Buffer.byteLength(out, 'utf8') <= maxBytes
        ? out
        : Buffer.from(out, 'utf8').subarray(0, maxBytes).toString('utf8')
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
            killTimer   = null,
            settled     = false,
            sigkillSent = false;

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

        const child = execFileImpl(
            config.command,
            args,
            {env: childEnv, shell: false, timeout: config.timeoutMs, killSignal: 'SIGTERM', maxBuffer: 1024 * 1024},
            error => {
                if (error?.killed || error?.signal === 'SIGTERM' || error?.signal === 'SIGKILL') {
                    // The callback fires when the child actually dies: on SIGTERM (cooperative) or
                    // after our SIGKILL escalation (uncooperative).
                    done({signal: error.signal ?? 'SIGTERM', status: 'timeout', error, terminatedVia: sigkillSent ? 'sigkill' : 'sigterm'})
                } else if (error) {
                    done({exitCode: typeof error.code === 'number' ? error.code : null, signal: error.signal ?? null, status: 'failed', error})
                } else {
                    done({exitCode: 0, status: 'success'})
                }
            }
        );

        killTimer = setTimeout(() => {
            if (settled || !child?.pid) return;
            sigkillSent = true;
            try { process.kill(child.pid, 'SIGKILL') } catch { /* already gone */ }
        }, config.timeoutMs + config.killGraceMs);

        killTimer.unref?.()
    })
}

import {spawnSync}     from 'node:child_process';
import {existsSync}    from 'node:fs';
import path            from 'node:path';
import process         from 'node:process';
import {fileURLToPath} from 'node:url';

const
    __filename = fileURLToPath(import.meta.url),
    repoRoot   = path.resolve(path.dirname(__filename), '../..');

/**
 * @module buildScripts/util/prepare
 * @summary The npm `prepare` lifecycle, made portable. Its predecessor was a POSIX one-liner —
 * `if [ "$npm_config_package_lock_only" = "true" ]; then exit 0; fi; husky && node ...` — and on
 * native Windows, where npm runs lifecycle scripts through `cmd.exe`, the bracket test does not
 * exist, so `npm install` failed before husky ever ran: every native-Windows clone was blocked at
 * the lifecycle, whatever the contributor's platform toolchain.
 *
 * The behavior contract is preserved exactly:
 *
 * - **`--package-lock-only` short-circuits.** The guard exists so lock-maintenance runs mutate
 *   nothing — no hooks, no materialized configs. Preserved, and now expressed in JavaScript
 *   instead of shell test syntax.
 * - **husky first, then `initServerConfigs.mjs`.** Same order as the `&&` chain.
 * - **A husky failure fails the install**, exactly as the chain's left operand did. A lifecycle
 *   that silently proceeds past a failed hook installer is a hookless repo reporting ready.
 */

/**
 * @summary The husky entrypoint, resolved from the package itself — never a PATH shim, so the
 * script works identically under cmd.exe, PowerShell, and POSIX shells.
 * @param {String} [root=repoRoot]
 * @returns {String}
 */
export function resolveHuskyBin(root=repoRoot) {
    const candidate = path.join(root, 'node_modules', 'husky', 'bin.js');

    if (!existsSync(candidate)) {
        throw new Error(`prepare: husky entrypoint not found at '${candidate}' — run with the repo's dependencies installed`);
    }

    return candidate
}

/**
 * @summary Runs the prepare lifecycle. Seams are injected so the contract is testable without
 * mutating hooks or writing configs.
 * @param {Object} [options]
 * @param {String} [options.root=repoRoot]
 * @param {Object} [options.env=process.env]
 * @param {Function} [options.spawnFn=spawnSync]
 * @returns {{skipped: String|null, stage: String, status: Number}}
 */
export function runPrepare({root=repoRoot, env=process.env, spawnFn=spawnSync}={}) {
    if (env.npm_config_package_lock_only === 'true') {
        return {skipped: 'package-lock-only', stage: 'guard', status: 0}
    }

    const huskyResult = spawnFn(process.execPath, [resolveHuskyBin(root)], {cwd: root, env, stdio: 'inherit'});

    if (huskyResult.status !== 0) {
        return {skipped: null, stage: 'husky', status: huskyResult.status ?? 1}
    }

    const configResult = spawnFn(process.execPath, [path.join(root, 'ai', 'scripts', 'setup', 'initServerConfigs.mjs')], {cwd: root, env, stdio: 'inherit'});

    return {skipped: null, stage: 'initServerConfigs', status: configResult.status ?? 1}
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === __filename;

if (isMain) {
    process.exit(runPrepare().status)
}

import {spawnSync}                from 'node:child_process';
import {existsSync, readFileSync} from 'node:fs';
import path                       from 'node:path';
import process                    from 'node:process';
import {fileURLToPath}            from 'node:url';

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
 * - **A husky failure fails the install**, exactly as the chain's left operand did. A lifecycle
 *   that silently proceeds past a failed hook installer is a hookless repo reporting ready.
 */

/**
 * @summary The husky entrypoint, resolved from the package's own `bin` declaration — never a PATH
 * shim, so the script works identically under cmd.exe, PowerShell, and POSIX shells. The
 * declaration is read, not assumed: a husky release that moves its entrypoint resolves through
 * its manifest rather than breaking a hardcode.
 * @param {String} [root=repoRoot]
 * @returns {String}
 */
export function resolveHuskyBin(root=repoRoot) {
    const packagePath = path.join(root, 'node_modules', 'husky', 'package.json');

    if (!existsSync(packagePath)) {
        throw new Error(`prepare: husky package not found at '${packagePath}' — run with the repo's dependencies installed`);
    }

    let bin;

    try {
        bin = JSON.parse(readFileSync(packagePath, 'utf8')).bin;
    } catch (error) {
        throw new Error(`prepare: cannot parse husky's package.json at '${packagePath}' (${error.message})`);
    }

    const entry = typeof bin === 'string' ? bin : bin?.husky ?? Object.values(bin ?? {})[0];

    if (typeof entry !== 'string' || entry.length === 0) {
        throw new Error(`prepare: husky's package.json declares no bin entry at '${packagePath}'`);
    }

    const candidate = path.join(root, 'node_modules', 'husky', entry);

    if (!existsSync(candidate)) {
        throw new Error(`prepare: husky entrypoint '${entry}' not found at '${candidate}' — the package is present but its bin target is missing`);
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

    // A failure-to-LAUNCH is not a status: spawnSync signals it through `result.error` with
    // `status: null`, and with `stdio: 'inherit'` no child exists to print anything — so reading
    // only `status` would surface an install failure as a bare exit 1 with zero diagnostic, the
    // same invisibility class this module exists to remove (and most likely to fire on the
    // platform it serves).
    const spawnChecked = (file, args) => {
        const result = spawnFn(file, args, {cwd: root, env, stdio: 'inherit'});

        if (result.error) {
            throw new Error(`prepare: failed to launch '${path.basename(args[0] ?? file)}' (${result.error.code ?? result.error.message})`)
        }

        return result
    };

    const huskyResult = spawnChecked(process.execPath, [resolveHuskyBin(root)]);

    if (huskyResult.status !== 0) {
        return {skipped: null, stage: 'husky', status: huskyResult.status ?? 1}
    }

    return {skipped: null, stage: 'husky', status: 0}
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === __filename;

if (isMain) {
    process.exit(runPrepare().status)
}

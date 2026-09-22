import {spawnSync}                from 'node:child_process';
import {existsSync, readFileSync} from 'node:fs';
import path                       from 'node:path';
import process                    from 'node:process';
import {fileURLToPath}            from 'node:url';
import isEntryModule              from './isEntryModule.mjs';

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
 *
 * The skills materializer runs here too, never from `postinstall`: npm runs a dependency's
 * `postinstall` inside every consumer's install, where this package's devDependencies do not
 * exist, while a registry or tarball install never runs `prepare`.
 */

/**
 * @summary The lifecycle stages, in order. Each names the devDependency whose manifest declares
 * the bin it runs, so a failed stage reports which tool failed.
 * @type {{stage: String, packageName: String, binName: String}[]}
 */
const stages = [
    {stage: 'husky',       packageName: 'husky',            binName: 'husky'},
    {stage: 'materialize', packageName: 'neo-agent-skills', binName: 'neo-agent-skills-materialize'}
];

/**
 * @summary A package's bin entrypoint, resolved from its own `bin` declaration — never a PATH
 * shim, so the script works identically under cmd.exe, PowerShell, and POSIX shells. The
 * declaration is read, not assumed: a release that moves its entrypoint resolves through its
 * manifest rather than breaking a hardcode.
 * @param {String} packageName
 * @param {String} binName
 * @param {String} [root=repoRoot]
 * @returns {String}
 */
export function resolvePackageBin(packageName, binName, root=repoRoot) {
    const packagePath = path.join(root, 'node_modules', packageName, 'package.json');

    if (!existsSync(packagePath)) {
        throw new Error(`prepare: ${packageName} package not found at '${packagePath}' — run with the repo's dependencies installed`);
    }

    let bin;

    try {
        bin = JSON.parse(readFileSync(packagePath, 'utf8')).bin;
    } catch (error) {
        throw new Error(`prepare: cannot parse ${packageName}'s package.json at '${packagePath}' (${error.message})`);
    }

    const entry = typeof bin === 'string' ? bin : bin?.[binName];

    if (typeof entry !== 'string' || entry.length === 0) {
        throw new Error(`prepare: ${packageName}'s package.json declares no bin entry '${binName}' at '${packagePath}'`);
    }

    const candidate = path.join(root, 'node_modules', packageName, entry);

    if (!existsSync(candidate)) {
        throw new Error(`prepare: ${packageName} entrypoint '${entry}' not found at '${candidate}' — the package is present but its bin target is missing`);
    }

    return candidate
}

/**
 * @summary Runs the prepare lifecycle: the lock-only guard, then each stage in order, stopping at
 * the first failure. Seams are injected so the contract is testable without mutating hooks or
 * writing links.
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

    for (const {stage, packageName, binName} of stages) {
        const result = spawnChecked(process.execPath, [resolvePackageBin(packageName, binName, root)]);

        if (result.status !== 0) {
            return {skipped: null, stage, status: result.status ?? 1}
        }
    }

    return {skipped: null, stage: stages.at(-1).stage, status: 0}
}

if (isEntryModule(import.meta.url)) {
    process.exit(runPrepare().status)
}

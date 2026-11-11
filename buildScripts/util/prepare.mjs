import {spawnSync}                                                 from 'node:child_process';
import {existsSync, readFileSync, realpathSync}                    from 'node:fs';
import path                                                        from 'node:path';
import process                                                     from 'node:process';
import {fileURLToPath}                                             from 'node:url';
import {AGENTS_MD_CLEAN_COMMAND, AGENTS_MD_FILTER, AGENTS_MD_PATH} from './agentsMdPointer.mjs';
import isEntryModule                                               from './isEntryModule.mjs';

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
 * exist, while a registry or tarball install never runs `prepare`. A GIT-dependency install does
 * run it — npm clones the pinned commit into its cache and runs `prepare` there, with `INIT_CWD`
 * naming the consumer's root — so both stages are guarded to this checkout ({@link isDependencyBuild}):
 * husky provisions this repository's hooks and the materializer projects the skills façade into
 * `INIT_CWD`; inside someone else's install that is a cache clone's hooks and a foreign root's
 * façade — the Fleet Manager's pack stage died on exactly that symlink race.
 *
 * The last stage writes `AGENTS.md`, the same kind of projection: the maintainer rules generated
 * from the installed skills package's sections, so a pin bump changes the rules a session loads
 * without anyone committing a file. Git keeps a pointer in that file; the stage registers the clean
 * filter that keeps it there ({@link registerAgentsMdFilter}). It runs what the checkout's
 * {@link AGENTS_MD_SCRIPT} script declares, and `seat:start` runs it too ({@link runStage}): a Start
 * whose lockfile is unchanged installs nothing, and the rules must still be there.
 */

/**
 * @summary The script that declares this checkout's `AGENTS.md`: its repository set and output
 * path. The lifecycle runs what it says instead of restating it, so an install and a Start write
 * exactly what `npm run generate-agents-md` writes.
 * @member {String} AGENTS_MD_SCRIPT
 */
export const AGENTS_MD_SCRIPT = 'generate-agents-md';

/**
 * @summary The arguments of the checkout's {@link AGENTS_MD_SCRIPT} script, the words after its
 * bin. The script must be a plain call of `neo-agent-skills-agents-md`: anything a shell would
 * have to interpret is refused, because the bin runs without a shell.
 * @param {String} [root=repoRoot]
 * @returns {String[]|null} `null` when the checkout declares no such script.
 */
export function agentsMdArgs(root=repoRoot) {
    const manifestPath = path.join(root, 'package.json');

    if (!existsSync(manifestPath)) {
        return null
    }

    let script;

    try {
        script = JSON.parse(readFileSync(manifestPath, 'utf8')).scripts?.[AGENTS_MD_SCRIPT];
    } catch (error) {
        throw new Error(`prepare: cannot parse '${manifestPath}' (${error.message})`)
    }

    if (typeof script !== 'string') {
        return null
    }

    const [binName, ...args] = script.trim().split(/\s+/);

    if (binName !== 'neo-agent-skills-agents-md' || args.some(arg => /[^\w@%+=:,./-]/.test(arg))) {
        throw new Error(`prepare: the '${AGENTS_MD_SCRIPT}' script must be a plain call of neo-agent-skills-agents-md, found '${script}'`)
    }

    return args
}

/**
 * @summary Registers the clean filter that `.gitattributes` names for `AGENTS.md`, so the generated
 * rules in the working copy read as the committed pointer and `git status` stays clean. A root that is
 * not a git checkout has nothing to register.
 * @param {Object} options
 * @param {String} options.root
 * @param {Function} options.spawnFn
 * @returns {Number|null} The `git config` exit status, or `null` outside a checkout.
 */
export function registerAgentsMdFilter({root, spawnFn}) {
    if (!existsSync(path.join(root, '.git'))) {
        return null
    }

    const {status} = spawnFn('git', ['config', '--local', `filter.${AGENTS_MD_FILTER}.clean`, AGENTS_MD_CLEAN_COMMAND], {cwd: root, stdio: 'ignore'});

    if (status !== 0) {
        console.warn(`prepare: could not register the ${AGENTS_MD_FILTER} filter (git config exited ${status}); git will show AGENTS.md as changed`)
    }

    return status
}

/**
 * @summary Records the regenerated `AGENTS.md` in git's stat cache. Git trusts a changed size
 * without reading the file, so a new generation would show as modified until the index sees it
 * through the clean filter. Stages nothing.
 * @param {Object} options
 * @param {String} options.root
 * @param {Function} options.spawnFn
 * @returns {Number|null} The `git update-index` exit status, or `null` outside a checkout.
 */
export function refreshAgentsMd({root, spawnFn}) {
    if (!existsSync(path.join(root, '.git'))) {
        return null
    }

    return spawnFn('git', ['update-index', '-q', '--refresh', '--', AGENTS_MD_PATH], {cwd: root, stdio: 'ignore'}).status
}

/**
 * @summary The lifecycle stages, in order. Each names the devDependency whose manifest declares
 * the bin it runs, so a failed stage reports which tool failed. `args` reads a stage's arguments
 * from the checkout; a `null` answer means the checkout does not declare the stage. `before` runs
 * ahead of a declared stage's bin, and `after` once it succeeded.
 * @type {{stage: String, packageName: String, binName: String, args?: Function, before?: Function, after?: Function}[]}
 */
const stages = [
    {stage: 'husky',       packageName: 'husky',            binName: 'husky'},
    {stage: 'materialize', packageName: 'neo-agent-skills', binName: 'neo-agent-skills-materialize'},
    {
        stage      : 'agents-md',
        packageName: 'neo-agent-skills',
        binName    : 'neo-agent-skills-agents-md',
        args       : agentsMdArgs,
        before     : registerAgentsMdFilter,
        after      : refreshAgentsMd
    }
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
 * @summary Is this `prepare` running inside a consumer's install rather than this checkout's own?
 * npm hands every lifecycle script `INIT_CWD`, the directory the top-level command was invoked
 * from: this checkout under its own `npm install` / `npm ci` / `npm run prepare`, a foreign
 * directory when npm builds this repository as a git dependency in a cache clone. Paths compare by
 * identity (realpath), so a symlinked checkout is still its own root.
 *
 * A root inside a `node_modules` directory is an installed copy, whoever invoked npm: a consumer's
 * `postinstall` that runs `npm i` from inside it hands this script its own root as `INIT_CWD`.
 * @param {Object} options
 * @param {Object} options.env
 * @param {String} options.root
 * @returns {Boolean}
 */
export function isDependencyBuild({env, root}) {
    const identity = dir => {
        const resolved = path.resolve(dir);

        try {
            return realpathSync(resolved)
        } catch {
            return resolved
        }
    };

    const rootIdentity = identity(root);

    return rootIdentity.split(path.sep).includes('node_modules')
        || Boolean(env.INIT_CWD) && identity(env.INIT_CWD) !== rootIdentity
}

/**
 * @summary Runs one lifecycle stage: its bin, resolved from its package's manifest, through `node`
 * with the arguments the stage reads from the checkout. `seat:start` runs the `agents-md` stage
 * through here, so a Start writes exactly what an install writes.
 * @param {String} name The stage, e.g. `'agents-md'`
 * @param {Object} [options]
 * @param {String} [options.root=repoRoot]
 * @param {Object} [options.env=process.env]
 * @param {Function} [options.spawnFn=spawnSync]
 * @returns {{skipped: String|null, stage: String, status: Number}}
 */
export function runStage(name, {root=repoRoot, env=process.env, spawnFn=spawnSync}={}) {
    const entry = stages.find(({stage}) => stage === name);

    if (!entry) {
        throw new Error(`prepare: no stage '${name}'`)
    }

    const {stage, packageName, binName, args=() => [], before, after} = entry,
          stageArgs = args(root);

    if (stageArgs === null) {
        return {skipped: 'not-declared', stage, status: 0}
    }

    const bin = resolvePackageBin(packageName, binName, root);

    before?.({root, spawnFn});

    const result = spawnFn(process.execPath, [bin, ...stageArgs], {cwd: root, env, stdio: 'inherit'});

    // A failure-to-LAUNCH is not a status: spawnSync signals it through `result.error` with
    // `status: null`, and with `stdio: 'inherit'` no child exists to print anything — so reading
    // only `status` would surface an install failure as a bare exit 1 with zero diagnostic, the
    // same invisibility class this module exists to remove (and most likely to fire on the
    // platform it serves).
    if (result.error) {
        throw new Error(`prepare: failed to launch '${path.basename(bin)}' (${result.error.code ?? result.error.message})`)
    }

    result.status === 0 && after?.({root, spawnFn});

    return {skipped: null, stage, status: result.status ?? 1}
}

/**
 * @summary Runs the prepare lifecycle: the lock-only guard, the dependency-build guard, then each
 * stage in order, stopping at the first failure. Seams are injected so the contract is testable
 * without mutating hooks or writing links.
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

    if (isDependencyBuild({env, root})) {
        return {skipped: 'dependency-build', stage: 'guard', status: 0}
    }

    for (const {stage} of stages) {
        const result = runStage(stage, {root, env, spawnFn});

        if (result.status !== 0) {
            return {skipped: null, stage, status: result.status}
        }
    }

    return {skipped: null, stage: stages.at(-1).stage, status: 0}
}

if (isEntryModule(import.meta.url)) {
    process.exit(runPrepare().status)
}

import {spawnSync}                from 'node:child_process';
import {existsSync, readFileSync} from 'node:fs';
import path                       from 'node:path';
import process                    from 'node:process';
import {fileURLToPath}            from 'node:url';

const
    __filename   = fileURLToPath(import.meta.url),
    __dirname    = path.dirname(__filename),
    repoRoot     = path.resolve(__dirname, '../..'),
    manifestPath = path.join(repoRoot, 'package.brain.json'),
    lockPath     = path.join(repoRoot, 'package-lock.brain.json');

/**
 * @module buildScripts/util/installBrain
 * @summary Brain-tier opt-in installer for the two-path install tier: Body default, Brain opt-in.
 *
 * The base `npm install` no longer compiles `better-sqlite3`: the Brain set lives in
 * `package.brain.json`, which npm never reads. This script is the one documented command that
 * overlays the Brain set onto a base install — `npm install --no-save <pins>`, so neither
 * `package.json` nor `package-lock.json` is mutated (a merged manifest would be a permanently
 * dirty tree for every Brain-side seat, and one careless commit would re-tier the repo).
 *
 * **The determinism contract:** install specifiers come from `package-lock.brain.json` — the
 * committed, exact Brain closure (roots + transitive graph), never from live range resolution.
 * `package.brain.json` declares the roots; the brain lock freezes the whole graph, so the same
 * Git SHA installs the same Brain tier on every machine (the plane's rebuild receipts stand on
 * this). The two must agree: editing the manifest without regenerating the lock is a named
 * drift error, not a silent float. Regenerate with:
 *
 *     tmp=$(mktemp -d) && cp package.brain.json "$tmp/package.json" \
 *       && node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync('$tmp/package.json','utf8'));delete p['\$comment'];p.name='neo-brain-tier';p.version='0.0.0';fs.writeFileSync('$tmp/package.json',JSON.stringify(p,null,2))" \
 *       && (cd "$tmp" && npm install --package-lock-only --ignore-scripts --no-audit --no-fund) \
 *       && cp "$tmp/package-lock.json" package-lock.brain.json
 *
 * **The prune contract:** `npm install` and `npm ci` remove extraneous packages (verified on
 * npm 11.12.1 — a plain install prunes what `--no-save` added). So every plain install un-arms
 * the Brain tier. That is deliberate: the Playwright unit config gates the brain projects on
 * Brain-set presence with a named skip line, so a pruned seat skips loudly instead of crashing
 * — and the remedy is always the same one command.
 *
 * Re-run this after any plain `npm install` / `npm ci` / `git pull` that touched dependencies.
 */

/**
 * @summary Reads `package.brain.json` and returns the pinned Brain-set specifiers.
 * Fails with a named parse error rather than npm's opaque one when the manifest is malformed.
 * @param {String} [file=manifestPath]
 * @returns {String[]} e.g. ['better-sqlite3@^12.11.1', ...]
 */
export function resolveBrainInstallPlan(file=manifestPath) {
    if (!existsSync(file)) {
        throw new Error(`install-brain: Brain-tier manifest not found at '${file}'`);
    }

    let manifest;

    try {
        manifest = JSON.parse(readFileSync(file, 'utf8'));
    } catch (error) {
        throw new Error(`install-brain: cannot parse '${file}' as JSON (${error.message})`);
    }

    const devDependencies = manifest?.devDependencies;

    if (!devDependencies || typeof devDependencies !== 'object' || Array.isArray(devDependencies)) {
        throw new Error(`install-brain: '${file}' requires a 'devDependencies' object`);
    }

    const specifiers = Object.entries(devDependencies).map(([name, range]) => `${name}@${range}`);

    if (specifiers.length === 0) {
        throw new Error(`install-brain: '${file}' declares an empty Brain set — nothing to install`);
    }

    return specifiers;
}

/**
 * @summary Reads `package-lock.brain.json` and returns the EXACT Brain closure (roots + transitive
 * graph) as install specifiers — the determinism contract. The lock's root pins must agree with
 * `package.brain.json` exactly: a manifest edited without regenerating the lock is a named drift
 * error with the regeneration command, never a silent float back to live ranges.
 * @param {Object} [options]
 * @param {String} [options.manifestFile=manifestPath]
 * @param {String} [options.lockFile=lockPath]
 * @returns {String[]} exact `name@version` specifiers for the whole closure.
 */
export function resolveBrainInstallClosure({manifestFile=manifestPath, lockFile=lockPath}={}) {
    const pins = Object.fromEntries(
        resolveBrainInstallPlan(manifestFile).map(specifier => {
            const at = specifier.lastIndexOf('@');
            return [specifier.slice(0, at), specifier.slice(at + 1)]
        })
    );

    if (!existsSync(lockFile)) {
        throw new Error(`install-brain: committed Brain closure not found at '${lockFile}' — regenerate it (see this module's JSDoc) rather than installing from live ranges`);
    }

    let lock;

    try {
        lock = JSON.parse(readFileSync(lockFile, 'utf8'));
    } catch (error) {
        throw new Error(`install-brain: cannot parse '${lockFile}' as JSON (${error.message})`);
    }

    const lockRoots = lock?.packages?.['']?.devDependencies || {};

    if (JSON.stringify(lockRoots) !== JSON.stringify(pins)) {
        throw new Error(
            `install-brain: '${manifestFile}' and '${lockFile}' disagree — ` +
            `manifest pins ${JSON.stringify(pins)} vs lock roots ${JSON.stringify(lockRoots)}. ` +
            `Regenerate the closure (see this module's JSDoc) after editing the Brain set.`
        )
    }

    return Object.entries(lock.packages)
        .filter(([entryPath]) => /^node_modules\/(?:@[^/]+\/)?[^/]+$/.test(entryPath))
        .map(([entryPath, entry]) => `${entryPath.slice('node_modules/'.length)}@${entry.version}`)
        .sort();
}

/**
 * @summary The platform's npm launcher, per the repo's established seam (`buildScripts/build/all.mjs`):
 * native Windows has no `npm` binary — only `npm.cmd`, which additionally requires a shell to spawn.
 * @param {String} [platform=process.platform]
 * @returns {String}
 */
export function resolveNpmCommand(platform=process.platform) {
    return platform.startsWith('win') ? 'npm.cmd' : 'npm';
}

/**
 * @summary Builds the npm argument list for the overlay install.
 * @param {String[]} specifiers
 * @param {Object} [options]
 * @param {Boolean} [options.ignoreScripts=false] Forward `--ignore-scripts` — required in
 * script-hostile environments like image builds, where the root `prepare` lifecycle (husky +
 * server-config init) must not run; the caller then owns config materialization explicitly.
 * @returns {String[]}
 */
export function buildNpmArgs(specifiers, {ignoreScripts=false}={}) {
    return ['install', '--no-save', '--no-audit', '--no-fund', ...(ignoreScripts ? ['--ignore-scripts'] : []), ...specifiers];
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === __filename;

if (isMain) {
    const dryRun        = process.argv.includes('--dry-run'),
          ignoreScripts = process.argv.includes('--ignore-scripts'),
          specifiers    = resolveBrainInstallClosure(),
          args          = buildNpmArgs(specifiers, {ignoreScripts});

    if (dryRun) {
        console.log(`${resolveNpmCommand()} ${args.join(' ')}`);
    } else {
        console.log(`[install-brain] Overlaying the Brain tier (${specifiers.length} exact specifiers from the committed closure) onto the base install…`);

        // `shell: true` is load-bearing on win32 (npm.cmd cannot spawn without one) and inert on
        // POSIX — the same shape `build/all.mjs` uses for its npm invocations.
        const result = spawnSync(resolveNpmCommand(), args, {cwd: repoRoot, env: process.env, shell: true, stdio: 'inherit'});

        if (result.status !== 0) {
            throw new Error(`install-brain: npm exited with status ${result.status}`);
        }

        console.log('[install-brain] Brain tier armed: `better-sqlite3`, `chromadb`, `@chroma-core/default-embed`.');
        console.log('[install-brain] Note: any plain `npm install` / `npm ci` prunes the Brain set — re-run `npm run install-brain` afterwards.');
    }
}

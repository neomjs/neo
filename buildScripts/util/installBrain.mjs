import {execFileSync}             from 'node:child_process';
import {existsSync, readFileSync} from 'node:fs';
import path                       from 'node:path';
import process                    from 'node:process';
import {fileURLToPath}            from 'node:url';

const
    __filename   = fileURLToPath(import.meta.url),
    __dirname    = path.dirname(__filename),
    repoRoot     = path.resolve(__dirname, '../..'),
    manifestPath = path.join(repoRoot, 'package.brain.json');

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
 * @summary Builds the npm argument list for the overlay install.
 * @param {String[]} specifiers
 * @returns {String[]}
 */
export function buildNpmArgs(specifiers) {
    return ['install', '--no-save', '--no-audit', '--no-fund', ...specifiers];
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === __filename;

if (isMain) {
    const dryRun     = process.argv.includes('--dry-run'),
          specifiers = resolveBrainInstallPlan(),
          args       = buildNpmArgs(specifiers);

    if (dryRun) {
        console.log(`npm ${args.join(' ')}`);
    } else {
        console.log(`[install-brain] Overlaying the Brain tier (${specifiers.join(', ')}) onto the base install…`);

        execFileSync('npm', args, {cwd: repoRoot, stdio: 'inherit'});

        console.log('[install-brain] Brain tier armed: `better-sqlite3`, `chromadb`, `@chroma-core/default-embed`.');
        console.log('[install-brain] Note: any plain `npm install` / `npm ci` prunes the Brain set — re-run `npm run install-brain` afterwards.');
    }
}

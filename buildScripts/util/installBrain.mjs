import {spawnSync}                from 'node:child_process';
import {
    cpSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync
} from 'node:fs';
import os              from 'node:os';
import path            from 'node:path';
import process         from 'node:process';
import {fileURLToPath} from 'node:url';

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
 * @summary Reads `package-lock.brain.json` and returns the Brain closure as install instructions
 * — `{topLevel, nested}` — resolved from the frozen graph, never from live ranges.
 * `topLevel` holds exact `name@version` specifiers for the overlay phase (including the ONE
 * platform-variant binary matching the install host — its parent's optional range then resolves
 * to the lock's version instead of tomorrow's); `nested` holds range-backed nested pins that must
 * land inside their parent's tree via staged install + copy. The lock's root pins must agree
 * with `package.brain.json` exactly: a manifest edited without regenerating the lock is a named
 * drift error with the regeneration command, never a silent float.
 * @param {Object} [options]
 * @param {String} [options.manifestFile=manifestPath]
 * @param {String} [options.lockFile=lockPath]
 * @param {String} [options.platform=process.platform] Injected for tests.
 * @param {String} [options.arch=process.arch] Injected for tests.
 * @param {Boolean} [options.isMusl] Injected for tests; defaults to a linux-without-glibc probe.
 * @returns {{topLevel: String[], nested: Array<{parent: String, name: String, version: String}>}}
 */
export function resolveBrainInstallClosure({
    manifestFile = manifestPath,
    lockFile     = lockPath,
    platform     = process.platform,
    arch         = process.arch,
    isMusl       = process.platform === 'linux' && !process.report?.getReport?.().header?.glibcVersionRuntime
}={}) {
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

    const topLevel = [],
          nested   = [];

    for (const [entryPath, entry] of Object.entries(lock.packages)) {
        if (!/^node_modules\/(?:@[^/]+\/)?[^/]+(?:\/node_modules\/(?:@[^/]+\/)?[^/]+)*$/.test(entryPath)) continue;

        // Link entries (`.bin` shims) carry no version — their link target is the real record,
        // already in this walk. Skipping them here is what keeps a bogus `name@undefined`
        // specifier out of the install args when a regeneration starts emitting them.
        if (entry.link === true || entry.version === undefined) continue;

        // Platform-variant binaries (sharp/libvips/onnxruntime per-os-cpu builds, fsevents…) need
        // care in BOTH directions: a darwin binary as a direct arg EBADPLATFORMs the linux runner,
        // but skipping the matching variant leaves its parent to resolve the variant's RANGE live
        // — chromadb declares chromadb-js-bindings-* as ^1.3.4, so tomorrow's 1.3.5 would rewrite
        // the graph the lock froze at 1.3.4 (the re-review blocker). The matching variant is
        // therefore passed EXACTLY (satisfying the parent's range with the lock's version);
        // non-matching variants are skipped, and npm never sees an incompatible binary.
        if (entry.cpu || entry.os) {
            const name = entryPath.slice(entryPath.lastIndexOf('node_modules/') + 'node_modules/'.length);

            let matchesPlatform =
                (!entry.os  || entry.os.includes(platform)) &&
                (!entry.cpu || entry.cpu.includes(arch));

            if (matchesPlatform && name.includes('linux')) {
                // libc split: a 'linuxmusl' spelling is musl-only; a plain 'linux'/'linux-*-gnu'
                // spelling yields to its musl sibling on musl systems, and matches everywhere
                // else (a package with no musl sibling pins its only linux variant anywhere).
                const muslSibling = name.replace('linux', 'linuxmusl');

                matchesPlatform = name.includes('linuxmusl')
                    ? isMusl
                    : !isMusl || lock.packages[`node_modules/${muslSibling}`] === undefined;
            }

            if (matchesPlatform) {
                topLevel.push(`${name}@${entry.version}`);
            }
            continue
        }

        const segments = entryPath.slice('node_modules/'.length).split('/node_modules/'),
              name     = segments[segments.length - 1];

        if (segments.length === 1) {
            topLevel.push(`${name}@${entry.version}`);
            continue
        }

        // The lock is consumed as the dependency TREE it freezes, not a flat version list. A
        // nested pin matters exactly when the parent's declaration is a RANGE (tar-fs wants
        // chownr ^1.1.1): left to live resolution, tomorrow's 1.1.5 silently rewrites the graph
        // the lock froze at 1.1.4. A nested pin backed by an EXACT parent declaration
        // (onnxruntime-web → onnxruntime-common@1.22.0-dev) is already frozen — no arg needed.
        const parentPath = 'node_modules/' + segments.slice(0, -1).join('/node_modules/'),
              parent     = lock.packages[parentPath],
              parentDep  = parent?.dependencies?.[name] ?? parent?.optionalDependencies?.[name];

        if (parentDep === entry.version) continue;

        nested.push({parent: parentPath.slice('node_modules/'.length), name, version: entry.version});
    }

    return {nested, topLevel: topLevel.sort()};
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
    const dryRun             = process.argv.includes('--dry-run'),
          ignoreScripts      = process.argv.includes('--ignore-scripts'),
          {nested, topLevel} = resolveBrainInstallClosure(),
          args               = buildNpmArgs(topLevel, {ignoreScripts}),
          isWindows          = process.platform.startsWith('win');

    const runNpm = (npmArgs, cwd) => {
        // The shell is load-bearing ONLY on win32 (npm.cmd cannot spawn without one); on POSIX
        // it is a DEP0190 warning plus unescaped-args concatenation for zero benefit.
        const result = spawnSync(resolveNpmCommand(), npmArgs, {cwd, env: process.env, shell: isWindows, stdio: 'inherit'});

        if (result.status !== 0) {
            throw new Error(`install-brain: npm exited with status ${result.status} (cwd: ${cwd})`);
        }
    };

    if (dryRun) {
        console.log(`${resolveNpmCommand()} ${args.join(' ')}`);
        for (const pin of nested) {
            console.log(`[nested] ${pin.name}@${pin.version} → node_modules/${pin.parent}/node_modules/${pin.name} (staged install + copy)`);
        }
    } else {
        console.log(`[install-brain] Overlaying the Brain tier (${topLevel.length} exact top-level specifiers from the committed closure) onto the base install…`);

        runNpm(args, repoRoot);

        // Nested range-pins land via a staged install + copy: installing inside the parent's own
        // directory would treat the parent as a project root and pull its ENTIRE dependency +
        // devDependency tree along with the pin (that pollution fired for real). The stage keeps
        // the copy to exactly the pinned package. Pure-JS placement: a future nested pin shipping
        // a `bin` needs the parent's `.bin` link step added here deliberately.
        for (const pin of nested) {
            console.log(`[install-brain] Freezing nested pin ${pin.name}@${pin.version} under ${pin.parent}…`);

            const stage  = mkdtempSync(path.join(os.tmpdir(), 'install-brain-nested-')),
                  target = path.join(repoRoot, 'node_modules', pin.parent, 'node_modules', pin.name);

            runNpm(buildNpmArgs([`${pin.name}@${pin.version}`], {ignoreScripts}), stage);
            mkdirSync(path.dirname(target), {recursive: true});
            rmSync(target, {force: true, recursive: true});
            cpSync(path.join(stage, 'node_modules', pin.name), target, {recursive: true});
            rmSync(stage, {force: true, recursive: true});
        }

        console.log('[install-brain] Brain tier armed: `better-sqlite3`, `chromadb`, `@chroma-core/default-embed`.');
        console.log('[install-brain] Note: any plain `npm install` / `npm ci` prunes the Brain set — re-run `npm run install-brain` afterwards.');
    }
}

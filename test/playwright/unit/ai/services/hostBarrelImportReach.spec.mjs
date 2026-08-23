import {test, expect}  from '@playwright/test';
import * as acorn      from 'acorn';
import fs              from 'node:fs';
import path            from 'node:path';
import {fileURLToPath} from 'node:url';

/**
 * The acceptance property for the SDK barrel split is a REACHABILITY claim about the module graph:
 *
 * > a host-side entrypoint must be UNABLE TO CONSTRUCT A DURABLE STORE HANDLE BY IMPORT ALONE.
 *
 * ## Why this walks the graph instead of importing it
 *
 * The obvious instrument — spawn a process with a `module.register()` hook denying the cloud-plane
 * packages and `await import()` the barrel — was tried first and **hung**, and the hang is a property
 * of the code under test rather than of the probe. `ai/services/neural-link/ConnectionService` is a
 * connect-on-init singleton: `Neo.setupClass()` constructs it at module load and `core.Base` schedules
 * `initAsync()` on the next microtask, so importing it reaches for the Bridge during the import — or,
 * where nothing is listening, spawns one. Nine of the host half's imports are `NeuralLink_*`.
 *
 * A witness that hangs or spawns a Bridge in CI is a flake, not a guard. So this asserts at
 * **resolution** rather than evaluation, which is also the more faithful reading: "by import alone" is
 * a statement about what the graph can reach, not about what happens when it runs.
 *
 * The static walk is deterministic, evaluates nothing, spawns nothing, and needs no daemon.
 *
 * ## Why acorn and not a grep
 *
 * `ai/scripts/diagnostics/planePlacementCensus.mjs` records the cost of the shortcut: a naive line
 * match counted doc-comment *mentions* of plane paths as code paths and inflated its census by roughly
 * 20% (61 → 52 once comments were stripped). An import inside a JSDoc block or a commented-out line is
 * not an import. Parsing is the only way to be sure the edge is real.
 *
 * ## What this does NOT establish
 *
 * Static reachability only. A `await import()` computed at runtime from a variable is invisible here
 * by construction — this sees the declared graph. That residue is deliberate and is exactly why the
 * ticket's acceptance property says "by import alone": a dynamic import is a runtime decision the host
 * barrel's shape cannot make for you, and the split is about what the declared graph guarantees.
 */

const
    __dirname = path.dirname(fileURLToPath(import.meta.url)),
    repoRoot  = path.resolve(__dirname, '../../../../..'),

    /**
     * Cloud-plane packages reachable through a STATIC edge, so this walker can see them.
     *
     * Measured, not assumed: a record-and-allow resolve hook over `ai/services.mjs` produced 23
     * distinct external specifiers, of which three are cloud-only — and the static walk finds only
     * these two. `@google/generative-ai` is the one no ticket had named.
     */
    STATICALLY_REACHED_CLOUD_PACKAGES = ['chromadb', '@google/generative-ai'],

    /**
     * The third cloud package, and the reason this file needs a sibling instrument.
     *
     * `better-sqlite3` does NOT appear in the static graph. `ai/graph/storage/SQLite.mjs` reaches it
     * with `await import('better-sqlite3')` inside `initAsync()` — a dynamic edge, invisible here by
     * construction. It still loads on barrel import, because `Neo.setupClass()` constructs the
     * singleton at module load and `core.Base` schedules `initAsync()` on the next microtask: the
     * deferral is syntactic, not behavioural.
     *
     * So the acceptance property is not decidable by static reach alone. This file owns the static
     * half — the packages a host entrypoint can reach *by import alone* — and the eager-lifecycle
     * half needs a runtime witness that is not a static walk. Naming it here so a green run of this
     * spec is never mistaken for the whole property.
     */
    DYNAMICALLY_REACHED_CLOUD_PACKAGE = 'better-sqlite3';

/**
 * @summary Resolves a relative import specifier to a file on disk, mirroring Node's ESM lookup for the
 * shapes this repo uses.
 * @param {String} fromFile Absolute path of the importing module.
 * @param {String} specifier Relative specifier as written.
 * @returns {String|null} Absolute path, or null when nothing resolves.
 */
function resolveRelative(fromFile, specifier) {
    const base = path.resolve(path.dirname(fromFile), specifier);

    for (const candidate of [base, `${base}.mjs`, `${base}.js`, path.join(base, 'index.mjs')]) {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate
    }

    return null
}

/**
 * @summary Walks the STATIC import graph from an entry module, collecting external package specifiers.
 *
 * Static edges only — `import`, `export … from`, and `export * from`. A dynamic `await import()` is
 * deliberately not an edge: it is the demand-driven shape the split is trying to reach, so counting it
 * would make a correctly-lazy dependency look like a violation.
 * @param {String} entryPath Absolute path of the entry module.
 * @returns {{externals: Set<String>, files: Set<String>}}
 */
function walkStaticImports(entryPath) {
    const
        externals = new Set(),
        files     = new Set(),
        queue     = [entryPath];

    while (queue.length) {
        const current = queue.pop();

        if (files.has(current)) continue;
        files.add(current);

        let ast;

        try {
            ast = acorn.parse(fs.readFileSync(current, 'utf8'), {ecmaVersion: 'latest', sourceType: 'module'})
        } catch {
            continue
        }

        for (const node of ast.body) {
            const source = (node.type === 'ImportDeclaration'
                || node.type === 'ExportNamedDeclaration'
                || node.type === 'ExportAllDeclaration') ? node.source : null;

            if (!source?.value) continue;

            const specifier = source.value;

            if (specifier.startsWith('.')) {
                const resolved = resolveRelative(current, specifier);

                resolved && queue.push(resolved)
            } else if (!specifier.startsWith('node:')) {
                externals.add(specifier.startsWith('@')
                    ? specifier.split('/').slice(0, 2).join('/')
                    : specifier.split('/')[0])
            }
        }
    }

    return {externals, files}
}

test.describe('host-plane import reach — a store handle must be unreachable by import alone (#16710)', () => {
    test('the walker sees cloud-plane packages in the current barrel — instrument positive control', () => {
        // Load-bearing. Without this, a "host barrel is clean" result is indistinguishable from a
        // walker that resolves nothing and returns an empty set. The current barrel is KNOWN to reach
        // chromadb (it fails there under a deny hook), so the instrument must see it.
        const {externals, files} = walkStaticImports(path.join(repoRoot, 'ai/services.mjs'));

        expect(files.size, 'the walker must traverse a real graph, not just the entry file').toBeGreaterThan(50);
        expect([...externals], 'the current barrel statically reaches chromadb').toContain('chromadb');
    });

    test('the walker does not count a dynamic import as a static edge', () => {
        // `ai/provider/buildChatModel.mjs` uses `await import('@google/generative-ai')` — the correct
        // demand-driven shape. Counting it would flag a compliant module, so the instrument must
        // distinguish the two. `ai/provider/Gemini.mjs` holds the static import of the same package,
        // which is why the package still appears from the full barrel.
        const {externals} = walkStaticImports(path.join(repoRoot, 'ai/provider/buildChatModel.mjs'));

        expect([...externals], 'a dynamic import is not a static edge').not.toContain('@google/generative-ai');
    });

    test('the two perspective E2Es cannot statically reach the cloud services barrel', () => {
        const
            cloudBarrel = path.join(repoRoot, 'ai/services.mjs'),
            control     = path.join(repoRoot, 'test/playwright/unit/ai/services-resilient-load.spec.mjs'),
            targets     = [
                'test/playwright/e2e/agentos/DemoBPerspectiveToolsNL.spec.mjs',
                'test/playwright/e2e/workstation/WorkstationPerspectivesNL.spec.mjs'
            ];

        expect(
            [...walkStaticImports(control).files],
            'positive control: the graph walk must recognize a real cloud-barrel adopter'
        ).toContain(cloudBarrel);

        for (const target of targets) {
            expect(
                [...walkStaticImports(path.join(repoRoot, target)).files],
                `${target} needs one host Neural Link service; it must not inherit the Brain barrel`
            ).not.toContain(cloudBarrel)
        }
    });

    for (const pkg of STATICALLY_REACHED_CLOUD_PACKAGES) {
        test(`the HOST barrel cannot statically reach ${pkg}`, () => {
            // The acceptance property, one package per test so a regression names the package that
            // crossed rather than reporting a set difference the reader has to decode.
            const {externals} = walkStaticImports(path.join(repoRoot, 'ai/services.host.mjs'));

            expect([...externals].sort(), `the host barrel must not reach ${pkg}`).not.toContain(pkg)
        });

        test(`the CLOUD barrel still reaches ${pkg} — the split is a boundary, not a deletion`, () => {
            // Paired deliberately. Without it, "host is clean" is satisfied just as well by a barrel
            // that reaches nothing because the walk broke, or by someone deleting the dependency
            // outright. The cloud plane is SUPPOSED to hold these; the point was never to remove the
            // store clients, only to make them unreachable from the host side.
            const {externals} = walkStaticImports(path.join(repoRoot, 'ai/services.mjs'));

            expect([...externals].sort(), `the cloud barrel legitimately reaches ${pkg}`).toContain(pkg)
        })
    }

    test('every module that adopts the host barrel stays store-free', () => {
        // A PREDICATE over the population, not a census of today's five migrants. A hardcoded list
        // guards the files someone remembered and silently exempts the next adopter — which is the
        // file most likely to carry the defect. Declaring the host barrel is the membership test, so
        // a module joins this guard by the same act that makes it a host entrypoint.
        const
            aiDir       = path.join(repoRoot, 'ai'),
            buildDir    = path.join(repoRoot, 'buildScripts'),
            cloudBarrel = path.join(repoRoot, 'ai/services.mjs'),
            adopters    = [];

        /**
         * @summary Collects `.mjs` files that statically import the host barrel.
         * @param {String} dir Directory to walk.
         */
        function collectAdopters(dir) {
            for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
                if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;

                const full = path.join(dir, entry.name);

                if (entry.isDirectory()) {
                    collectAdopters(full)
                } else if (entry.name.endsWith('.mjs') && full !== cloudBarrel) {
                    // `ai/services.mjs` is excluded by name, and it is the ONLY exclusion. It imports
                    // the host barrel in order to re-export it, so it satisfies the membership test
                    // while legitimately reaching cloud packages — it IS the cloud root. Cloud
                    // importing host is the permitted direction; the guard exists for the reverse.
                    /from\s+'[^']*services\.host\.mjs'/.test(fs.readFileSync(full, 'utf8'))
                        && adopters.push(full)
                }
            }
        }

        collectAdopters(aiDir);
        collectAdopters(buildDir);

        expect(adopters.length, 'the guard must have a population to guard').toBeGreaterThan(0);

        const offenders = adopters
            .map(file => ({
                file   : path.relative(repoRoot, file),
                reached: [...walkStaticImports(file).externals]
                    .filter(name => STATICALLY_REACHED_CLOUD_PACKAGES.includes(name))
            }))
            .filter(entry => entry.reached.length);

        expect(offenders, 'a host-barrel adopter must not statically reach a cloud-plane package').toEqual([])
    });

    test('the host barrel reaches strictly fewer externals than the cloud barrel', () => {
        const
            host  = walkStaticImports(path.join(repoRoot, 'ai/services.host.mjs')),
            cloud = walkStaticImports(path.join(repoRoot, 'ai/services.mjs'));

        // A containment assertion rather than a pinned count: pinning 14 turns every ordinary
        // dependency addition into a failure of THIS spec, which trains people to edit the number
        // instead of asking why the host plane grew. Containment fails only on the thing that
        // matters — a package the host reaches that the cloud root does not, meaning the split
        // stopped being a subset relationship.
        expect(host.files.size, 'the host walk must traverse a real graph').toBeGreaterThan(50);
        expect(host.files.size, 'the host graph must be materially smaller').toBeLessThan(cloud.files.size);

        const hostOnly = [...host.externals].filter(name => !cloud.externals.has(name));

        expect(hostOnly, 'the host barrel must not introduce externals the cloud root lacks').toEqual([])
    });

    test('the static walk CANNOT see better-sqlite3 — the boundary of this instrument', () => {
        // Not a gap to fix here; the boundary that stops a green run being over-read. `SQLite.mjs`
        // reaches it via `await import()` inside `initAsync()`, which is a dynamic edge — yet it
        // still loads on barrel import because the singleton is eager. Static reach and eager
        // lifecycle are two different properties, and only the first is decidable here.
        const {externals} = walkStaticImports(path.join(repoRoot, 'ai/services.mjs'));

        expect([...externals], 'a dynamic import inside initAsync is invisible to a static walk')
            .not.toContain(DYNAMICALLY_REACHED_CLOUD_PACKAGE);
    });
});

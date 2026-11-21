import {execFileSync}             from 'node:child_process';
import {readFileSync}             from 'node:fs';
import {dirname, join, normalize} from 'node:path';

/**
 * @module buildScripts/util/e2eSpecReach
 * @summary What each e2e spec can reach in the committed tree, so a change can select only the specs it can affect.
 *
 * A spec reaches two things. First, the app or example it navigates and every module that entry imports. Second,
 * the e2e helpers it imports itself. Reach is measured per spec, never per app, because one app's closure is too
 * coarse to select by: Workstation's covers 41 % of `src/`.
 *
 * The map is static, so it cannot see code that loads at runtime by name or by computed path. {@link FOUNDATION}
 * and {@link RUNTIME_LOADING} name those blind spots. A change that falls in one of them has to run every spec,
 * whatever the map says.
 */

/**
 * Where the e2e specs live, relative to the repository root.
 * @member {String} SPEC_DIR
 */
export const SPEC_DIR = 'test/playwright/e2e/';

/**
 * Paths every spec can reach, whatever its closure says.
 *
 * - The core that every class extends.
 * - The worker, main-thread and vdom entry points. They load apps, main-thread addons and workers by name.
 * - The canvas workers.
 * - The top-level `src/*.mjs` entries.
 * - The theme the paint and geometry arms measure.
 * @member {RegExp[]} FOUNDATION
 */
export const FOUNDATION = [
    /^src\/(core|main|manager|util|vdom|worker)\//,
    /^src\/canvas\//,
    /^src\/[^/]+\.mjs$/,
    /^resources\/css\//
];

/**
 * A file containing one of these loads modules that no static closure can name. It loads them by path
 * (`importPath`, `loadModule({path})`, or the module list `container.Base#loadItems` fetches) or by name
 * (`mainThreadAddons`).
 * @member {RegExp} RUNTIME_LOADING
 */
export const RUNTIME_LOADING = /\bimportPath\b|\bloadModule\s*\(\s*\{|\bloadItems\s*\(|\bmainThreadAddons\b/;

// A quoted `.mjs` path. It may be an import, a literal `import()` with or without comments inside the call, or a
// path string such as `module: './Foo.mjs'`. A template literal counts only without interpolation, because an
// interpolated path names no single file.
const MODULE_PATH = /(['"`])((?:\.{1,2}\/|(?:apps|examples|src|test)\/)[^'"`$\s]*\.mjs)\1/g;

// A reference to an app, such as `examples/grid/issues/index.html` or `/docs/index.html`. The e2e specs also
// navigate the component suite's harness apps directly. The second group marks a path that continues with an
// interpolation, such as `examples/grid/${name}`, which can name any entry beneath it.
const APP_REFERENCE = /((?:test\/playwright\/component\/)?\b(?:apps|docs|examples)\/[\w-]+(?:\/[\w-]+)*)(\/\$\{)?/g;

// The theme builder converts these mirrored paths to Neo class namespaces.
const EXAMPLE_CSS    = /^resources\/css\/(?:src|theme-[^/]+)\/(examples\/.+)\.css$/,
      RUNTIME_SOURCE = /^(?:apps|docs|examples|src|test\/playwright\/component\/apps)\/.*\.(?:m?js|html)$|^(?:apps|examples)\/.*\/neo-config\.json$/;

/**
 * @summary Every tracked `.mjs` file a module names by path.
 * @param {Object}      options
 * @param {String}      options.file    The naming module, relative to the repository root.
 * @param {String}      options.text    Its source.
 * @param {Set<String>} options.tracked The committed files, relative to the repository root.
 * @returns {String[]} The named files that exist in the tree, in source order, without duplicates.
 */
export function moduleEdges({file, text, tracked}) {
    const edges = new Set();

    for (const [, , path] of text.matchAll(MODULE_PATH)) {
        const target = normalize(path.startsWith('.') ? join(dirname(file), path) : path);

        tracked.has(target) && edges.add(target)
    }

    return [...edges]
}

/**
 * @summary The app entry a reference resolves to: the deepest directory along it that holds an `app.mjs`.
 * @param {String}      reference Such as `examples/grid/issues/index`, or `docs/index` for `docs/app.mjs`.
 * @param {Set<String>} tracked
 * @returns {String|null} The entry's `app.mjs`, or null when no directory along the reference holds one.
 */
export function entryOf(reference, tracked) {
    const parts = reference.split('/');

    for (let length = parts.length; length >= 1; length--) {
        const entry = `${parts.slice(0, length).join('/')}/app.mjs`;

        if (tracked.has(entry)) {
            return entry
        }
    }

    return null
}

/**
 * @summary Maps every e2e spec to what it can reach in the committed tree.
 *
 * A spec's own closure holds the spec and the `test/playwright/` helpers it reaches through module paths. Every app
 * or example that closure names adds that entry's full closure. A spec that names neither is listed in `unnamed`:
 * the map cannot place it, so no change can rule it out.
 * @param {Object} [options]
 * @param {String} [options.root=process.cwd()] The repository root.
 * @returns {{specs: Map<String, {entries: String[], reach: Set<String>}>, tracked: Set<String>, unnamed: String[], exampleCssOwner: Function}}
 */
export function specReach({root = process.cwd()} = {}) {
    const files     = execFileSync('git', ['-C', root, 'ls-files'], {encoding: 'utf8'}).trim().split('\n'),
          tracked   = new Set(files),
          sources   = new Map(),
          text      = file => sources.get(file) ?? sources.set(file, readFileSync(join(root, file), 'utf8')).get(file),
          edges     = new Map(),
          edgesOf   = file => edges.get(file) ?? edges.set(file, moduleEdges({file, text: text(file), tracked})).get(file),
          closures  = new Map(),
          cssOwners = new Map();
    let hasCssImports;

    // Every module an entry reaches, the entry included
    const closureOf = entry => {
        if (!closures.has(entry)) {
            const seen = new Set([entry]), queue = [entry];

            while (queue.length) {
                for (const next of edgesOf(queue.pop())) {
                    seen.has(next) || (seen.add(next), queue.push(next))
                }
            }

            closures.set(entry, seen)
        }

        return closures.get(entry)
    };

    /**
     * @summary Resolves a tracked stylesheet's sole standalone example using its mirrored, mounted class.
     * @param {String} file The changed stylesheet path in the merge tree.
     * @returns {String|null} The owning app entry, when the available source proves ownership.
     */
    const exampleCssOwner = file => {
        const [, stem] = EXAMPLE_CSS.exec(file) || [];

        if (!stem || !tracked.has(file)) {
            return null
        }

        if (cssOwners.has(stem)) {
            return cssOwners.get(stem)
        }

        const module = `${stem}.mjs`,
              entry  = entryOf(stem, tracked);

        cssOwners.set(stem, null);

        if (!entry || !tracked.has(module)) {
            return null
        }

        try {
            const namespace = `Neo.${stem.replaceAll('/', '.')}`,
                  source    = text(module),
                  names     = [...source.matchAll(/\bclassName\s*:\s*(['"])([^'"\r\n]+)\1/g)];

            if (!source.includes('Neo.setupClass(') || !names.some(([, , name]) => name === namespace) ||
                !closureOf(entry).has(module)) {
                return null
            }

            // An import can apply this sheet through another namespace. Keep that wiring on the full tier.
            hasCssImports ??= files.some(path => path.startsWith('resources/css/') && path.endsWith('.css') && /@import\b/i.test(text(path)));

            if (hasCssImports) {
                return null
            }

            for (const path of files) {
                if (!RUNTIME_SOURCE.test(path) || entryOf(path, tracked) === entry) {
                    continue
                }

                const content = text(path);

                if (content.includes(namespace) || content.includes(`${stem}.css`) ||
                    (path.endsWith('.mjs') && edgesOf(path).some(edge => entryOf(edge, tracked) === entry && closureOf(edge).has(module)))) {
                    return null
                }
            }

            cssOwners.set(stem, entry);
            return entry
        } catch {
            // A missing or unreadable source cannot witness local ownership.
            return null
        }
    };

    const specs   = new Map(),
          unnamed = [];

    for (const spec of files.filter(file => file.startsWith(SPEC_DIR) && file.endsWith('.spec.mjs'))) {
        const own = new Set([spec]), queue = [spec], entries = new Set();

        while (queue.length) {
            for (const next of edgesOf(queue.pop())) {
                next.startsWith('test/playwright/') && !own.has(next) && (own.add(next), queue.push(next))
            }
        }

        for (const file of own) {
            for (const [, reference, interpolated] of text(file).matchAll(APP_REFERENCE)) {
                const beneath = interpolated ? files.filter(path => path.startsWith(`${reference}/`) && path.endsWith('/app.mjs')) : [];

                (beneath.length ? beneath : [entryOf(reference, tracked)]).forEach(entry => entry && entries.add(entry))
            }
        }

        entries.size || unnamed.push(spec);

        const reach = new Set(own);

        for (const entry of entries) {
            closureOf(entry).forEach(file => reach.add(file))
        }

        specs.set(spec, {entries: [...entries].sort(), reach})
    }

    return {specs, tracked, unnamed, exampleCssOwner}
}

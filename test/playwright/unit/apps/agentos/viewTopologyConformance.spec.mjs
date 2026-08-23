import {test, expect}  from '@playwright/test';
import fs              from 'fs';
import path            from 'path';
import {fileURLToPath} from 'url';

/**
 * The view-topology conformance guard: every class file under
 * `apps/agentos/view/**` must (a) be PascalCase — pure-function modules live in
 * `apps/agentos/util/`, never inside the view tree — (b) carry a suffix that names its base
 * FAMILY (resolved by following the `extends` import chain down to the owning `src/` class),
 * and (c) declare a `className` that mirrors its file path exactly. Utility files are PascalCase,
 * registered `Neo.core.Base` classes with the same exact path identity, but deliberately do not
 * inherit the UI-family suffix law. Precedent-following is how the flat fleet folder happened;
 * this witness makes the law a failing test instead of prose.
 */
const
    ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..'),
    VIEW = path.join(ROOT, 'apps/agentos/view'),
    UTIL = path.join(ROOT, 'apps/agentos/util'),

    // src base → the family word a subclass suffix must end with
    FAMILIES = [
        ['src/grid/Container.mjs',      'Grid'],
        ['src/tab/Container.mjs',       'Container'],
        ['src/form/Container.mjs',      'Form'],
        ['src/container/Viewport.mjs',  'Viewport'],
        ['src/container/Panel.mjs',     'Panel'],
        ['src/dashboard/Panel.mjs',     'Panel'],
        ['src/container/Base.mjs',      'Container'],
        ['src/component/Chip.mjs',      'Chip'],
        ['src/component/Base.mjs',      'Component'],
        ['src/list/Chip.mjs',           'List'],
        ['src/list/Component.mjs',      'List'],
        ['src/list/Base.mjs',           'List'],
        ['src/menu/List.mjs',           'List'],
        ['src/button/Base.mjs',         'Button'],
        ['src/controller/Component.mjs','Controller'],
        ['src/state/Provider.mjs',      'StateProvider']
    ];

function* walk(dir) {
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) yield* walk(p);
        else if (entry.name.endsWith('.mjs')) yield p
    }
}

/**
 * Resolve the src-level base file for a view class by following `class X extends Y` +
 * `import Y from '...'` hops through app-local ancestors.
 * @param {String} file
 * @returns {String|null} repo-relative src path, or null when no class/extends exists
 */
function resolveBase(file, depth = 0) {
    if (depth > 6) return {error: 'chain deeper than 6 hops'};

    if (!fs.existsSync(file)) return {error: `base import resolves to a missing file: ${path.relative(ROOT, file)}`};

    const src = fs.readFileSync(file, 'utf8');
    const cls = src.match(/^class \w+ extends (\w+)/m);
    if (!cls) return {error: 'no `class X extends Y` found'};

    const imp = src.match(new RegExp(`import ${cls[1]}(?:\\s*,\\s*\\{[^}]*\\})?\\s+from '([^']+)'`));
    if (!imp) return {error: `unsupported import shape for base "${cls[1]}"`};

    const target = path.resolve(path.dirname(file), imp[1]);
    const rel    = path.relative(ROOT, target);

    return rel.startsWith('src/') ? {base: rel} : resolveBase(target, depth + 1)
}

test.describe('AgentOS view topology conformance (#17559 laws 1 + 3)', () => {

    const
        files     = [...walk(VIEW)],
        utilFiles = [...walk(UTIL)];

    test('the view tree carries no camelCase modules', () => {
        const offenders = files.filter(f => !/^[A-Z]/.test(path.basename(f)));
        expect(offenders.map(f => path.relative(ROOT, f))).toEqual([])
    });

    test('the util tree is PascalCase, class-only, and registered from core.Base', () => {
        const offenders = [];

        for (const file of utilFiles) {
            const relative = path.relative(ROOT, file),
                  source   = fs.readFileSync(file, 'utf8'),
                  resolved = resolveBase(file);

            /^[A-Z]/.test(path.basename(file)) || offenders.push(`${relative} — filename must be PascalCase`);
            resolved.error && offenders.push(`${relative} — base chain unresolved: ${resolved.error}`);
            resolved.base === 'src/core/Base.mjs' || offenders.push(`${relative} — utility base must resolve to src/core/Base.mjs`);
            /export default Neo\.setupClass\(\w+\);/.test(source) || offenders.push(`${relative} — missing default Neo.setupClass registration`);
            /^export\s+(?:const|function|class)\s/m.test(source) && offenders.push(`${relative} — named module export remains`)
        }

        expect(offenders).toEqual([])
    });

    test('every class suffix names its base family — unresolved chains fail closed', () => {
        const offenders = [];

        for (const file of files) {
            const resolved = resolveBase(file);

            if (resolved.error) {
                // FAIL CLOSED: a view file whose base chain the guard cannot resolve is an
                // offender, never a skip — a silent `continue` here is a false-green seam.
                offenders.push(`${path.relative(ROOT, file)} — base chain unresolved: ${resolved.error}`);
                continue
            }

            const family = FAMILIES.find(([p]) => resolved.base === p)?.[1];
            if (!family) { offenders.push(`${path.relative(ROOT, file)} — unmapped base ${resolved.base} (extend FAMILIES)`); continue }

            const name = path.basename(file, '.mjs');
            name.endsWith(family) || offenders.push(`${path.relative(ROOT, file)} — extends ${resolved.base}, suffix must end with "${family}"`)
        }

        expect(offenders).toEqual([])
    });

    test('every className exists and mirrors its file path', () => {
        const offenders = [];

        for (const file of [...files, ...utilFiles]) {
            const src = fs.readFileSync(file, 'utf8');
            const cn  = src.match(/className: '([^']+)'/)?.[1];

            if (!cn) {
                // FAIL CLOSED: a view class without a className cannot be compared — offender.
                offenders.push(`${path.relative(ROOT, file)} — no className config found`);
                continue
            }

            const expected = 'AgentOS.' + path.relative(path.join(ROOT, 'apps/agentos'), file).replace(/\.mjs$/, '').split(path.sep).join('.');
            cn === expected || offenders.push(`${path.relative(ROOT, file)} — className '${cn}' ≠ '${expected}'`)
        }

        expect(offenders).toEqual([])
    });

    test('every additionalThemeFiles entry resolves to a real SCSS chunk', () => {
        // The worker maps an app namespace to its SCSS path by dropping the `view` segment
        // (src/worker/App.mjs insertThemeFiles): `AgentOS.view.fleet.cockpit.SpineBanner` →
        // resources/scss/src/apps/agentos/fleet/cockpit/SpineBanner.scss. A moved chunk whose
        // consumers still request the old namespace is built and never loaded — the runtime
        // styling regression this witness exists to catch.
        const offenders = [];

        for (const file of walk(path.join(ROOT, 'apps/agentos'))) {
            const src = fs.readFileSync(file, 'utf8');

            for (const match of src.matchAll(/additionalThemeFiles\s*:\s*\[([^\]]+)\]/g)) {
                for (const nsMatch of match[1].matchAll(/'([^']+)'/g)) {
                    const ns = nsMatch[1];

                    if (ns.startsWith('Neo.')) continue; // engine themes resolve in src/ scope

                    const segments = ns.split('.'),
                          root     = segments.shift().toLowerCase();

                    segments[0] === 'view' && segments.shift();

                    const scssPath = path.join(ROOT, 'resources/scss/src/apps', root, ...segments) + '.scss';

                    fs.existsSync(scssPath) ||
                        offenders.push(`${path.relative(ROOT, file)} — '${ns}' → missing ${path.relative(ROOT, scssPath)}`)
                }
            }
        }

        expect(offenders).toEqual([])
    });

    test('the fleet SCSS tree carries no root-level chunks — every skin lives in its surface folder', () => {
        const fleetScss = path.join(ROOT, 'resources/scss/src/apps/agentos/fleet');
        const offenders = fs.readdirSync(fleetScss, {withFileTypes: true})
            .filter(entry => entry.isFile())
            .map(entry => `resources/scss/src/apps/agentos/fleet/${entry.name}`);

        expect(offenders).toEqual([])
    })
});

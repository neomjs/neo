import {test, expect}  from '@playwright/test';
import fs              from 'fs';
import path            from 'path';
import {fileURLToPath} from 'url';

/**
 * The view-topology conformance guard: every class file under
 * `apps/agentos/view/**` must (a) be PascalCase — pure-function modules live in
 * `apps/agentos/util/`, never inside the view tree — (b) carry a suffix that names its base
 * FAMILY (resolved by following the `extends` import chain down to the owning `src/` class),
 * and (c) declare a `className` that mirrors its file path exactly. Precedent-following is how
 * the flat fleet folder happened; this witness makes the law a failing test instead of prose.
 */
const
    ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..'),
    VIEW = path.join(ROOT, 'apps/agentos/view'),

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
    if (depth > 6) return null;

    const src = fs.readFileSync(file, 'utf8');
    const cls = src.match(/^class \w+ extends (\w+)/m);
    if (!cls) return null;

    const imp = src.match(new RegExp(`import ${cls[1]}\\s+from '([^']+)'`)) ||
                src.match(new RegExp(`import ${cls[1]},`)) && null;
    if (!imp) return null;

    const target = path.resolve(path.dirname(file), imp[1]);
    const rel    = path.relative(ROOT, target);

    return rel.startsWith('src/') ? rel : resolveBase(target, depth + 1)
}

test.describe('AgentOS view topology conformance (#17559 laws 1 + 3)', () => {

    const files = [...walk(VIEW)];

    test('the view tree carries no camelCase modules', () => {
        const offenders = files.filter(f => !/^[A-Z]/.test(path.basename(f)));
        expect(offenders.map(f => path.relative(ROOT, f))).toEqual([])
    });

    test('every class suffix names its base family', () => {
        const offenders = [];

        for (const file of files) {
            const base = resolveBase(file);
            if (!base) continue; // no class/extends (should not happen; camelCase test owns modules)

            const family = FAMILIES.find(([p]) => base === p)?.[1];
            if (!family) { offenders.push(`${path.relative(ROOT, file)} — unmapped base ${base} (extend FAMILIES)`); continue }

            const name = path.basename(file, '.mjs');
            name.endsWith(family) || offenders.push(`${path.relative(ROOT, file)} — extends ${base}, suffix must end with "${family}"`)
        }

        expect(offenders).toEqual([])
    });

    test('every className mirrors its file path', () => {
        const offenders = [];

        for (const file of files) {
            const src = fs.readFileSync(file, 'utf8');
            const cn  = src.match(/className: '([^']+)'/)?.[1];
            if (!cn) continue;

            const expected = 'AgentOS.' + path.relative(path.join(ROOT, 'apps/agentos'), file).replace(/\.mjs$/, '').split(path.sep).join('.');
            cn === expected || offenders.push(`${path.relative(ROOT, file)} — className '${cn}' ≠ '${expected}'`)
        }

        expect(offenders).toEqual([])
    })
});

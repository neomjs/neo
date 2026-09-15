import {test, expect} from '@playwright/test';

/**
 * What is asserted is the RULE — a function binding at module scope in a file that declares a class —
 * and the fact that the baseline ratchet fails both ways. Message text is not asserted.
 *
 * Two arms exist specifically because the census this guard replaced used a line-anchored grep and
 * this guard does not: `export function f() {}` has no `function` at line start, and
 * `const html = (strings, ...values) => {}` defeats a character-class param matcher. Both are real
 * shapes in `src/` today, and both were invisible to that census. If this guard is ever "simplified"
 * back to a regex, these two go red first, which is the point of naming them.
 */
test.describe('check-class-module-scope — logic stays where an override can reach it', () => {
    let findModuleScopeFunctions, diffAgainstBaseline, describeAddedHelpers;

    test.beforeAll(async () => {
        ({findModuleScopeFunctions, diffAgainstBaseline, describeAddedHelpers} =
            await import('../../../../../buildScripts/util/check-class-module-scope.mjs'));
    });

    test('FIRES: a function declaration beside a class', () => {
        const findings = findModuleScopeFunctions(
            `import Base from '../core/Base.mjs';

function byWeight(a, b) {
    return a.weight - b.weight
}

class Container extends Base {}
`,
            'src/container/Base.mjs'
        );

        expect(findings).toHaveLength(1);
        expect(findings[0].name).toBe('byWeight');
        expect(findings[0].line).toBe(3)
    });

    test('FIRES: an arrow bound to a module-scope const beside a class', () => {
        const findings = findModuleScopeFunctions(
            `const toFlexFactor = value => value / 100;

class SortZone {}
`,
            'src/draggable/dashboard/SortZone.mjs'
        );

        expect(findings).toHaveLength(1);
        expect(findings[0].name).toBe('toFlexFactor')
    });

    test('FIRES: `export function`, which a line-anchored grep cannot see', () => {
        // The shape in the six src/ai/client/*Service.mjs files. An exported helper beside a class is
        // exactly as unreachable from a subclass as a private one — the rule is about override reach,
        // not visibility — so exporting it must not be an escape hatch.
        const findings = findModuleScopeFunctions(
            `export function registerDataServiceMethods(serviceMap, service) {}

class DataService {}
`,
            'src/ai/client/DataService.mjs'
        );

        expect(findings).toHaveLength(1);
        expect(findings[0].name).toBe('registerDataServiceMethods')
    });

    test('FIRES: an arrow whose rest parameter defeats a character-class matcher', () => {
        // `const html = (strings, ...values) => {…}` in src/functional/util/html.mjs. The census regex
        // required params matching [A-Za-z_, ]*, and `...` is neither.
        const findings = findModuleScopeFunctions(
            `class HtmlTemplate {}

const html = (strings, ...values) => new HtmlTemplate(strings, values);
`,
            'src/functional/util/html.mjs'
        );

        expect(findings).toHaveLength(1);
        expect(findings[0].name).toBe('html')
    });

    test('PASSES: constants and lookup tables at module scope', () => {
        // Nobody overrides data. This is the exemption the rule depends on staying narrow: if data at
        // module scope were convicted, every class file in the tree would be a violation.
        expect(findModuleScopeFunctions(
            `const livenessPollDefault = 15000;
const terminalStates = new Set(['Completed', 'Failed']);
const routes = {home: '/', learn: '/learn'};

class Manager {}
`,
            'src/manager/Base.mjs'
        )).toEqual([])
    });

    test('PASSES: a function module that declares no class', () => {
        // A genuine src/util/** function library has no class for a helper to escape from, so there is
        // nothing to override and nothing to convict. The class gate expresses that without an
        // allowlist that would drift out of date.
        expect(findModuleScopeFunctions(
            `export function add(arr, items) {}
export function remove(arr, items) {}
const helper = () => {};
`,
            'src/util/functions.mjs'
        )).toEqual([])
    });

    test('PASSES: methods on the class, which is the whole prescription', () => {
        expect(findModuleScopeFunctions(
            `class Base {
    static sort(a, b) { return a - b }

    onResize() {}

    get size() { return this._size }
}
`,
            'src/component/Base.mjs'
        )).toEqual([])
    });

    test('PASSES: a function nested inside another function', () => {
        // Module scope is the defect. A callback inside a method is reachable through whatever calls
        // it and is not an override seam anyone lost.
        expect(findModuleScopeFunctions(
            `class Base {
    run() {
        const inner = () => 1;

        return [1, 2].map(function double(n) { return n * 2 }).concat(inner())
    }
}
`,
            'src/core/Base.mjs'
        )).toEqual([])
    });

    test('FIRES: `export default function`, one keyword away from the named form', () => {
        // An earlier version unwrapped only `ExportNamedDeclaration`, so this shape was a silent escape
        // hatch — it reaches a subclass exactly as little as the named form does.
        const findings = findModuleScopeFunctions(
            `class Base {}\n\nexport default function helper() {}\n`,
            'src/component/Base.mjs'
        );

        expect(findings).toHaveLength(1);
        expect(findings[0].name).toBe('helper')
    });

    test('FIRES: an anonymous default-exported function, keyed as `default`', () => {
        // Both shapes bind a function at module scope. The key has to be stable for the baseline, so
        // an anonymous one is recorded as `default` rather than skipped for lacking an id.
        expect(findModuleScopeFunctions(`class Base {}\nexport default function () {}\n`, 'src/a.mjs')[0]?.name).toBe('default');
        expect(findModuleScopeFunctions(`class Base {}\nexport default () => {};\n`,      'src/b.mjs')[0]?.name).toBe('default')
    });

    test('PASSES: `export default class`, which is a class and not a helper', () => {
        // Non-vacuity for the two arms above: widening to ExportDefaultDeclaration must not convict
        // every default export.
        expect(findModuleScopeFunctions(`export default class Base {}\n`, 'src/util/Rectangle.mjs')).toEqual([])
    });

    test('PASSES: the Neo.setupClass export', () => {
        expect(findModuleScopeFunctions(
            `class Base {}

export default Neo.setupClass(Base);
`,
            'src/core/Base.mjs'
        )).toEqual([])
    });

    test('PASSES: unparseable source, which check-parse owns', () => {
        expect(findModuleScopeFunctions('class {{{', 'src/broken.mjs')).toEqual([])
    });

    test('the ratchet fails UP: a helper the baseline does not cover', () => {
        const findings = findModuleScopeFunctions(
            `function fresh() {}

class Base {}
`,
            'src/component/Base.mjs'
        );

        const {added, burnedDown} = diffAgainstBaseline(findings, []);

        expect(added).toHaveLength(1);
        expect(added[0].name).toBe('fresh');
        expect(burnedDown).toEqual([])
    });

    test('the ratchet fails DOWN: a baselined helper that is gone', () => {
        // The interesting failure mode. A burndown that only fails upward drifts above the real count
        // and becomes a record of things that used to be true — exactly what the hand census did with
        // TopologyReconciler.mjs, which it listed at ten helpers the file no longer had.
        const {added, burnedDown} = diffAgainstBaseline(
            [],
            [{file: 'src/dashboard/dock/model/TopologyReconciler.mjs', name: 'reconcile', count: 1}]
        );

        expect(added).toEqual([]);
        expect(burnedDown).toHaveLength(1);
        expect(burnedDown[0].name).toBe('reconcile')
    });

    test('the CLI entry predicate survives a checkout path containing a space', async () => {
        // The worst failure direction there is: the guard exits 0 having checked nothing.
        // `import.meta.url` percent-encodes and resolves symlinks;
        // `process.argv[1]` does neither, so the string comparison is false and the main block never
        // runs. Executed rather than asserted about, in a real directory whose name has a space.
        const {execFileSync} = await import('node:child_process'),
              fsMod          = await import('node:fs'),
              osMod          = await import('node:os'),
              pathMod        = await import('node:path');

        // realpath the tmpdir first: on macOS `/tmp` is a symlink to `/private/tmp`, which makes BOTH
        // predicates false and would hide the difference this arm exists to show.
        const base   = fsMod.mkdtempSync(pathMod.join(fsMod.realpathSync(osMod.tmpdir()), 'neo-entry-')),
              spaced = pathMod.join(base, 'has space'),
              probe  = pathMod.join(spaced, 'probe.mjs');

        fsMod.mkdirSync(spaced);
        fsMod.writeFileSync(probe, [
            `import path            from 'node:path';`,
            `import {fileURLToPath} from 'node:url';`,
            `const fragile = import.meta.url === \`file://\${process.argv[1]}\`;`,
            `const robust  = Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);`,
            `console.log(JSON.stringify({fragile, robust}));`
        ].join('\n'));

        try {
            const observed = JSON.parse(execFileSync(process.execPath, [probe], {encoding: 'utf8'}).trim());

            // NEGATIVE control: the form this guard originally copied does not fire here.
            expect(observed.fragile, 'the `file://` string form misses a space-containing path').toBe(false);

            // POSITIVE control: the form this guard now uses does.
            expect(observed.robust, 'the resolve/fileURLToPath form fires').toBe(true)
        } finally {
            fsMod.rmSync(base, {recursive: true, force: true})
        }
    });

    test('the report names a file, a line and the helper', () => {
        // describeAddedHelpers reads the RAW findings, because the tally drops `line` — the sibling
        // guard shipped `:undefined` where the location belongs for exactly that reason.
        const findings = findModuleScopeFunctions(
            `const helper = () => {};

class Base {}
`,
            'src/component/Base.mjs'
        );

        const {added} = diffAgainstBaseline(findings, []),
              lines   = describeAddedHelpers(added, findings);

        expect(lines).toHaveLength(1);
        expect(lines[0]).toContain('src/component/Base.mjs:1');
        expect(lines[0]).toContain('helper')
    })
});

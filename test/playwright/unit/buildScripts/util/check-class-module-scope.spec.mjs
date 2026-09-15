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

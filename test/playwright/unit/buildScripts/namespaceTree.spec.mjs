import {test, expect} from '@playwright/test';

/**
 * Each arm below fails for a DIFFERENT reason on the previous implementation, and neither substitutes
 * for the other: `__proto__` is the famous key and the only one needing an adversary, while
 * `constructor` and `toString` collide with nothing but an unlucky class name. A guard listing only
 * `__proto__` closes the alert and leaves the reachable cases live — which is why they are separate.
 *
 * @see https://github.com/neomjs/neo/issues/17494
 */
test.describe('namespaceTree — own-property traversal, not inherited', () => {
    let getNamespace, setNamespace;

    test.beforeAll(async () => {
        ({getNamespace, setNamespace} = await import('../../../../buildScripts/docs/namespaceTree.mjs'));
    });

    test.afterEach(() => {
        // If an arm ever DID pollute, every later arm in the file would inherit it and the failure
        // would surface somewhere unrelated. Clean up so a regression is attributed to its own arm.
        delete Object.prototype.polluted;
        delete Object.prototype.toString.x;
        delete Object.prototype.constructor.b;
    });

    test('a `constructor` segment does not reach Object.prototype.constructor', () => {
        // Needs no adversary: the old truthiness check read the INHERITED `constructor` as an
        // existing node, skipped creating one, and descended into the global.
        expect(() => setNamespace({}, 'a.constructor.b', 'X')).toThrow(/constructor/);
        expect(Object.prototype.constructor.b, 'the global was not written').toBeUndefined()
    });

    test('a `__proto__` segment does not pollute every object', () => {
        expect(() => setNamespace({}, '__proto__.polluted', 'Z')).toThrow(/__proto__/);
        expect(({}).polluted, 'no object in the process gained the property').toBeUndefined()
    });

    test('an inherited NON-forbidden name still creates a real node — the case a keyword list misses', () => {
        // `toString` is not in the forbidden set and must not be: it is a legal namespace segment.
        // The old code still broke on it, because the guard consulted the inherited function. This
        // is the arm that proves the fix is `hasOwn`, not merely a denylist — a denylist-only
        // implementation passes both arms above and fails here.
        const tree = {};

        setNamespace(tree, 'toString.x', 'Y');

        expect(Object.hasOwn(tree, 'toString'), 'an own node was created').toBe(true);
        expect(tree.toString.x, 'the value landed on the tree').toBe('Y');
        expect(Object.prototype.toString.x, 'and not on the global').toBeUndefined()
    });

    test('the throw names the offending path, not just the segment', () => {
        // A build-time authoring error is only actionable if it says which namespace produced it.
        expect(() => setNamespace({}, 'Neo.foo.prototype.bar', 1))
            .toThrow(/Neo\.foo\.prototype\.bar/)
    });

    test('THE PRODUCTION SEQUENCE: a legal inherited leaf survives get-before-set', () => {
        // The arm that was missing, and the reason the writer-only fix was incomplete. The generator
        // does `namespace = getNamespace(tree, path) || {}` and then attaches `classData` to whatever
        // came back. With a truthy-checking reader and a parent node an earlier class already
        // created, `Neo.Foo.toString` resolved to Object.prototype.toString ITSELF — measured:
        // `namespace === Object.prototype.toString` true, `classData` landed on the global, and the
        // docs leaf serialized as `undefined`.
        //
        // A direct `toString.x` write arm cannot see this: the corruption happens on the READ.
        const neoTree = {};

        // An earlier class creates the intermediate node — ordinary production ordering.
        setNamespace(neoTree, 'Neo.Foo.Bar', {});

        const namespace = getNamespace(neoTree, 'Neo.Foo.toString') || {};

        expect(namespace, 'the reader must not hand back the inherited function')
            .not.toBe(Object.prototype.toString);

        setNamespace(neoTree, 'Neo.Foo.toString', namespace);
        namespace.classData = {name: 'Neo.Foo.toString'};

        expect(Object.prototype.toString.classData, 'the global is untouched').toBeUndefined();
        expect(neoTree.Neo.Foo.toString.classData?.name, 'and classData landed on the tree')
            .toBe('Neo.Foo.toString');

        // Serializable: the failure mode was a leaf that vanished from JSON while reads succeeded.
        expect(JSON.parse(JSON.stringify(neoTree)).Neo.Foo.toString.classData.name)
            .toBe('Neo.Foo.toString')
    });

    test('the reader returns null for inherited and prototype keys rather than the global', () => {
        const tree = {};

        setNamespace(tree, 'a.b', 1);

        expect(getNamespace(tree, 'a.toString'),    'inherited leaf').toBeNull();
        expect(getNamespace(tree, '__proto__'),     'prototype key').toBeNull();
        expect(getNamespace(tree, 'a.constructor'), 'constructor key').toBeNull();
        expect(getNamespace(tree, 'a.b'),           'a real own path still resolves').toBe(1)
    });

    test('ordinary nested namespaces are unchanged — the non-vacuity control', () => {
        // Without this, an implementation that rejected everything would pass every arm above.
        const tree = {};

        setNamespace(tree, 'Neo.component.Button', {ntype: 'button'});
        setNamespace(tree, 'Neo.component.Label',  {ntype: 'label'});
        setNamespace(tree, 'Neo.Neo', 'root');

        expect(tree).toEqual({
            Neo: {
                component: {Button: {ntype: 'button'}, Label: {ntype: 'label'}},
                Neo      : 'root'
            }
        })
    });

    test('a NON-STRING segment cannot slip past the denylist by coercion', () => {
        // Found by attacking my own fix after CodeQL flagged the fixed function. `Set.has` compares
        // raw values; a property write stringifies its key. So an object whose `toString` returns
        // `'__proto__'` passed the guard and then hit the setter on assignment.
        //
        // It never reached `Object.prototype` — it replaced the TREE's prototype — but the result is
        // the failure this module exists to prevent: `JSON.stringify(tree)` returned `{}` while
        // `tree.x` read the injected value. A corrupted tree that serializes as empty.
        const hostile = {toString: () => '__proto__'};

        expect(() => setNamespace({}, [hostile, 'x'], 'PWNED')).toThrow(/__proto__/);

        const tree = {};

        try { setNamespace(tree, [hostile, 'x'], 'PWNED') } catch {}

        expect(Object.getPrototypeOf(tree), 'the tree prototype is intact').toBe(Object.prototype);
        expect(tree.x, 'and nothing was injected').toBeUndefined()
    });

    test('an array path behaves identically to its dotted form', () => {
        // Both call shapes exist at the call sites, so a fix applied to one is not applied to both.
        const dotted = {}, arrayed = {};

        setNamespace(dotted,  'a.b.c', 1);
        setNamespace(arrayed, ['a', 'b', 'c'], 1);

        expect(arrayed).toEqual(dotted);
        expect(() => setNamespace({}, ['a', '__proto__'], 1)).toThrow(/__proto__/)
    });
});

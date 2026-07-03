import {setup} from '../../../setup.mjs';

const appName = 'MarkdownVdomComponentTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        unitTestMode           : true,
        useDomApiRenderer      : true,
        useVdomWorker          : false
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect}    from '@playwright/test';
import Neo               from '../../../../../src/Neo.mjs';
import * as core         from '../../../../../src/core/_export.mjs';
import DomApiVnodeCreator from '../../../../../src/vdom/util/DomApiVnodeCreator.mjs';
import VdomHelper        from '../../../../../src/vdom/Helper.mjs';
import {resolveAction, STRUCTURAL_ACTIONS} from '../../../../../src/vdom/util/DeltaGrammar.mjs';
import MarkdownComponent from '../../../../../src/component/markdown/Component.mjs';

/**
 * @summary Pins the streaming delta contract of the markdown component against the REAL differ.
 *
 * The parser-level spec proves id stability structurally; this suite proves what the ticket's
 * ACs actually demand — the delta shapes the engine emits when a mounted component streams:
 * tail growth must be in-place mutation (`updateVtext` / action-less `updateNode`), a new block
 * must be insert-only, and NO structural delta may ever target a settled block's id. Delta
 * classification imports the grammar kernel (one vocabulary, never re-derived).
 *
 * Capture-API epoch windows replace the per-call return assertions here once the DeltaCapture
 * utility lands on dev — the per-call `promiseUpdate()` return is the same producer surface,
 * asserted the legacy way to keep this slice dev-only-dependent.
 */
test.describe('Neo.component.markdown.Component — streaming deltas', () => {
    let component, runId = 0;

    const effectiveActions = deltas => deltas.map(delta => resolveAction(delta));

    const structuralTargets = deltas => deltas
        .filter(delta => STRUCTURAL_ACTIONS.has(resolveAction(delta)))
        .map(delta => delta.id ?? delta.vnode?.id ?? null);

    test.beforeEach(async () => {
        await Promise.resolve();
        runId++;
        component = Neo.create(MarkdownComponent, {
            appName,
            id        : `markdown-vdom-test-${runId}`,
            value     : '# Title\n\nStreaming wor',
            // This suite pins the PARSE-layer delta contract on raw block children;
            // windowed mode (spacers + eviction) has its own dedicated spec.
            virtualize: false
        });

        await component.initVnode();
        component.mounted = true
    });

    test.afterEach(() => {
        component.destroy();
        component = null
    });

    test('renders the initial value as block subtrees under the component root', () => {
        const cn = component.vdom.cn;

        expect(cn).toHaveLength(2);
        expect(cn[0].tag).toBe('h1');
        expect(cn[1].tag).toBe('p');
        cn.forEach(block => expect(block.id.startsWith(component.id)).toBe(true))
    });

    test('open-tail growth diffs as in-place mutation — never structural churn', async () => {
        component.setSilent({value: '# Title\n\nStreaming words arriving'});

        const {deltas} = await component.promiseUpdate();

        expect(deltas.length).toBeGreaterThan(0);
        // Every delta is in-place: updateVtext (text growth) or action-less updateNode.
        effectiveActions(deltas).forEach(action => {
            expect(['updateVtext', 'updateNode']).toContain(action)
        });
        expect(structuralTargets(deltas)).toEqual([])
    });

    test('a new block appends as insert-only; settled ids are never structurally touched', async () => {
        const settledIds = new Set();

        const collect = nodes => nodes.forEach(node => {
            node.id && settledIds.add(node.id);
            node.cn && collect(node.cn)
        });
        collect(component.vdom.cn);

        component.setSilent({value: '# Title\n\nStreaming wor\n\nA brand new paragraph'});

        const {deltas} = await component.promiseUpdate();

        const structural = deltas.filter(delta => STRUCTURAL_ACTIONS.has(resolveAction(delta)));

        // The new block arrives via insertNode; nothing structural targets a settled id.
        expect(structural.length).toBeGreaterThan(0);
        structural.forEach(delta => {
            expect(resolveAction(delta)).toBe('insertNode');
            const bornId = delta.vnode?.id;
            expect(bornId && settledIds.has(bornId)).toBe(false)
        })
    });

    test('a fence streaming across three value states settles without structural churn on close', async () => {
        component.setSilent({value: '# Title\n\nStreaming wor\n\n```js\nconst a = 1;'});
        await component.promiseUpdate();

        const codeBlock = component.vdom.cn.at(-1);

        expect(codeBlock.tag).toBe('pre');

        component.setSilent({value: '# Title\n\nStreaming wor\n\n```js\nconst a = 1;\nconst b = 2;\n```'});

        const {deltas} = await component.promiseUpdate();

        // The fence closes by mutating the SAME pre block in place.
        expect(component.vdom.cn.at(-1).id).toBe(codeBlock.id);
        structuralTargets(deltas).forEach(id => {
            expect(id).not.toBe(codeBlock.id)
        })
    });

    test('clearing the value empties the block set', async () => {
        component.setSilent({value: null});
        await component.promiseUpdate();

        expect(component.vdom.cn).toEqual([])
    });

    test('clear-then-replay of the IDENTICAL source births fresh ids — null is a reset boundary', async () => {
        const beforeIds = new Set();

        const collect = (nodes, bucket) => nodes.forEach(node => {
            node.id && bucket.add(node.id);
            node.cn && collect(node.cn, bucket)
        });
        collect(component.vdom.cn, beforeIds);

        expect(beforeIds.size).toBeGreaterThan(0);

        // The wipe: a nullish value resets the parser ledger along with the rendered blocks.
        component.setSilent({value: null});
        await component.promiseUpdate();

        // Replaying the EXACT same source must not resurrect the cleared ids — the stale-memo
        // path would re-emit the memoized blocks reference-identically.
        component.setSilent({value: '# Title\n\nStreaming wor'});
        await component.promiseUpdate();

        const afterIds = new Set();

        collect(component.vdom.cn, afterIds);

        expect(afterIds.size).toBeGreaterThan(0);
        expect([...afterIds].filter(id => beforeIds.has(id))).toEqual([]);
        expect(component.vdom.cn).toHaveLength(2)
    });
});

import {setup} from '../../setup.mjs';

const appName = 'MergedUpdateDepthTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        useDomApiRenderer      : true,
        useVdomWorker          : false
    },
    appConfig: {
        name: appName
    }
});

import {test, expect}     from '@playwright/test';
import Neo                from '../../../../src/Neo.mjs';
import * as core          from '../../../../src/core/_export.mjs';
import Component          from '../../../../src/component/Base.mjs';
import Container          from '../../../../src/container/Base.mjs';
import VdomHelper         from '../../../../src/vdom/Helper.mjs';
import DomApiVnodeCreator from '../../../../src/vdom/util/DomApiVnodeCreator.mjs';

// Mock applyDeltas to prevent errors during mount
const realApplyDeltas = Neo.applyDeltas; // patched at import; restored in afterAll below

Neo.applyDeltas = async () => {};

test.afterAll(() => {
    Neo.applyDeltas = realApplyDeltas;
});

class MockComponent extends Component {
    static config = {
        className: 'Test.MergedDepthComponent',
        ntype    : 'test-merged-depth-component',
        _vdom    : {tag: 'div', cls: ['leaf-component']}
    }
}
MockComponent = Neo.setupClass(MockComponent);

class MockContainer extends Container {
    static config = {
        className: 'Test.MergedDepthContainer',
        ntype    : 'test-merged-depth-container',
        _vdom    : {tag: 'div', cls: ['branch-container']}
    }
}
MockContainer = Neo.setupClass(MockContainer);

/**
 * A merged child registers the depth its own subtree needs, but the owner dispatches the batch.
 * `collectPayloads()` reads `owner.updateDepth` into `depths`, and the collision filter then trusts
 * that value as a *coverage claim* when it deletes the child's own payload as "covered by the parent".
 * `VDomUpdate.getAdjustedUpdateDepth()` is what makes the claim true; while its call site is disabled
 * the filter deletes a payload nothing replaced, and the child's subtree is silently dropped.
 *
 * Every arm drives the real dispatch path (`update()` -> `updateVdom()` -> `executeVdomUpdate()`) and
 * reads the resulting deltas, because a direct call to `getAdjustedUpdateDepth()` cannot witness a
 * dead call site.
 */
test.describe('Merged child update depth', () => {
    let container, testRun = 0;

    test.beforeEach(() => {
        testRun++
    });

    test.afterEach(() => {
        if (container) {
            container.destroy();
            container = null
        }
    });

    /**
     * Builds owner -> branch -> twig -> leaf, so the leaf sits at distance 3 from the owner: beyond a
     * finite owner depth of 2, but inside `branch`'s full-subtree (-1) scope.
     *
     * The warm-up flush is load-bearing. Mounting leaves every component at `updateDepth: -1`, and
     * `beforeSetUpdateDepth()` only ever widens (`oldValue === -1 || value === -1 ? -1 : ...`), so a
     * later assignment of 2 would be silently clamped back to -1 and the arm would test an owner that
     * already requested the whole tree. `getVdomUpdatePayload()` resets `_updateDepth` to the class
     * default after each payload build, so one flush per component is what makes a finite depth
     * reachable at all.
     */
    async function createTree() {
        container = Neo.create(MockContainer, {
            appName,
            id   : `owner-${testRun}`,
            items: [{
                module: MockContainer,
                id    : `branch-${testRun}`,
                items : [{
                    module: MockContainer,
                    id    : `twig-${testRun}`,
                    items : [{
                        module: MockComponent,
                        id    : `leaf-${testRun}`,
                        text  : 'Leaf'
                    }]
                }]
            }]
        });

        await container.initVnode(true);
        container.mounted = true;

        const branch = container.items[0],
              twig   = branch.items[0],
              leaf   = twig.items[0];

        await container.promiseUpdate();
        await branch.promiseUpdate();

        expect(container.updateDepth, 'the warm-up returned the owner to a finite depth').toBe(1);
        expect(branch.updateDepth,    'the warm-up returned the branch to a finite depth').toBe(1);

        return {branch, twig, leaf}
    }

    /**
     * Captures the batch handed to the VDOM worker, so an arm can assert on reach (which nodes were
     * expanded) rather than only on the resulting deltas.
     */
    function captureBatch() {
        const captured = {},
              original = VdomHelper.updateBatch.bind(VdomHelper);

        VdomHelper.updateBatch = async function(data) {
            captured.updates = data.updates;
            return original(data)
        };

        captured.restore = () => {
            VdomHelper.updateBatch = original
        };

        return captured
    }

    /**
     * Positive control for the oracle the two arms below rely on.
     *
     * Without it, "no delta for the leaf" would be indistinguishable from "this fixture never produces
     * a leaf delta at all" -- an absence that reads exactly like a finding. An owner that declares the
     * full subtree itself must carry the leaf, fixed or not.
     */
    test('control: an owner declaring -1 carries a distance-3 leaf', async () => {
        const {leaf} = await createTree();

        container.setSilent({style: {color: 'purple'}});
        container.updateDepth = -1;

        leaf.vdom.text = 'Leaf Updated';

        const {deltas}  = await container.promiseUpdate();
        const leafDelta = deltas.find(d => d.id === leaf.id);

        expect(leafDelta, 'the oracle can observe a distance-3 leaf delta').toBeTruthy();
        expect(leafDelta.textContent).toBe('Leaf Updated')
    });

    /**
     * The regression. `branch` merges into the owner's cycle carrying `updateDepth: -1` -- the shape
     * `grid.Body` dispatches, where cells are mutated in place and the whole subtree is re-serialised
     * with no per-cell dirty registration to fall back on.
     *
     * The owner stays at its finite depth 2, so its tree prunes at the twig, while the collision filter
     * deletes `branch`'s own -1 payload as covered. Nothing carries the leaf.
     */
    test('a merged child registering -1 widens the owner past its finite depth', async () => {
        const {branch, twig, leaf} = await createTree();

        // The owner has a pending update, so `branch` merges into it rather than dispatching alone.
        container.setSilent({style: {color: 'purple'}});
        container.updateDepth = 2;

        // Mutated in place, deliberately without registering the leaf itself: the -1 below is the only
        // thing promising to carry it.
        leaf.vdom.text = 'Leaf Updated';

        branch.updateDepth = -1;
        branch.update();

        const batch = captureBatch();

        let deltas;

        try {
            ({deltas} = await container.promiseUpdate())
        } finally {
            batch.restore()
        }

        const twigNode = batch.updates[container.id]?.vdom.cn[0].cn[0];

        expect(twigNode?.tag, 'the merged -1 expands the twig instead of pruning it').toBeDefined();

        const leafDelta = deltas.find(d => d.id === leaf.id);

        expect(leafDelta, 'the merged -1 subtree reaches the leaf the owner\'s depth 2 cannot').toBeTruthy();
        expect(leafDelta.textContent).toBe('Leaf Updated');

        // The branch payload is deleted as "covered by the parent"; that is only sound once the
        // owner's depth actually covers it.
        expect(batch.updates[branch.id], 'the branch payload is covered by the owner').toBeUndefined()
    });

    /**
     * The no-op companion, and the discriminating control the oracle has to pass: a bound that
     * genuinely cannot reach the leaf must leave it absent. `branch` asks for depth 1, so the adjusted
     * depth is `max(2, 1 + 1)` -- unchanged. Restoring the compensation must not widen finite depths,
     * and must not turn every merge into a full-tree update.
     */
    test('a merged child registering a finite depth leaves the owner depth unchanged', async () => {
        const {branch, twig, leaf} = await createTree();

        container.setSilent({style: {color: 'green'}});
        container.updateDepth = 2;

        leaf.vdom.text = 'Leaf Updated';

        branch.updateDepth = 1;
        branch.update();

        const batch = captureBatch();

        let deltas;

        try {
            ({deltas} = await container.promiseUpdate())
        } finally {
            batch.restore()
        }

        const twigNode = batch.updates[container.id]?.vdom.cn[0].cn[0];

        expect(twigNode?.componentId, 'the owner still prunes at the twig').toBe(twig.id);
        expect(twigNode?.tag,         'the owner was not widened to a full-tree update').toBeUndefined();

        const leafDelta = deltas.find(d => d.id === leaf.id);

        expect(leafDelta, 'nothing in this batch declared a scope reaching the leaf').toBeFalsy()
    })
});

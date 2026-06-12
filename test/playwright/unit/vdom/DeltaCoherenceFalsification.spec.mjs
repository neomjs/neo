import {setup} from '../../setup.mjs';

const appName = 'DeltaCoherenceFalsificationTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        unitTestMode           : true,
        useDomApiRenderer      : true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect}        from '@playwright/test';
import Neo                   from '../../../../src/Neo.mjs';
import * as core             from '../../../../src/core/_export.mjs';
import Component             from '../../../../src/component/Base.mjs';
import Container             from '../../../../src/container/Base.mjs';
import DomApiVnodeCreator    from '../../../../src/vdom/util/DomApiVnodeCreator.mjs';
import VdomHelper            from '../../../../src/vdom/Helper.mjs';
import DeltaCoherenceRegistry from '../../../../src/vdom/util/DeltaCoherenceRegistry.mjs';

/**
 * @summary The coherence registry's observe-mode falsification harness: real engine output, zero findings expected.
 *
 * Every delta batch the REAL vdom engine produces in this file — component-driven updates,
 * structural inserts/removes, reorders, disjoint teleportation merges, remove/re-insert cycles,
 * pool-shaped in-place rewrites — is teed through ONE persistent coherence ledger, exactly as the
 * Main-thread wiring would consume it. Any finding is a false positive by definition (the engine's
 * own output is the correctness baseline), and therefore promotion-blocking evidence per the
 * ticket's observe-first AC.
 *
 * The tee hooks `VdomHelper.update` AND `updateBatch` with a nesting guard: an aggregated
 * teleportation batch is ledger-evaluated at the granularity `Neo.main.DeltaUpdates#update`
 * would receive it (one message, one batch), never double-counted through its per-component
 * fragments.
 */

class FalsificationLeaf extends Component {
    static config = {
        className: 'Test.Unit.Vdom.CoherenceFalsificationLeaf',
        ntype    : 'coherence-falsification-leaf',
        tag      : 'span',
        text     : 'leaf'
    }
}
FalsificationLeaf = Neo.setupClass(FalsificationLeaf);

class FalsificationBranch extends Container {
    static config = {
        className: 'Test.Unit.Vdom.CoherenceFalsificationBranch',
        ntype    : 'coherence-falsification-branch',
        layout   : {ntype: 'vbox'}
    }
}
FalsificationBranch = Neo.setupClass(FalsificationBranch);

const
    registry    = new DeltaCoherenceRegistry({windowId: 'falsification-corpus'}),
    allFindings = [],
    stats       = {batches: 0, deltas: 0};

let insideBatch = false;

const tee = deltas => {
    if (Array.isArray(deltas) && deltas.length > 0) {
        const evaluation = registry.evaluateBatch(deltas);

        evaluation.commit();
        allFindings.push(...evaluation.findings);
        stats.batches++;
        stats.deltas += deltas.length
    }
};

// The corpus ACCUMULATES across tests by design (one persistent ledger, cross-batch realism);
// serial mode keeps every test in one worker so the module-level state is the same instance.
test.describe.configure({mode: 'serial'});

test.describe('DeltaCoherenceRegistry — falsification over real engine output', () => {
    let originalUpdate, originalUpdateBatch;

    test.beforeAll(() => {
        originalUpdate      = VdomHelper.update.bind(VdomHelper);
        originalUpdateBatch = VdomHelper.updateBatch.bind(VdomHelper);

        VdomHelper.update = opts => {
            const result = originalUpdate(opts);

            insideBatch || tee(result.deltas);
            return result
        };

        VdomHelper.updateBatch = data => {
            insideBatch = true;

            let result;

            try {
                result = originalUpdateBatch(data)
            } finally {
                insideBatch = false
            }

            tee(result.deltas);
            return result
        }
    });

    test.afterAll(() => {
        VdomHelper.update      = originalUpdate;
        VdomHelper.updateBatch = originalUpdateBatch;

        console.log(
            `Coherence falsification corpus: ${stats.batches} batches, ${stats.deltas} deltas, ` +
            `${registry.liveSnapshot.size} live ids, ${registry.retiredSnapshot.size} retired ids, ` +
            `${allFindings.length} findings`
        )
    });

    test('in-place updates: style, class, text traffic stays silent', async () => {
        const tree = Neo.create(FalsificationBranch, {
            appName,
            id   : 'falsify-tree-1',
            items: [
                {ntype: 'coherence-falsification-leaf', id: 'falsify-leaf-1a'},
                {ntype: 'coherence-falsification-leaf', id: 'falsify-leaf-1b'}
            ]
        });

        await tree.initVnode();
        tree.mounted = true;

        for (let pass = 0; pass < 4; pass++) {
            tree.setSilent({style: {color: pass % 2 ? 'red' : 'blue'}});
            tree.items[0].setSilent({text: `leaf pass ${pass}`, cls: [`pass-${pass}`]});
            await tree.promiseUpdate()
        }

        expect(allFindings).toEqual([]);
        tree.destroy()
    });

    test('structural inserts and removes: birth and retirement traffic stays silent', async () => {
        const tree = Neo.create(FalsificationBranch, {
            appName,
            id   : 'falsify-tree-2',
            items: [{ntype: 'coherence-falsification-leaf', id: 'falsify-leaf-2a'}]
        });

        await tree.initVnode();
        tree.mounted = true;

        tree.insert(1, {ntype: 'coherence-falsification-leaf', id: 'falsify-leaf-2b', text: 'born'}, true);
        await tree.promiseUpdate();

        tree.removeAt(1, true, true);
        await tree.promiseUpdate();

        expect(allFindings).toEqual([]);
        tree.destroy()
    });

    test('remove + re-insert cycles: the same id re-births legally across batches', async () => {
        const tree = Neo.create(FalsificationBranch, {
            appName,
            id   : 'falsify-tree-3',
            items: [{ntype: 'coherence-falsification-leaf', id: 'falsify-leaf-3a'}]
        });

        await tree.initVnode();
        tree.mounted = true;

        for (let cycle = 0; cycle < 3; cycle++) {
            tree.insert(1, {ntype: 'coherence-falsification-leaf', id: 'falsify-cycler-3', text: `cycle ${cycle}`}, true);
            await tree.promiseUpdate();

            tree.removeAt(1, true, true);
            await tree.promiseUpdate()
        }

        expect(allFindings).toEqual([]);
        tree.destroy()
    });

    test('reorders: moveNode traffic against live ids stays silent', async () => {
        const tree = Neo.create(FalsificationBranch, {
            appName,
            id   : 'falsify-tree-4',
            items: [
                {ntype: 'coherence-falsification-leaf', id: 'falsify-order-a', text: 'a'},
                {ntype: 'coherence-falsification-leaf', id: 'falsify-order-b', text: 'b'},
                {ntype: 'coherence-falsification-leaf', id: 'falsify-order-c', text: 'c'}
            ]
        });

        await tree.initVnode();
        tree.mounted = true;

        // Rotate the children twice — pure positional churn over permanent ids.
        for (let rotation = 0; rotation < 2; rotation++) {
            const first = tree.items[0];

            tree.remove(first, false, true);
            tree.insert(2, first, true);
            await tree.promiseUpdate()
        }

        expect(allFindings).toEqual([]);
        tree.destroy()
    });

    test('disjoint teleportation merges: aggregated multi-component batches stay silent', async () => {
        const
            parent = Neo.create(FalsificationBranch, {
                appName,
                id   : 'falsify-tree-5',
                items: [{
                    ntype: 'coherence-falsification-branch',
                    id   : 'falsify-mid-5',
                    items: [{ntype: 'coherence-falsification-leaf', id: 'falsify-deep-5'}]
                }]
            });

        await parent.initVnode();
        parent.mounted = true;

        const
            mid  = parent.items[0],
            deep = mid.items[0];

        // Parent and grandchild mutate in the same tick: the engine merges/disjoints as it
        // sees fit; whatever batch shape comes out is what the ledger consumes.
        parent.setSilent({style: {background: 'black'}});
        deep.setSilent({text: 'teleported'});
        await parent.promiseUpdate();

        mid.setSilent({cls: ['mid-updated']});
        deep.setSilent({text: 'teleported again'});
        await mid.promiseUpdate();

        expect(allFindings).toEqual([]);
        parent.destroy()
    });

    test('pool-shaped rewrites: permanent-resident ids rewritten across many batches stay silent', async () => {
        const tree = Neo.create(FalsificationBranch, {
            appName,
            id   : 'falsify-tree-6',
            items: Array.from({length: 5}, (item, index) => (
                {ntype: 'coherence-falsification-leaf', id: `falsify-pool-${index}`, text: 'seed'}
            ))
        });

        await tree.initVnode();
        tree.mounted = true;

        // The grid recycling shape: N residents rewritten in place per "scroll" run.
        for (let run = 0; run < 6; run++) {
            tree.items.forEach((leaf, index) => {
                leaf.setSilent({
                    cls : [run % 2 ? 'neo-even' : 'neo-odd'],
                    text: `row ${run}-${index}`
                })
            });
            await tree.promiseUpdate()
        }

        expect(allFindings).toEqual([]);
        tree.destroy()
    });

    test('FALSIFICATION VERDICT: zero findings across the full real-output corpus', () => {
        expect(allFindings).toEqual([]);
        expect(stats.batches).toBeGreaterThan(10);
        expect(registry.batchCount).toBe(stats.batches)
    });
});

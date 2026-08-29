import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'DashboardDockTopologyReconcilerTest'
    }
});

import {test, expect}         from '@playwright/test';
import Neo                    from '../../../../src/Neo.mjs';
import * as core              from '../../../../src/core/_export.mjs';
import DockRestorePlanner     from '../../../../src/dashboard/dock/persistence/RestorePlanner.mjs';
import DockTopologyReconciler from '../../../../src/dashboard/dock/model/TopologyReconciler.mjs';
import Persistence            from '../../../../src/dashboard/dock/model/Persistence.mjs';

const tabsDoc = ids => ({
    schema: 'neo.dock.zone.v1',
    root  : 'r',
    items : Object.fromEntries(ids.map(id => [id, {componentRef: id, title: id}])),
    nodes : {
        r: {type: 'tabs', items: [...ids], activeItemId: ids[0]}
    }
});

// Pure assignment fixtures deliberately omit the persisted-layout envelope. `assignSlots()`
// owns only item/type affinity, so these isolate the solver from restore/executor behavior.
const assignmentDoc = (ids, types=['tabs']) => ({
    items: Object.fromEntries(ids.map(id => [id, {}])),
    nodes: Object.fromEntries(types.map((type, index) => [`n${index}`, {type}]))
});

/**
 * @summary Independent test-only affinity implementation for the exhaustive oracle.
 * @param {Object} captured
 * @param {Object} live
 * @returns {{jaccard: Number, structural: Number}}
 */
const oracleAffinity = (captured, live) => {
    const counts = document => {
        let result = {};

        Object.values(document?.nodes || {}).forEach(node => {
            result[node.type] = (result[node.type] || 0) + 1
        });

        return result
    };

    let capturedIds = Object.keys(captured?.items || {}),
        liveIds     = new Set(Object.keys(live?.items || {})),
        overlap     = capturedIds.filter(id => liveIds.has(id)).length,
        itemUnion   = capturedIds.length + liveIds.size - overlap,
        a           = counts(captured),
        b           = counts(live),
        types       = new Set([...Object.keys(a), ...Object.keys(b)]),
        inter       = 0,
        union       = 0;

    types.forEach(type => {
        inter += Math.min(a[type] || 0, b[type] || 0);
        union += Math.max(a[type] || 0, b[type] || 0)
    });

    return {
        jaccard   : itemUnion === 0 ? 0 : overlap / itemUnion,
        structural: union === 0 ? 0 : inter / union
    }
};

/**
 * @summary Independent test-only content key for deterministic tie comparison.
 * @param {Object} document
 * @returns {String}
 */
const oracleContentKey = document => {
    let items = Object.keys(document?.items || {}).sort().join(','),
        types = Object.values(document?.nodes || {}).map(node => node.type).sort().join(',');

    return `${items}#${types}`
};

/**
 * @summary Frozen bounded exhaustive oracle for assignment-result equivalence.
 *
 * This is the retired production search copied into the spec, with independent affinity and
 * content-key primitives. It is intentionally exponential and therefore used only at arity ≤ 6.
 * @param {Object[]} capturedDocs
 * @param {Object[]} liveDocs
 * @returns {{mapping: Object[], unmapped: Object[], unmatchedLive: Number[]}}
 */
const exhaustiveAssignmentOracle = (capturedDocs, liveDocs) => {
    let matrix      = capturedDocs.map(captured => liveDocs.map(live => oracleAffinity(captured, live))),
        contentKeys = liveDocs.map(oracleContentKey),
        best        = null;

    const consider = (slotIndex, used, pairs, cardinality, jaccardSum, structuralSum) => {
        if (slotIndex === capturedDocs.length) {
            let signature = pairs.map(pair => `${pair.capturedIndex}>${contentKeys[pair.liveIndex]}`).join('|'),
                sequence  = pairs.map(pair => pair.liveIndex).join(',');

            if (!best
                || cardinality > best.cardinality
                || (cardinality === best.cardinality && jaccardSum > best.jaccardSum)
                || (cardinality === best.cardinality && jaccardSum === best.jaccardSum && structuralSum > best.structuralSum)
                || (cardinality === best.cardinality && jaccardSum === best.jaccardSum && structuralSum === best.structuralSum && signature < best.signature)
                || (cardinality === best.cardinality && jaccardSum === best.jaccardSum && structuralSum === best.structuralSum && signature === best.signature && sequence < best.sequence)
            ) {
                best = {cardinality, jaccardSum, pairs: [...pairs], sequence, signature, structuralSum}
            }
            return
        }

        consider(slotIndex + 1, used, pairs, cardinality, jaccardSum, structuralSum);

        matrix[slotIndex].forEach((affinity, liveIndex) => {
            if (affinity.jaccard > 0 && !used.has(liveIndex)) {
                used.add(liveIndex);
                pairs.push({affinity, capturedIndex: slotIndex, liveIndex});
                consider(slotIndex + 1, used, pairs, cardinality + 1,
                    jaccardSum + affinity.jaccard, structuralSum + affinity.structural);
                pairs.pop();
                used.delete(liveIndex)
            }
        })
    };

    consider(0, new Set(), [], 0, 0, 0);

    let assigned = new Set(best.pairs.map(pair => pair.capturedIndex)),
        usedLive = new Set(best.pairs.map(pair => pair.liveIndex));

    return {
        mapping : best.pairs.sort((a, b) => a.capturedIndex - b.capturedIndex),
        unmapped: capturedDocs.flatMap((doc, capturedIndex) => {
            if (assigned.has(capturedIndex)) return [];

            return [{
                capturedIndex,
                reason: matrix[capturedIndex].some(affinity => affinity.jaccard > 0)
                    ? DockTopologyReconciler.REASON_NO_LIVE_WINDOW
                    : DockTopologyReconciler.REASON_UNMAPPED_SLOT
            }]
        }),
        unmatchedLive: liveDocs.map((doc, index) => index).filter(index => !usedLive.has(index))
    }
};

/**
 * @summary Creates a deterministic pseudo-random stream for reproducible property coverage.
 * @param {Number} seed
 * @returns {Function}
 */
const seededRandom = seed => () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000
};

/**
 * @summary Builds one bounded random assignment document.
 * @param {Function} random
 * @param {Number} salt
 * @returns {Object}
 */
const randomAssignmentDoc = (random, salt) => {
    let ids   = Array.from({length: 7}, (item, index) => `item-${index}`).filter(() => random() < 0.42),
        types = Array.from({length: 1 + Math.floor(random() * 3)}, (item, index) =>
            ['tabs', 'split-horizontal', 'split-vertical'][(index + salt + Math.floor(random() * 3)) % 3]);

    return assignmentDoc(ids, types)
};

// Fixtures ride the REAL landed producer — hand-rolled envelopes only appear in the negative
// cases that deliberately break the envelope contract.
const capture = docs => {
    let {layout, errors} = Persistence.captureTopologyPerspective(docs, {layoutId: 'test-perspective', title: 'Test'});

    if (errors.length) {
        throw new Error(`fixture capture failed: ${errors[0]}`)
    }

    return layout
};

const capturedIdsOf = saved => DockTopologyReconciler.capturedSlots(saved)
    .flatMap(doc => Object.keys(doc.items || {}));

// Conservation invariant: every captured item id lands in exactly one of restored/unrestored.
const expectConservation = (saved, result) => {
    let covered = [...result.restored, ...result.unrestored.map(entry => entry.itemId)].sort();

    expect(covered).toEqual(capturedIdsOf(saved).sort())
};

test.describe('Neo.dashboard.dock.model.TopologyReconciler', () => {
    test('polynomial solver is output-equivalent to the bounded exhaustive oracle on seeded rectangular matrices', () => {
        for (let seed = 1; seed <= 96; seed++) {
            let random        = seededRandom(seed),
                capturedCount = Math.floor(random() * 7),
                liveCount     = Math.floor(random() * 7),
                captured      = Array.from({length: capturedCount}, (item, index) =>
                    randomAssignmentDoc(random, index)),
                live          = Array.from({length: liveCount}, (item, index) =>
                    randomAssignmentDoc(random, index + capturedCount));

            expect(
                DockTopologyReconciler.assignSlots(captured, live),
                `seed=${seed}, captured=${capturedCount}, live=${liveCount}`
            ).toEqual(exhaustiveAssignmentOracle(captured, live))
        }
    });

    test('objective order keeps structural affinity above content and uses numeric live-index ties at 10+', () => {
        let captured = [assignmentDoc(['shared'], ['tabs', 'split-horizontal'])],
            live     = [
                assignmentDoc(['shared', 'alpha'], ['tabs']),
                assignmentDoc(['shared', 'zeta'],  ['tabs', 'split-horizontal'])
            ],
            result   = DockTopologyReconciler.assignSlots(captured, live);

        // Jaccard ties at 1/2. The structurally exact (but lexically later) window wins.
        expect(result.mapping).toEqual([
            expect.objectContaining({capturedIndex: 0, liveIndex: 1})
        ]);

        live = Array.from({length: 12}, (item, index) => assignmentDoc([`other-${index}`]));
        live[2]  = assignmentDoc(['shared']);
        live[10] = assignmentDoc(['shared']);
        result   = DockTopologyReconciler.assignSlots([assignmentDoc(['shared'])], live);

        // Both viable documents are content-identical. The old string sequence made "10" < "2";
        // the contract says live-index order, so the exact solver intentionally chooses numeric 2.
        expect(result.mapping).toEqual([
            expect.objectContaining({capturedIndex: 0, liveIndex: 2})
        ])
    });

    test('captured/live permutations preserve the content-canonical optimum when slot identity is content-derived', () => {
        let captured = [
                assignmentDoc(['a', 'b'], ['tabs']),
                assignmentDoc(['c', 'd'], ['split-horizontal']),
                assignmentDoc(['e', 'f'], ['split-vertical'])
            ],
            live = [
                assignmentDoc(['a', 'b', 'x'], ['tabs']),
                assignmentDoc(['c', 'd', 'y'], ['split-horizontal']),
                assignmentDoc(['e', 'f', 'z'], ['split-vertical'])
            ];

        const canonicalPairs = (capturedDocs, liveDocs) => DockTopologyReconciler
            .assignSlots(capturedDocs, liveDocs).mapping
            .map(({capturedIndex, liveIndex}) => [
                oracleContentKey(capturedDocs[capturedIndex]),
                oracleContentKey(liveDocs[liveIndex])
            ])
            .sort((a, b) => a[0].localeCompare(b[0]));

        expect(canonicalPairs(captured, live)).toEqual(canonicalPairs([...captured].reverse(), [...live].reverse()))
    });

    test('dense 8×8 / 9×9 / 12×12 matrices complete with full unique assignment', () => {
        [8, 9, 12].forEach(size => {
            let shared   = Array.from({length: size}, (item, index) => `shared-${index}`),
                captured = Array.from({length: size}, (item, index) =>
                    assignmentDoc([...shared, `captured-${index}`], ['tabs', `shape-${index % 3}`])),
                live     = Array.from({length: size}, (item, index) =>
                    assignmentDoc([`shared-${index}`, `live-${index}`], ['tabs', `shape-${index % 3}`])),
                samples  = [],
                result;

            // One unrecorded warmup, then a deterministic fixture / fixed-run-count sample.
            // Output is evidence, never a hardware-sensitive merge gate.
            DockTopologyReconciler.assignSlots(captured, live);

            for (let run = 0; run < 5; run++) {
                let startedAt = performance.now();

                result = DockTopologyReconciler.assignSlots(captured, live);
                samples.push(performance.now() - startedAt)
            }

            samples.sort((a, b) => a - b);
            console.log('[dock-topology-assignment]', JSON.stringify({
                mapped  : result.mapping.length,
                medianMs: Math.round(samples[2] * 1000) / 1000,
                runsMs  : samples.map(value => Math.round(value * 1000) / 1000),
                size
            }));

            expect(result.mapping).toHaveLength(size);
            expect(new Set(result.mapping.map(pair => pair.capturedIndex)).size).toBe(size);
            expect(new Set(result.mapping.map(pair => pair.liveIndex)).size).toBe(size);
            expect(result.unmapped).toEqual([]);
            expect(result.unmatchedLive).toEqual([])
        })
    });

    test('shrunk topology: best-coverage assignment + reason-classed remainder + conservation', () => {
        let saved = capture([
                tabsDoc(['alpha', 'beta']),
                tabsDoc(['gamma', 'delta']),
                tabsDoc(['omega', 'psi'])
            ]),
            live  = [
                tabsDoc(['gamma', 'delta']),
                tabsDoc(['alpha', 'beta'])
            ],
            result = DockTopologyReconciler.reconcile(saved, live);

        expect(result.errors).toEqual([]);
        expect(result.mapping.map(({capturedIndex, liveIndex}) => [capturedIndex, liveIndex]))
            .toEqual([[0, 1], [1, 0]]);
        // Slot 2 HAD affinity nowhere-free: the topology shrank underneath it — reasoned, never dropped.
        expect(result.unrestored).toEqual([
            {capturedIndex: 2, itemId: 'omega', reason: DockTopologyReconciler.REASON_UNMAPPED_SLOT},
            {capturedIndex: 2, itemId: 'psi',   reason: DockTopologyReconciler.REASON_UNMAPPED_SLOT}
        ]);
        expectConservation(saved, result)
    });

    test('the greedy trap: optimal assignment maps BOTH slots where captured-order greedy strands one', () => {
        // Disjoint live catalogs (the workspace invariant); slot 0's items straddle both windows.
        // Greedy: slot 0 eats W0 (its best, .5), stranding slot 1 (zero for W1) → cardinality 1.
        // Optimal: slot 0 takes W1 (.25) so slot 1 keeps W0 (.25) → cardinality 2.
        let saved = capture([
                tabsDoc(['p', 'q', 'r']),
                tabsDoc(['s', 't'])
            ]),
            live  = [
                tabsDoc(['p', 'q', 's']),                     // W0: slot0 j=2/4=.5  · slot1 j=1/4=.25
                tabsDoc(['r', 'u'])                           // W1: slot0 j=1/4=.25 · slot1 j=0
            ],
            result = DockTopologyReconciler.reconcile(saved, live);

        expect(result.errors).toEqual([]);
        expect(result.mapping.map(({capturedIndex, liveIndex}) => [capturedIndex, liveIndex]))
            .toEqual([[0, 1], [1, 0]]);
        expect(result.unrestored).toEqual([]);
        expectConservation(saved, result)
    });

    test('non-identical equal-aggregate ties resolve by CONTENT, permutation-stably: both live orders advance the same window content', () => {
        // TWO cardinality-2 assignments tie on every affinity key ({S0→A,S1→B} vs {S0→B,S1→A}:
        // all four pairs share jaccard 1/4 and identical structure) — but the candidate windows
        // are NOT interchangeable: A={a,c,x} and B={b,d,y} differ in content. The content-
        // signature tie rule must map S0={a,b} to A (smallest content key) under EITHER live
        // order. (Live arity differs from captured so placements ride the adopt path — the
        // landed planner refuses to invent missing items incrementally.)
        let saved = capture([tabsDoc(['a', 'b']), tabsDoc(['c', 'd'])]),
            docA  = () => tabsDoc(['a', 'c', 'x']),
            docB  = () => tabsDoc(['b', 'd', 'y']),

            first  = DockTopologyReconciler.reconcile(saved, [docA(), docB()]),
            second = DockTopologyReconciler.reconcile(saved, [docB(), docA()]);

        const contentOf = result => result.applied
            .map(({capturedIndex, liveIndex}) => [capturedIndex, Object.keys(result.documents[liveIndex].items).sort().join(',')])
            .sort();

        expect(first.errors).toEqual([]);
        expect(second.errors).toEqual([]);
        // Same captured→content mapping, same restored set, same (empty) displaced set — the
        // live ARRAY ORDER left no fingerprint on the outcome.
        expect(contentOf(first)).toEqual(contentOf(second));
        expect([...first.restored].sort()).toEqual([...second.restored].sort());
        // displaced/unrestored compare by CONTENT — liveIndex legitimately follows the permutation.
        expect(first.displaced.map(entry => entry.itemId).sort()).toEqual(second.displaced.map(entry => entry.itemId).sort());
        expect(first.unrestored).toEqual(second.unrestored);
        expectConservation(saved, first);
        expectConservation(saved, second)
    });

    test('a straddling slot never emits a duplicate: the unmatched pass-through window convicts the placement, permutation-stably', () => {
        // Captured {a,b} straddles two disjoint live windows ({a,c,x} / {b,d,y}) with equal
        // aggregate affinity. WHICHEVER window it lands on, the OTHER stays live and keeps its
        // copy — so placing would duplicate an item across the final workspace. The reconciler
        // must route the slot to duplicate-item, leave BOTH windows reference-identical, and
        // report identically under either live order.
        let saved = capture([tabsDoc(['a', 'b'])]),
            docA  = () => tabsDoc(['a', 'c', 'x']),
            docB  = () => tabsDoc(['b', 'd', 'y']);

        [[docA(), docB()], [docB(), docA()]].forEach(live => {
            let result = DockTopologyReconciler.reconcile(saved, live);

            expect(result.errors).toEqual([]);
            expect(result.applied).toEqual([]);
            expect(result.displaced).toEqual([]);
            expect(result.documents[0]).toBe(live[0]);
            expect(result.documents[1]).toBe(live[1]);
            expect(result.unrestored).toEqual([
                {capturedIndex: 0, itemId: 'a', reason: DockTopologyReconciler.REASON_DUPLICATE_ITEM},
                {capturedIndex: 0, itemId: 'b', reason: DockTopologyReconciler.REASON_DUPLICATE_ITEM}
            ]);
            expectConservation(saved, result)
        })
    });

    test('duplicate item ids ACROSS live windows are corrupt input: fail closed, mutate nothing', () => {
        let saved  = capture([tabsDoc(['alpha'])]),
            live   = [tabsDoc(['alpha', 'solo']), tabsDoc(['alpha'])],
            result = DockTopologyReconciler.reconcile(saved, live);

        expect(result.errors.join(' ')).toContain('both carry item "alpha"');
        expect(result.applied).toEqual([]);
        expect(result.documents[0]).toBe(live[0]);
        expect(result.documents[1]).toBe(live[1]);
        result.unrestored.forEach(entry =>
            expect(entry.reason).toBe(DockTopologyReconciler.REASON_VALIDATION_FAILED))
    });

    test('grown topology: excess live windows stay reference-identical; no spawning surface exists', () => {
        let saved  = capture([tabsDoc(['alpha'])]),
            live   = [tabsDoc(['zeta']), tabsDoc(['alpha']), tabsDoc(['eta'])],
            result = DockTopologyReconciler.reconcile(saved, live);

        expect(result.mapping).toEqual([
            expect.objectContaining({capturedIndex: 0, liveIndex: 1})
        ]);
        expect(result.unmatchedLive.sort()).toEqual([0, 2]);
        expect(result.documents[0]).toBe(live[0]);
        expect(result.documents[2]).toBe(live[2]);
        expect(result.unrestored).toEqual([]);
        expectConservation(saved, result)
    });

    test('envelope authority fails the ENTIRE restore closed, without throwing', () => {
        let live = [tabsDoc(['alpha'])];

        const expectFailClosed = (savedLayout, label) => {
            let result;

            expect(() => { result = DockTopologyReconciler.reconcile(savedLayout, live) },
                `${label} must not throw`).not.toThrow();
            expect(result.errors.length, `${label} must surface errors`).toBeGreaterThan(0);
            expect(result.mapping).toEqual([]);
            expect(result.documents[0]).toBe(live[0]);
            result.unrestored.forEach(entry =>
                expect(entry.reason).toBe(DockTopologyReconciler.REASON_VALIDATION_FAILED));

            return result
        };

        let valid = capture([tabsDoc(['alpha']), tabsDoc(['beta'])]);

        // Foreign wrapper schema.
        expectFailClosed({...valid, schema: 'neo.dock.layout.v999'}, 'foreign schema');

        // Wrong scope smuggling windowDocuments.
        expectFailClosed({...valid, captureScope: 'window'}, 'window-scope + smuggled windowDocuments');

        // Missing primary document.
        expectFailClosed((() => { let broken = {...valid}; delete broken.dockZone; return broken })(), 'missing dockZone');

        // Non-array windowDocuments — the string AND the plain-object shape (an object reaches
        // a spread as a non-iterable: the total extractor must never throw on it).
        expectFailClosed({...valid, windowDocuments: 'nope'}, 'non-array windowDocuments');
        expectFailClosed({...valid, windowDocuments: {}},     'object windowDocuments');

        // A malformed slot fails closed with its index preserved in the surfaced error.
        let badSlot = expectFailClosed({
            ...valid,
            windowDocuments: [{
                schema: 'neo.dock.zone.v1',
                root  : 'r',
                items : {},
                nodes : {r: {type: 'tabs', items: ['ghost'], activeItemId: 'ghost'}}
            }]
        }, 'malformed slot');
        expect(badSlot.errors.join(' ')).toContain('windowDocuments[0]');

        // Null / empty envelopes fail closed too.
        expectFailClosed(null, 'null envelope')
    });

    test('a null middle slot preserves ORIGINAL captured indices in the fail-closed report', () => {
        // Slot layout: 0 = dockZone(a1), 1 = windowDocuments[0] → nulled, 2 = windowDocuments[1](c1).
        // Compacting the null away would misreport slot 2 as index 1 — the extractor must not.
        let saved = capture([tabsDoc(['a1']), tabsDoc(['b1']), tabsDoc(['c1'])]),
            live  = [tabsDoc(['a1'])];

        saved = {...saved, windowDocuments: [null, saved.windowDocuments[1]]};

        let result;

        expect(() => { result = DockTopologyReconciler.reconcile(saved, live) }).not.toThrow();
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.documents[0]).toBe(live[0]);
        // Slot 2's items report under capturedIndex 2 — NOT 1 — with the null slot in between.
        expect(result.unrestored).toEqual([
            {capturedIndex: 0, itemId: 'a1', reason: DockTopologyReconciler.REASON_VALIDATION_FAILED},
            {capturedIndex: 2, itemId: 'c1', reason: DockTopologyReconciler.REASON_VALIDATION_FAILED}
        ])
    });

    test('the finite durable-field boundary applies to EVERY captured slot, not only the primary document', () => {
        let saved = capture([tabsDoc(['a1']), tabsDoc(['b1'])]),
            live  = [tabsDoc(['a1']), tabsDoc(['b1'])],
            slot  = saved.windowDocuments[0];

        // Runtime-bearing fields must not ride an ADDITIONAL window document into a restore:
        // a document-level window fingerprint...
        let fingerprinted = {...saved, windowDocuments: [{...slot, windowFingerprint: {windowId: 'w2'}}]},
            first         = DockTopologyReconciler.reconcile(fingerprinted, live);

        expect(first.errors.join(' ')).toContain('windowDocuments[0]');
        expect(first.errors.join(' ')).toContain('windowFingerprint');
        expect(first.applied).toEqual([]);
        first.unrestored.forEach(entry =>
            expect(entry.reason).toBe(DockTopologyReconciler.REASON_VALIDATION_FAILED));

        // ...and an item-level runtime rect both fail the restore closed, offender indexed.
        let rected = {
                ...saved,
                windowDocuments: [{...slot, items: {b1: {...slot.items.b1, runtimeRect: {x: 0, y: 0}}}}]
            },
            second = DockTopologyReconciler.reconcile(rected, live);

        expect(second.errors.join(' ')).toContain('windowDocuments[0]');
        expect(second.errors.join(' ')).toContain('runtimeRect');
        expect(second.applied).toEqual([]);
        second.unrestored.forEach(entry =>
            expect(entry.reason).toBe(DockTopologyReconciler.REASON_VALIDATION_FAILED))
    });

    test('workspace-global uniqueness: a slot whose placement would duplicate an item does not place', () => {
        // Hand-built envelope (schema-complete, passes the landed validator): two slots carrying
        // the SAME item id — a state the capture producer does not emit, but a stored layout
        // could. Live catalogs are DISJOINT (the workspace invariant). 'shared' lives in W1;
        // slot 1 restores it in place, so slot 0's placement would IMPORT a second copy into
        // W0 — live ownership convicts the importer, and the id stays single in the output.
        let shared = {
                schema           : Persistence.LAYOUT_SCHEMA,
                layoutId         : 'dup-test',
                title            : 'Dup',
                captureScope     : 'topology',
                windowFingerprint: null,
                metadata         : {},
                dockZone         : tabsDoc(['shared', 'solo']),
                windowDocuments  : [tabsDoc(['shared'])]
            },
            live   = [tabsDoc(['solo', 'filler', 'pad']), tabsDoc(['shared'])],
            result = DockTopologyReconciler.reconcile(shared, live);

        // 'shared' appears in EXACTLY ONE final document — the complete-output invariant, not
        // merely a per-placement count (a placed copy next to an untouched live copy would
        // still be a workspace duplicate).
        let finalShared = result.documents.filter(doc => doc.items?.shared).length;

        expect(result.errors).toEqual([]);
        expect(finalShared).toBe(1);
        expect(result.restored).toEqual(['shared']);
        // The convicted importer's window keeps reference identity — slot-atomic: BOTH its
        // items report, including the collision-free one.
        expect(result.documents[0]).toBe(live[0]);
        expect(result.unrestored).toEqual([
            {capturedIndex: 0, itemId: 'shared', reason: DockTopologyReconciler.REASON_DUPLICATE_ITEM},
            {capturedIndex: 0, itemId: 'solo',   reason: DockTopologyReconciler.REASON_DUPLICATE_ITEM}
        ]);
        expectConservation(shared, result)
    });

    test('deferral reasons pass through verbatim: only topology-fingerprint-mismatch may adopt', () => {
        let saved    = capture([tabsDoc(['alpha'])]),
            live     = [tabsDoc(['alpha'])],
            original = DockRestorePlanner.restoreToward;

        try {
            DockRestorePlanner.restoreToward = () => ({
                applied: 0, deferred: true, document: live[0], errors: [],
                plan   : [], reason: 'cross-node-singleton-cycle', surplus: []
            });

            let result = DockTopologyReconciler.reconcile(saved, live);

            // NOT adopted: the live document is untouched and the foreign reason passes through.
            expect(result.documents[0]).toBe(live[0]);
            expect(result.applied).toEqual([]);
            expect(result.unrestored).toEqual([
                {capturedIndex: 0, itemId: 'alpha', reason: 'cross-node-singleton-cycle'}
            ]);
            expectConservation(saved, result)
        } finally {
            DockRestorePlanner.restoreToward = original
        }
    });

    test('executor failures report apply-error — never mislabeled as validation', () => {
        let saved    = capture([tabsDoc(['alpha'])]),
            live     = [tabsDoc(['alpha'])],
            original = DockRestorePlanner.restoreToward;

        try {
            DockRestorePlanner.restoreToward = () => ({
                applied: 0, deferred: false, document: live[0], errors: ['boom'],
                plan   : [], reason: null, surplus: []
            });

            let result = DockTopologyReconciler.reconcile(saved, live);

            expect(result.documents[0]).toBe(live[0]);
            expect(result.errors.join(' ')).toContain('boom');
            expect(result.unrestored).toEqual([
                {capturedIndex: 0, itemId: 'alpha', reason: DockTopologyReconciler.REASON_APPLY_ERROR}
            ]);
            expectConservation(saved, result)
        } finally {
            DockRestorePlanner.restoreToward = original
        }
    });

    test('composition: same shape restores incrementally through the landed planner; changed shape adopts + reports displaced', () => {
        let capturedSame = tabsDoc(['alpha', 'beta']),
            liveSame     = {...tabsDoc(['alpha', 'beta']), nodes: {r: {type: 'tabs', items: ['alpha', 'beta'], activeItemId: 'beta'}}},
            expected     = DockRestorePlanner.restoreToward(liveSame, capturedSame),

            capturedGrow = tabsDoc(['gamma', 'delta']),
            liveGrow     = tabsDoc(['gamma', 'delta', 'extra']),

            saved  = capture([capturedSame, capturedGrow]),
            result = DockTopologyReconciler.reconcile(saved, [liveSame, liveGrow]);

        expect(result.errors).toEqual([]);
        expect(result.applied.map(entry => entry.mode)).toEqual(['incremental', 'adopt']);

        expect(result.documents[0]).toEqual(expected.document);
        expect(result.applied[0].applied).toBe(expected.applied);

        expect(result.documents[1]).toEqual(DockTopologyReconciler.capturedSlots(saved)[1]);
        expect(result.documents[1]).not.toBe(DockTopologyReconciler.capturedSlots(saved)[1]);
        expect(result.displaced).toEqual([{itemId: 'extra', liveIndex: 1}]);
        expectConservation(saved, result)
    });
});

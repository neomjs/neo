import {test, expect} from '@playwright/test';
import DeltaCoherenceRegistry, {
    COHERENCE_RULES,
    RETIREMENT_KINDS,
    extractInsertRootId,
    witnessInsertSort
} from '../../../../src/vdom/util/DeltaCoherenceRegistry.mjs';
import {ID_SORTS} from '../../../../src/vdom/util/DeltaGrammar.mjs';

/**
 * @summary Pins the cross-batch live-id ledger semantics against the registry's acceptance criteria.
 *
 * The exemplar batch sequences replay the real producer shapes the delta grammar census
 * ground-truthed: the stale-baseline insert birth, the lock-flip `attributes.id` identity migration,
 * pooled grid recycling (permanent-resident ids, updateNode-shaped reuse), and comment-anchored
 * fragment/vtext lifecycles which legitimately fail DOM element lookups. Findings are asserted
 * by rule identity — never by exact counts of unrelated rules — so the spec survives rule growth.
 *
 * The registry is a per-Main-realm plain-object singleton (the `StringFromVnode` sibling
 * discipline): this STRUCTURE spec exercises it single-threaded, which is exactly the layer
 * unit tests own — falsification against the real multi-threaded pipeline lives in
 * whitebox-e2e. Tests isolate through `clear()`; the batch sequence deliberately keeps
 * counting across clears, so batch-count assertions are delta-based.
 */

const rulesOf = findings => findings.map(finding => finding.rule);

/** Resets the singleton between tests and stamps the window label — the per-test ledger. */
const freshLedger = (windowId = null) => {
    DeltaCoherenceRegistry.clear();
    DeltaCoherenceRegistry.windowId = windowId;
    return DeltaCoherenceRegistry
};

/** Evaluates AND commits a batch, returning its findings — the applied-batch happy path. */
const apply = (registry, batch) => {
    const evaluation = registry.evaluateBatch(batch);

    evaluation.commit();
    return evaluation.findings
};

test.describe('DeltaCoherenceRegistry — ledger model', () => {
    test('carries the {windowId, idSort, id} model: explicit window label, per-entry sort', () => {
        const registry = freshLedger('window-7');

        expect(registry.windowId).toBe('window-7');

        apply(registry, [
            {action: 'insertNode', parentId: 'root', index: 0, vnode: {id: 'el-1', nodeName: 'div'}},
            {action: 'insertNode', parentId: 'root', index: 1, vnode: {id: 'frag-1', nodeName: 'fragment'}},
            {action: 'insertNode', parentId: 'root', index: 2, vnode: {id: 'txt-1', vtype: 'text'}}
        ]);

        const live = registry.liveSnapshot;

        expect(live.get('el-1').idSort).toBe(ID_SORTS.element);
        expect(live.get('frag-1').idSort).toBe(ID_SORTS.fragment);
        expect(live.get('txt-1').idSort).toBe(ID_SORTS.vtext)
    });

    test('per-window partitioning rides the per-realm singleton: a cleared ledger is a new window', () => {
        // Each browser window owns its own Main realm and therefore its own module instance —
        // the teleportation falsifier (same id, different windows) cannot collide across realms.
        // Single-threaded stand-in: clear() models the fresh-realm ledger.
        const
            birth   = [{action: 'insertNode', parentId: 'root', index: 0, vnode: {id: 'shared-id', nodeName: 'div'}}],
            windowA = freshLedger('a');

        expect(apply(windowA, birth)).toEqual([]);

        const windowB = freshLedger('b');

        // The same id borning in another window is legal — ids are only unique per window.
        expect(apply(windowB, birth)).toEqual([]);
        expect(windowB.windowId).toBe('b')
    });

    test('extractInsertRootId reads vnode.id, falls back to the outerHTML root tag, ignores delta.id', () => {
        expect(extractInsertRootId({vnode: {id: 'v-1'}})).toBe('v-1');
        expect(extractInsertRootId({outerHTML: '<div class="x" id="h-1"><span id="inner"></span></div>'})).toBe('h-1');
        // A top-level insertNode.id is emitted by some producers and IGNORED by the consumer —
        // trusting it would model fiction, so the extraction must not.
        expect(extractInsertRootId({id: 'ignored-1'})).toBeNull();
        expect(extractInsertRootId({outerHTML: '<div class="no-id"></div>'})).toBeNull();
        expect(extractInsertRootId(null)).toBeNull()
    });

    test('extractInsertRootId reads the data-neo-id spelling (useDomIds: false string renderer)', () => {
        // StringFromVnode emits data-neo-id instead of id when Neo.config.useDomIds is false.
        expect(extractInsertRootId({outerHTML: '<div class="x" data-neo-id="n-1"><span data-neo-id="inner"></span></div>'})).toBe('n-1');
        // Lookalike attributes must not false-match: the identity attribute needs leading whitespace.
        expect(extractInsertRootId({outerHTML: '<div grid-id="g-1" class="x"></div>'})).toBeNull();
        expect(extractInsertRootId({outerHTML: '<div data-id="d-1"></div>'})).toBeNull()
    });

    test('witnessInsertSort classifies payload roots: text → vtext, fragment → fragment, else element', () => {
        expect(witnessInsertSort({vnode: {vtype: 'text', id: 't'}})).toBe(ID_SORTS.vtext);
        expect(witnessInsertSort({vnode: {nodeName: 'fragment', id: 'f'}})).toBe(ID_SORTS.fragment);
        expect(witnessInsertSort({vnode: {nodeName: 'div', id: 'e'}})).toBe(ID_SORTS.element);
        expect(witnessInsertSort({outerHTML: '<div id="s"></div>'})).toBe(ID_SORTS.element)
    });
});

test.describe('DeltaCoherenceRegistry — C-insert (AC: the stale-baseline defect class)', () => {
    test('catches the replayed stale-baseline insert: a payload root id that is already live', () => {
        const registry = freshLedger();

        // Batch 1: the legitimate birth.
        expect(apply(registry, [
            {action: 'insertNode', parentId: 'neo-grid-body', index: 0, vnode: {id: 'neo-row-1', nodeName: 'div'}}
        ])).toEqual([]);

        // Batch 2: the stale-baseline shape — a producer working from a stale baseline births
        // the same id again. Each batch is internally well-formed (the per-batch guards stay
        // silent); only the cross-batch ledger sees the collision.
        const findings = apply(registry, [
            {action: 'insertNode', parentId: 'neo-grid-body', index: 1, vnode: {id: 'neo-row-1', nodeName: 'div'}}
        ]);

        expect(rulesOf(findings)).toEqual([COHERENCE_RULES.insert]);
        expect(findings[0].deltaIndex).toBe(0);
        expect(findings[0].detail).toContain('neo-row-1')
    });

    test('catches a string-rendered re-birth through the outerHTML root id', () => {
        const registry = freshLedger();

        apply(registry, [{action: 'insertNode', parentId: 'root', index: 0, outerHTML: '<div id="neo-s-1"></div>'}]);

        expect(rulesOf(apply(registry, [
            {action: 'insertNode', parentId: 'root', index: 1, outerHTML: '<div id="neo-s-1"></div>'}
        ]))).toEqual([COHERENCE_RULES.insert])
    });

    test('catches a data-neo-id string-rendered re-birth (useDomIds: false renderer output)', () => {
        const registry = freshLedger();

        apply(registry, [{action: 'insertNode', parentId: 'root', index: 0, outerHTML: '<div data-neo-id="neo-dn-1"></div>'}]);

        expect(rulesOf(apply(registry, [
            {action: 'insertNode', parentId: 'root', index: 1, outerHTML: '<div data-neo-id="neo-dn-1"></div>'}
        ]))).toEqual([COHERENCE_RULES.insert])
    });

    test('replaceChild births its toId under the same collision rule', () => {
        const registry = freshLedger();

        apply(registry, [
            {action: 'insertNode', parentId: 'root', index: 0, vnode: {id: 'a', nodeName: 'div'}},
            {action: 'insertNode', parentId: 'root', index: 1, vnode: {id: 'b', nodeName: 'div'}}
        ]);

        // Replacing a with a node claiming b's id: b is live elsewhere — two-nodes-one-id.
        expect(rulesOf(apply(registry, [
            {action: 'replaceChild', parentId: 'root', fromId: 'a', toId: 'b'}
        ]))).toEqual([COHERENCE_RULES.insert])
    });

    test('re-birth after removal is a legal lifecycle, not a finding', () => {
        const
            registry = freshLedger(),
            birth    = [{action: 'insertNode', parentId: 'root', index: 0, vnode: {id: 'cycle-1', nodeName: 'div'}}];

        expect(apply(registry, birth)).toEqual([]);
        expect(apply(registry, [{action: 'removeNode', id: 'cycle-1'}])).toEqual([]);
        expect(apply(registry, birth)).toEqual([])
    });
});

test.describe('DeltaCoherenceRegistry — C-rekey (AC: the lock-flip migration stays silent)', () => {
    test('a legitimate attributes.id identity migration produces ZERO findings', () => {
        const registry = freshLedger();

        apply(registry, [{action: 'insertNode', parentId: 'root', index: 0, vnode: {id: 'neo-cell-a', nodeName: 'div'}}]);

        // The lock-flip rides exactly this path: updateNode renames a live node.
        expect(apply(registry, [
            {id: 'neo-cell-a', attributes: {id: 'neo-cell-b'}}
        ])).toEqual([]);

        expect(registry.liveSnapshot.has('neo-cell-b')).toBe(true);
        expect(registry.liveSnapshot.has('neo-cell-a')).toBe(false);
        expect(registry.retiredSnapshot.has('neo-cell-a')).toBe(false)
    });

    test('the freed old id is legally reusable — freed, not died', () => {
        const registry = freshLedger();

        apply(registry, [{action: 'insertNode', parentId: 'root', index: 0, vnode: {id: 'neo-cell-a', nodeName: 'div'}}]);
        apply(registry, [{id: 'neo-cell-a', attributes: {id: 'neo-cell-b'}}]);

        expect(apply(registry, [
            {action: 'insertNode', parentId: 'root', index: 1, vnode: {id: 'neo-cell-a', nodeName: 'div'}}
        ])).toEqual([])
    });

    test('renaming ONTO a live id is the finding: two nodes now answer to one id', () => {
        const registry = freshLedger();

        apply(registry, [
            {action: 'insertNode', parentId: 'root', index: 0, vnode: {id: 'x', nodeName: 'div'}},
            {action: 'insertNode', parentId: 'root', index: 1, vnode: {id: 'y', nodeName: 'div'}}
        ]);

        const findings = apply(registry, [{id: 'x', attributes: {id: 'y'}}]);

        expect(rulesOf(findings)).toEqual([COHERENCE_RULES.rekey]);
        expect(findings[0].detail).toContain('"x"');
        expect(findings[0].detail).toContain('"y"')
    });

    test('rekey re-points the witnessed child edges: cascade follows the NEW id', () => {
        const registry = freshLedger();

        apply(registry, [
            {action: 'insertNode', parentId: 'root', index: 0, vnode: {id: 'p-old', nodeName: 'div'}},
            {action: 'insertNode', parentId: 'p-old', index: 0, vnode: {id: 'child', nodeName: 'div'}}
        ]);
        apply(registry, [{id: 'p-old', attributes: {id: 'p-new'}}]);
        apply(registry, [{action: 'removeNode', id: 'p-new'}]);

        // The child went down with the renamed parent — touching it is a C-target finding.
        expect(rulesOf(apply(registry, [
            {id: 'child', style: {color: 'red'}}
        ]))).toEqual([COHERENCE_RULES.target])
    });

    test('an attributes.id removal sentinel retires the identity as unaddressable', () => {
        const registry = freshLedger();

        apply(registry, [{action: 'insertNode', parentId: 'root', index: 0, vnode: {id: 'doomed', nodeName: 'div'}}]);
        expect(apply(registry, [{id: 'doomed', attributes: {id: null}}])).toEqual([]);

        expect(registry.retiredSnapshot.get('doomed').kind).toBe(RETIREMENT_KINDS.unaddressable);
        expect(rulesOf(apply(registry, [
            {id: 'doomed', style: {color: 'red'}}
        ]))).toEqual([COHERENCE_RULES.target])
    });
});

test.describe('DeltaCoherenceRegistry — recycling exemplars (AC: pooled runs stay silent)', () => {
    test('pooled updateNode reuse with permanent-resident ids produces ZERO findings across batches', () => {
        const
            registry  = freshLedger(),
            baseCount = registry.batchCount,
            rowIds    = ['neo-row-1', 'neo-row-2', 'neo-row-3'];

        // Mount batch: the pool's permanent residents are born once.
        expect(apply(registry, rowIds.map((id, index) => (
            {action: 'insertNode', parentId: 'neo-grid-body', index, vnode: {id, nodeName: 'div'}}
        )))).toEqual([]);

        // Scroll batches: the pool recycles rows by REWRITING them in place — updateNode-shaped
        // reuse (cls/style/content/aria), never remove→insert. The census proved this is the
        // recycling contract; the ledger must stay silent through arbitrarily many runs.
        for (let run = 0; run < 5; run++) {
            const findings = apply(registry, rowIds.flatMap(id => ([
                {id, cls: {add: ['neo-even'], remove: ['neo-odd']}, style: {transform: `translateY(${run * 32}px)`}},
                {id, attributes: {'aria-rowindex': String(run)}, innerHTML: `row content ${run}`}
            ])));

            expect(findings).toEqual([])
        }

        // Delta-based: the batch sequence keeps counting across clear() by design.
        expect(registry.batchCount - baseCount).toBe(6)
    });
});

test.describe('DeltaCoherenceRegistry — sort-awareness (AC: ledger resolution, never DOM probes)', () => {
    test('vtext lifecycle resolves against the ledger: update, remove-with-parentId, then dead', () => {
        const registry = freshLedger();

        apply(registry, [{action: 'insertNode', parentId: 'neo-label-1', index: 0, vnode: {id: 'neo-vtext-1', vtype: 'text'}}]);

        // A vtext id fails any DOM element lookup by construction — the ledger is the oracle.
        expect(apply(registry, [
            {action: 'updateVtext', id: 'neo-vtext-1', parentId: 'neo-label-1', value: 'Total: 42'}
        ])).toEqual([]);

        expect(apply(registry, [
            {action: 'removeNode', id: 'neo-vtext-1', parentId: 'neo-label-1'}
        ])).toEqual([]);

        const findings = apply(registry, [
            {action: 'updateVtext', id: 'neo-vtext-1', parentId: 'neo-label-1', value: 'stale write'}
        ]);

        expect(rulesOf(findings)).toEqual([COHERENCE_RULES.target]);
        expect(findings[0].detail).toContain('neo-vtext-1')
    });

    test('fragment lifecycle resolves against the ledger identically', () => {
        const registry = freshLedger();

        apply(registry, [{action: 'insertNode', parentId: 'neo-host-1', index: 0, vnode: {id: 'neo-frag-1', nodeName: 'fragment'}}]);
        expect(registry.liveSnapshot.get('neo-frag-1').idSort).toBe(ID_SORTS.fragment);

        expect(apply(registry, [{action: 'moveNode', id: 'neo-frag-1', parentId: 'neo-host-2', index: 0}])).toEqual([]);
        expect(apply(registry, [{action: 'removeNode', id: 'neo-frag-1', parentId: 'neo-host-2'}])).toEqual([]);

        expect(rulesOf(apply(registry, [
            {action: 'moveNode', id: 'neo-frag-1', parentId: 'neo-host-1', index: 0}
        ]))).toEqual([COHERENCE_RULES.target])
    });

    test('updateVtext refines a first-touch sort guess silently — sort is metadata, never a gate', () => {
        const registry = freshLedger();

        // Pre-session id, first witnessed through a generic touch: guessed element.
        apply(registry, [{action: 'focusNode', id: 'pre-session-1'}]);
        expect(registry.liveSnapshot.get('pre-session-1').idSort).toBe(ID_SORTS.element);

        // Better evidence arrives: the id answers to updateVtext — refine, no finding.
        expect(apply(registry, [
            {action: 'updateVtext', id: 'pre-session-1', parentId: 'neo-label-1', value: 'x'}
        ])).toEqual([]);
        expect(registry.liveSnapshot.get('pre-session-1').idSort).toBe(ID_SORTS.vtext)
    });
});

test.describe('DeltaCoherenceRegistry — seeding and conservatism', () => {
    test('accept-unknown-as-live-on-first-touch: pre-session ids are absorbed, then protected', () => {
        const registry = freshLedger();

        // The ledger was born mid-session; this id predates it. First touch absorbs it…
        expect(apply(registry, [{id: 'pre-session-row', style: {color: 'red'}}])).toEqual([]);
        expect(registry.liveSnapshot.get('pre-session-row').witnessed).toBe('first-touch');

        // …and from that moment the id is protected like any witnessed birth.
        expect(rulesOf(apply(registry, [
            {action: 'insertNode', parentId: 'root', index: 0, vnode: {id: 'pre-session-row', nodeName: 'div'}}
        ]))).toEqual([COHERENCE_RULES.insert])
    });

    test('an evaluated-but-uncommitted batch leaves the ledger untouched (the rejected-batch contract)', () => {
        const
            registry  = freshLedger(),
            baseCount = registry.batchCount;

        apply(registry, [{action: 'insertNode', parentId: 'root', index: 0, vnode: {id: 'stable-1', nodeName: 'div'}}]);

        // Evaluate a destructive batch — and drop the commit handle (guards rejected it /
        // application aborted).
        const evaluation = registry.evaluateBatch([
            {action: 'removeNode', id: 'stable-1'},
            {action: 'insertNode', parentId: 'root', index: 0, vnode: {id: 'phantom-1', nodeName: 'div'}}
        ]);

        expect(evaluation.findings).toEqual([]);
        expect(registry.liveSnapshot.has('stable-1')).toBe(true);
        expect(registry.liveSnapshot.has('phantom-1')).toBe(false);
        expect(registry.batchCount - baseCount).toBe(1)
    });

    test('within-batch transitions resolve in order, like the consumer applies them', () => {
        const registry = freshLedger();

        // One batch: birth + in-place update + remove tail (U3-legal ordering).
        expect(apply(registry, [
            {action: 'insertNode', parentId: 'root', index: 0, vnode: {id: 'flash-1', nodeName: 'div'}},
            {id: 'flash-1', style: {opacity: '0.5'}},
            {action: 'removeNode', id: 'flash-1'}
        ])).toEqual([]);

        expect(registry.retiredSnapshot.get('flash-1').kind).toBe(RETIREMENT_KINDS.removed)
    });

    test('never throws on garbage batches — findings or silence, never exceptions', () => {
        const registry = freshLedger();

        expect(() => apply(registry, null)).not.toThrow();
        expect(() => apply(registry, [null, undefined, 42, 'nonsense'])).not.toThrow();
        expect(() => apply(registry, [{action: 'unknownAction', id: 'u-1'}])).not.toThrow();
        expect(() => apply(registry, [{action: 'insertNode'}])).not.toThrow()
    });
});

test.describe('DeltaCoherenceRegistry — retirement cascades over witnessed edges', () => {
    test('removeNode retires the witnessed subtree transitively', () => {
        const registry = freshLedger();

        apply(registry, [
            {action: 'insertNode', parentId: 'root', index: 0, vnode: {id: 'branch', nodeName: 'div'}},
            {action: 'insertNode', parentId: 'branch', index: 0, vnode: {id: 'leaf', nodeName: 'div'}},
            {action: 'insertNode', parentId: 'leaf', index: 0, vnode: {id: 'deep-leaf', nodeName: 'div'}}
        ]);

        expect(apply(registry, [{action: 'removeNode', id: 'branch'}])).toEqual([]);

        expect(rulesOf(apply(registry, [{id: 'deep-leaf', style: {color: 'red'}}]))).toEqual([COHERENCE_RULES.target])
    });

    test('removeAll retires the witnessed children of the parent; the parent survives', () => {
        const registry = freshLedger();

        apply(registry, [
            {action: 'insertNode', parentId: 'root', index: 0, vnode: {id: 'list', nodeName: 'ul'}},
            {action: 'insertNode', parentId: 'list', index: 0, vnode: {id: 'item-1', nodeName: 'li'}},
            {action: 'insertNode', parentId: 'list', index: 1, vnode: {id: 'item-2', nodeName: 'li'}}
        ]);

        expect(apply(registry, [{action: 'removeAll', parentId: 'list'}])).toEqual([]);

        expect(registry.liveSnapshot.has('list')).toBe(true);
        expect(rulesOf(apply(registry, [
            {action: 'moveNode', id: 'item-1', parentId: 'list', index: 0}
        ]))).toEqual([COHERENCE_RULES.target]);

        // Re-populating after the wipe is the legal continuation.
        expect(apply(registry, [
            {action: 'insertNode', parentId: 'list', index: 0, vnode: {id: 'item-1', nodeName: 'li'}}
        ])).toEqual([])
    });

    test('moveNode re-points the witnessed edge: cascade follows the CURRENT parent', () => {
        const registry = freshLedger();

        apply(registry, [
            {action: 'insertNode', parentId: 'root', index: 0, vnode: {id: 'old-home', nodeName: 'div'}},
            {action: 'insertNode', parentId: 'root', index: 1, vnode: {id: 'new-home', nodeName: 'div'}},
            {action: 'insertNode', parentId: 'old-home', index: 0, vnode: {id: 'mover', nodeName: 'div'}}
        ]);

        apply(registry, [{action: 'moveNode', id: 'mover', parentId: 'new-home', index: 0}]);

        // Removing the old home must NOT take the moved node with it…
        apply(registry, [{action: 'removeNode', id: 'old-home'}]);
        expect(apply(registry, [{id: 'mover', style: {color: 'red'}}])).toEqual([]);

        // …removing the new home must.
        apply(registry, [{action: 'removeNode', id: 'new-home'}]);
        expect(rulesOf(apply(registry, [{id: 'mover', style: {color: 'blue'}}]))).toEqual([COHERENCE_RULES.target])
    });

    test('an unaddressable node stays a cascade conduit: ancestor removal still reaches its children', () => {
        const registry = freshLedger();

        apply(registry, [
            {action: 'insertNode', parentId: 'root', index: 0, vnode: {id: 'grandparent', nodeName: 'div'}},
            {action: 'insertNode', parentId: 'grandparent', index: 0, vnode: {id: 'middle', nodeName: 'div'}},
            {action: 'insertNode', parentId: 'middle', index: 0, vnode: {id: 'inner', nodeName: 'div'}}
        ]);

        // The middle node loses its identity — but physically remains in the tree.
        apply(registry, [{id: 'middle', attributes: {id: null}}]);
        expect(apply(registry, [{id: 'inner', style: {color: 'red'}}])).toEqual([]);

        // When the grandparent goes, the physical subtree goes with it — THROUGH the id-less node.
        apply(registry, [{action: 'removeNode', id: 'grandparent'}]);
        expect(rulesOf(apply(registry, [{id: 'inner', style: {color: 'blue'}}]))).toEqual([COHERENCE_RULES.target])
    });

    test('replaceChild retires the fromId subtree and frees its label for later reuse', () => {
        const registry = freshLedger();

        apply(registry, [
            {action: 'insertNode', parentId: 'root', index: 0, vnode: {id: 'before', nodeName: 'div'}},
            {action: 'insertNode', parentId: 'before', index: 0, vnode: {id: 'before-child', nodeName: 'div'}}
        ]);

        expect(apply(registry, [
            {action: 'replaceChild', parentId: 'root', fromId: 'before', toId: 'after'}
        ])).toEqual([]);

        expect(registry.liveSnapshot.has('after')).toBe(true);
        expect(rulesOf(apply(registry, [{id: 'before-child', style: {color: 'red'}}]))).toEqual([COHERENCE_RULES.target]);

        // The replaced label is re-birthable: remove→insert equivalence.
        expect(apply(registry, [
            {action: 'insertNode', parentId: 'root', index: 1, vnode: {id: 'before', nodeName: 'div'}}
        ])).toEqual([])
    });

    test('positioning against a retired parent is a C-target finding', () => {
        const registry = freshLedger();

        apply(registry, [{action: 'insertNode', parentId: 'root', index: 0, vnode: {id: 'gone-parent', nodeName: 'div'}}]);
        apply(registry, [{action: 'removeNode', id: 'gone-parent'}]);

        expect(rulesOf(apply(registry, [
            {action: 'insertNode', parentId: 'gone-parent', index: 0, vnode: {id: 'orphan', nodeName: 'div'}}
        ]))).toEqual([COHERENCE_RULES.target])
    });
});

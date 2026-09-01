import {ID_SORTS, RESERVED_TARGET_IDS, resolveAction, normalizeBatch} from './DeltaGrammar.mjs';

/**
 * The cross-batch live-id ledger behind the delta grammar guards.
 *
 * The per-batch predicates in `DeltaGrammar.mjs` catch grammatically illegal batches; the defect
 * family which motivated the contract layer (two-nodes-one-id, stale-baseline insert
 * births) is cross-batch incoherence — each batch internally well-formed, the wrongness only
 * visible against the live tree state previous batches left behind. Stateless guards are
 * structurally blind to that class; this registry is the state.
 *
 * **Singleton discipline (the `StringFromVnode` sibling pattern):** a plain-object singleton —
 * no class lifecycle, no instantiation. Each browser window owns its own Main-thread realm, so
 * the singleton IS per-window by construction; the `windowId` field keeps the partition explicit
 * for the `{windowId, idSort, id}` ledger model and for diagnostics. Teleportation and
 * multi-window apps legitimately reuse ids across windows — the per-realm module instance is the
 * isolation boundary. The module is loaded DYNAMICALLY by `Neo.main.DeltaUpdates` only when
 * `Neo.config.useDeltaCoherenceRegistry` is enabled: Main-thread bundles stay tiny; with the
 * flag off, not a byte of this file ships into the page.
 *
 * **Liveness is ledger-resolved, never DOM-probed:** the id space is three-sorted (see
 * `ID_SORTS`) — a failed element lookup does not imply an id is not live (fragment ranges and
 * vtext comment pairs legitimately fail element lookups). The ledger is the oracle; this module
 * performs no DOM access at all.
 *
 * **Seeding — accept-unknown-as-live-on-first-touch:** a ledger born mid-session starts blind.
 * Instead of seeding from a DOM walk (realm coupling) or staying silent until a full mount
 * (misses everything before it), an id the ledger has never seen is accepted as live the first
 * time any delta references it. By construction this can never false-positive: findings only
 * fire against ids whose birth or death the ledger directly witnessed. The cost is silent
 * convergence — the first illegal touch of a pre-session id is missed, every subsequent one is
 * caught.
 *
 * **Pool recycling stays invisible by design:** grid row/cell pools reuse nodes via `updateNode`
 * with permanent-resident ids (`grid/Row.mjs`, `grid/Body.mjs`) — reuse never manifests as
 * remove→insert, so it never trips the insert rule. An `insertNode` whose payload root id is
 * already live is genuinely illegal under this architecture (established by the grammar census).
 *
 * **Payload roots only, witnessed edges only:** the ledger tracks ids that deltas directly
 * address (insert payload roots, targets, parents) — it does not walk insert payload subtrees.
 * Walking would either false-positive on re-inserts after subtree removals (descendants tracked
 * but not transitively retired) or require mirroring the full DOM tree. Parent→child edges are
 * recorded as witnessed from the deltas themselves (`parentId` fields, payload roots under
 * parents), and retirement cascades transitively over exactly those witnessed edges. Unwitnessed
 * descendants converge through first-touch instead — the conservative, never-false-positive
 * direction: misses degrade to false negatives, never false positives.
 *
 * **Findings, never throws — observe-mode:** like the U5 candidate predicate, every rule reports
 * `{rule, deltaIndex, detail}` findings and never throws. The single-threaded unit layer covers
 * the ledger structure itself; falsification evidence for the real multi-threaded pipeline —
 * where the motivating defect family actually lives — belongs to whitebox-e2e runs against live
 * apps with the config flag enabled. Promotion to a throwing guard requires that e2e evidence,
 * recorded as an explicit decision.
 *
 * **Check/commit split — rejected batches must not mutate the ledger:** `evaluateBatch()`
 * computes findings against the pre-batch state (simulating within-batch transitions in order)
 * and returns a commit handle; the caller commits only after the batch actually applied. A batch
 * rejected by the grammar guards, or aborted mid-application, leaves the ledger untouched — the
 * ledger mirrors what reached the DOM. A mid-loop DOM exception after a successful guard pass
 * desyncs the DOM from the vnode model itself; the uncommitted ledger then under-counts, which
 * first-touch absorbs (missed findings, never false ones).
 * @namespace Neo.vdom.util.DeltaCoherenceRegistry
 */

/**
 * The coherence rule identifiers, mirroring the kernel's U-rule naming.
 * `C-remove` from the ticket vocabulary is retirement *semantics* (a ledger transition), not a
 * finding emitter — a remove targeting a known-dead id reports as `C-target`.
 * @type {Object}
 */
export const COHERENCE_RULES = Object.freeze({
    insert: 'C-insert',
    rekey : 'C-rekey',
    target: 'C-target'
});

/**
 * How an id left the live set.
 * - `removed`: the node physically left the DOM (removeNode / removeAll / replaceChild fromId,
 *   or a retirement cascade through a removed ancestor). Its witnessed edges are dissolved.
 * - `unaddressable`: the node lost its id (`updateNode.attributes.id` carrying a removal
 *   sentinel, or a rename collision) but physically remains in the DOM — its witnessed child
 *   edges stay intact so a later ancestor removal still cascades through it.
 * @type {Object}
 */
export const RETIREMENT_KINDS = Object.freeze({
    removed      : 'removed',
    unaddressable: 'unaddressable'
});

/**
 * In-band deletion sentinels for `updateNode.attributes` values, as consumed by
 * `Neo.main.DeltaUpdates#updateNode` (null / empty string remove the attribute).
 * @type {Set<null|String>}
 */
const REMOVAL_SENTINELS = new Set([null, '']);

/**
 * Extracts the identity an `insertNode` actually births: the payload root id.
 * Deliberately diverges from the U5 extraction (`delta.id ?? vnode.id`) — a top-level
 * `insertNode.id` is emitted by some manual producers and ignored by the consumer, so trusting
 * it would model fiction. The truth lives in `vnode.id`, or in the root tag's identity
 * attribute for string-rendered payloads — which has two spellings: `id` under
 * `Neo.config.useDomIds: true`, `data-neo-id` otherwise (`StringFromVnode` emits exactly one).
 * The leading whitespace requirement keeps lookalike attributes (`grid-id`, `data-id`) from
 * false-matching.
 * @param {Object} delta An insertNode delta
 * @returns {String|null} The payload root id, or null when none is recoverable
 */
export function extractInsertRootId(delta) {
    const vnodeId = delta?.vnode?.id;

    if (typeof vnodeId === 'string' && vnodeId !== '') {
        return vnodeId
    }

    if (typeof delta?.outerHTML === 'string') {
        const match = delta.outerHTML.match(/^\s*<[a-zA-Z][^>]*?\s(?:data-neo-)?id="([^"]+)"/);

        if (match) {
            return match[1]
        }
    }

    return null
}

/**
 * Witnesses an inserted payload root's id sort from the payload itself:
 * `vtype: 'text'` vnodes are vtext comment pairs, `nodeName: 'fragment'` vnodes are
 * comment-anchored ranges, everything else (including string payloads) is an element.
 * @param {Object} delta An insertNode delta
 * @returns {String} One of the `ID_SORTS` values
 */
export function witnessInsertSort(delta) {
    const vnode = delta?.vnode;

    if (vnode?.vtype === 'text') {
        return ID_SORTS.vtext
    }

    if (vnode?.nodeName === 'fragment') {
        return ID_SORTS.fragment
    }

    return ID_SORTS.element
}

/**
 * @summary The per-window cross-batch live-id ledger with coherence rules over delta batches.
 *
 * Plain-object singleton on purpose (the `StringFromVnode` sibling discipline): the consumer
 * (`Neo.main.DeltaUpdates`) dynamically imports it behind `Neo.config.useDeltaCoherenceRegistry`
 * and assigns `windowId` once; tests reset shared state via `clear()`.
 */
const DeltaCoherenceRegistry = {
    /**
     * Monotonic batch sequence, incremented per committed batch. `bornAt` / `retiredAt`
     * diagnostics reference these values.
     * @member {Number} batchSeq=0
     * @protected
     */
    batchSeq: 0,
    /**
     * Witnessed parent→children edges over live (and unaddressable-retired) ids:
     * parentId → Set of child ids. Retirement cascades traverse exactly these edges.
     * @member {Map<String, Set<String>>} children
     * @protected
     */
    children: new Map(),
    /**
     * The live set: id → `{idSort, parentId, bornAt, witnessed}`.
     * `witnessed` records how the entry came to be known: `'insert'`, `'rekey'`, or
     * `'first-touch'` (pre-session id accepted as live on first reference).
     * @member {Map<String, Object>} live
     * @protected
     */
    live: new Map(),
    /**
     * The retired set: id → `{idSort, retiredAt, kind}` with `kind` from `RETIREMENT_KINDS`.
     * Distinguishing known-dead from never-seen is the whole point of this map — `C-target`
     * fires only against known-dead ids; never-seen ids first-touch into the live set.
     * @member {Map<String, Object>} retired
     * @protected
     */
    retired: new Map(),
    /**
     * Explicit window partition label for the `{windowId, idSort, id}` ledger model. The
     * per-realm module instance is the actual isolation boundary; the consumer assigns this
     * once at load time for diagnostics.
     * @member {String|null} windowId=null
     */
    windowId: null,

    /**
     * The number of committed batches so far.
     * @returns {Number}
     */
    get batchCount() {
        return this.batchSeq
    },

    /**
     * A snapshot of the live id set (for tests and diagnostics; mutating it does not affect
     * the ledger).
     * @returns {Map<String, Object>}
     */
    get liveSnapshot() {
        return new Map(this.live)
    },

    /**
     * A snapshot of the retired id set (for tests and diagnostics).
     * @returns {Map<String, Object>}
     */
    get retiredSnapshot() {
        return new Map(this.retired)
    },

    /**
     * Births an id into the live view: legal over unknown (fresh birth) and retired (re-birth —
     * remove→insert is a legitimate node lifecycle); a birth colliding with a LIVE id is the
     * `C-insert` defect class — two nodes answering to one id.
     * Re-birthing an `unaddressable`-retired id severs that id's stale child edges first: the
     * physical id-less node (and its subtree) remains in the DOM, but the label now belongs to
     * the new node — the orphaned children stay live with an unknown parent (conservative leak
     * in the false-negative direction).
     * @param {Object} tx The active transaction
     * @param {String} id The id being born
     * @param {String} idSort One of `ID_SORTS`
     * @param {String|undefined} parentId The witnessed parent
     * @param {Number} deltaIndex
     * @param {String} action The acting delta's action (for the finding detail)
     * @protected
     */
    birth(tx, id, idSort, parentId, deltaIndex, action) {
        if (typeof id !== 'string' || id === '') {
            return
        }

        const resolved = this.resolve(tx, id);

        if (resolved.state === 'live') {
            tx.findings.push({
                rule      : COHERENCE_RULES.insert,
                deltaIndex,
                detail    : `${action} births id "${id}" which is already live (born batch ${resolved.entry.bornAt}, sort ${resolved.entry.idSort})`
            });
            return
        }

        if (resolved.state === 'retired' && resolved.entry.kind === RETIREMENT_KINDS.unaddressable) {
            this.orphanChildren(tx, id)
        }

        tx.live.set(id, {idSort, parentId: parentId ?? null, bornAt: this.batchSeq, witnessed: 'insert'});
        tx.retired.delete(id);
        tx.touchedRetired.add(id);
        this.linkChild(tx, parentId, id)
    },

    /**
     * Reads a child set through the transaction, cloning the committed set on first write-touch.
     * @param {Object} tx
     * @param {String} parentId
     * @returns {Set<String>}
     * @protected
     */
    childrenOf(tx, parentId) {
        if (!tx.children.has(parentId)) {
            tx.children.set(parentId, new Set(this.children.get(parentId) ?? []))
        }

        return tx.children.get(parentId)
    },

    /**
     * Resets every ledger structure (tests, or an explicit operator reset). The window label
     * survives; the batch sequence deliberately keeps counting so diagnostics stay monotonic.
     */
    clear() {
        const me = this;

        me.children.clear();
        me.live.clear();
        me.retired.clear()
    },

    /**
     * Applies a transaction's accumulated state onto the committed ledger structures and
     * advances the batch sequence. Invoked via the `commit` handle `evaluateBatch()` returns.
     * @param {Object} tx The evaluated transaction
     * @protected
     */
    commitTransaction(tx) {
        const me = this;

        tx.freed.forEach(id => {
            me.live.delete(id)
        });

        tx.touchedRetired.forEach(id => {
            me.retired.delete(id)
        });

        tx.retired.forEach((entry, id) => {
            me.retired.set(id, entry);
            me.live.delete(id)
        });

        tx.live.forEach((entry, id) => {
            me.live.set(id, entry)
        });

        tx.children.forEach((set, parentId) => {
            if (set.size === 0) {
                me.children.delete(parentId)
            } else {
                me.children.set(parentId, set)
            }
        });

        me.batchSeq++
    },

    /**
     * Creates the per-batch transaction: copy-on-write views over the committed maps plus the
     * findings accumulator. `touchedRetired` records un-retirements (re-births) so commit can
     * clear them from the committed retired set; `freed` records rekey-released old ids.
     * @returns {Object}
     * @protected
     */
    createTransaction() {
        return {
            children      : new Map(), // parentId → Set (cloned from committed on first touch)
            findings      : [],
            freed         : new Set(), // ids released by a rekey — reusable, never "died"
            live          : new Map(), // id → entry (this batch's births / first-touches / rekeys)
            retired       : new Map(), // id → retirement entry (this batch's retirements)
            touchedRetired: new Set()  // ids un-retired this batch
        }
    },

    /**
     * @summary Evaluates a delta batch against the ledger, returning findings plus a commit handle.
     *
     * Walks the batch in order over a transaction view (pre-batch state + this batch's own
     * transitions, so within-batch sequences resolve exactly like the DOM consumer applies them),
     * collecting `{rule, deltaIndex, detail}` findings. Nothing persists until `commit()` is
     * invoked — call it strictly AFTER the batch applied to the DOM. Never throws; malformed
     * deltas are U1/U2 territory (the grammar guards) and are skipped here.
     * @param {Object|Object[]} deltas A delta batch (array) or a single delta object
     * @returns {Object} `{findings: Object[], commit: Function}` — `commit()` applies the
     * witnessed transitions and increments the batch sequence; safe to drop on rejection.
     */
    evaluateBatch(deltas) {
        const
            me    = this,
            batch = normalizeBatch(deltas),
            tx    = me.createTransaction();

        batch.forEach((delta, deltaIndex) => {
            if (!delta || typeof delta !== 'object') {
                return // U1 territory; grammar guards own the report
            }

            switch (resolveAction(delta)) {
                case 'focusNode':
                    me.touchTarget(tx, delta.id, deltaIndex, 'focusNode');
                    break
                case 'insertNode':
                    me.evaluateInsert(tx, delta, deltaIndex);
                    break
                case 'moveNode':
                    me.touchTarget(tx, delta.id, deltaIndex, 'moveNode');
                    me.touchParent(tx, delta.parentId, deltaIndex, 'moveNode');
                    me.reparent(tx, delta.id, delta.parentId);
                    break
                case 'removeAll':
                    me.touchParent(tx, delta.parentId, deltaIndex, 'removeAll');
                    me.retireChildren(tx, delta.parentId);
                    break
                case 'removeNode':
                    me.touchTarget(tx, delta.id, deltaIndex, 'removeNode');
                    delta.parentId && me.touchParent(tx, delta.parentId, deltaIndex, 'removeNode');
                    me.retire(tx, delta.id);
                    break
                case 'replaceChild':
                    me.touchTarget(tx, delta.fromId, deltaIndex, 'replaceChild');
                    me.touchParent(tx, delta.parentId, deltaIndex, 'replaceChild');
                    me.retire(tx, delta.fromId);
                    me.birth(tx, delta.toId, ID_SORTS.element, delta.parentId, deltaIndex, 'replaceChild');
                    break
                case 'updateNode':
                    me.evaluateUpdate(tx, delta, deltaIndex);
                    break
                case 'updateVtext':
                    me.touchTarget(tx, delta.id, deltaIndex, 'updateVtext', ID_SORTS.vtext);
                    delta.parentId && me.touchParent(tx, delta.parentId, deltaIndex, 'updateVtext');
                    break
            }
        });

        return {
            findings: tx.findings,
            commit  : () => me.commitTransaction(tx)
        }
    },

    /**
     * Evaluates an `insertNode`: parent reference first (witnessing the edge), then the payload
     * root birth. Payload roots without a recoverable id are skipped — conservative, and the
     * id-less-insert grammar concern is the guards' domain, not the ledger's.
     * @param {Object} tx
     * @param {Object} delta
     * @param {Number} deltaIndex
     * @protected
     */
    evaluateInsert(tx, delta, deltaIndex) {
        this.touchParent(tx, delta.parentId, deltaIndex, 'insertNode');

        const rootId = extractInsertRootId(delta);

        if (rootId) {
            this.birth(tx, rootId, witnessInsertSort(delta), delta.parentId, deltaIndex, 'insertNode')
        }
    },

    /**
     * Evaluates an `updateNode` (including the action-less wire spelling): target reference
     * semantics, then the `attributes.id` identity migration — re-keying the entry old→new
     * atomically (`C-rekey`). The legitimate rename path (lock-flip identity migration) must
     * stay silent; a rename ONTO a live id is the finding. A rename carrying a removal sentinel
     * retires the target as `unaddressable` (the node remains, its identity is gone).
     * @param {Object} tx
     * @param {Object} delta
     * @param {Number} deltaIndex
     * @protected
     */
    evaluateUpdate(tx, delta, deltaIndex) {
        const id = delta.id;

        if (typeof id !== 'string' || id === '' || RESERVED_TARGET_IDS.has(id)) {
            return // U4 territory (id-less) or an intentional global write — never ledger entries
        }

        const targetOk = this.touchTarget(tx, id, deltaIndex, 'updateNode');

        if (!targetOk || !delta.attributes || !Object.hasOwn(delta.attributes, 'id')) {
            return
        }

        const newId = delta.attributes.id;

        if (REMOVAL_SENTINELS.has(newId)) {
            // Identity removal: the node physically remains (children edges stay), the label dies.
            this.retireSingle(tx, id, RETIREMENT_KINDS.unaddressable);
            return
        }

        if (typeof newId !== 'string' || newId === id) {
            return
        }

        const collision = this.resolve(tx, newId);

        if (collision.state === 'live') {
            tx.findings.push({
                rule      : COHERENCE_RULES.rekey,
                deltaIndex,
                detail    : `updateNode renames "${id}" onto live id "${newId}" (born batch ${collision.entry.bornAt}) — two nodes now answer to one id`
            });
            // Model what the DOM does: the renamed node stops answering to its old id; the
            // first-witnessed holder keeps the colliding label in the ledger.
            this.retireSingle(tx, id, RETIREMENT_KINDS.unaddressable);
            return
        }

        this.rekey(tx, id, newId)
    },

    /**
     * Witnesses a parent→child edge.
     * @param {Object} tx
     * @param {String|undefined} parentId
     * @param {String} id
     * @protected
     */
    linkChild(tx, parentId, id) {
        if (typeof parentId === 'string' && parentId !== '' && !RESERVED_TARGET_IDS.has(parentId)) {
            this.childrenOf(tx, parentId).add(id)
        }
    },

    /**
     * Severs a re-birthed `unaddressable` id's stale child edges: the orphaned children remain
     * live (their physical nodes still exist under the old id-less node) with an unknown parent.
     * @param {Object} tx
     * @param {String} id
     * @protected
     */
    orphanChildren(tx, id) {
        const me = this;

        me.childrenOf(tx, id).forEach(childId => {
            const resolved = me.resolve(tx, childId);

            if (resolved.state === 'live') {
                tx.live.set(childId, {...resolved.entry, parentId: null})
            }
        });

        tx.children.set(id, new Set())
    },

    /**
     * Re-keys a live entry old→new atomically: the entry moves, its child edges move with it
     * (each child's witnessed `parentId` re-points), and its membership in its parent's child
     * set swaps. The old id becomes free for legitimate reuse.
     * @param {Object} tx
     * @param {String} oldId
     * @param {String} newId
     * @protected
     */
    rekey(tx, oldId, newId) {
        const
            me       = this,
            resolved = me.resolve(tx, oldId),
            entry    = {...resolved.entry, witnessed: 'rekey'};

        // The entry moves to its new key; the old key is "freed", not "died" — it never enters
        // the retired set, so reusing it is legal and resolves as unknown.
        tx.live.delete(oldId);
        tx.live.set(newId, entry);
        tx.touchedRetired.add(newId);
        tx.freed.add(oldId);

        // Child edges follow the rename.
        const childSet = me.childrenOf(tx, oldId);

        childSet.forEach(childId => {
            const childResolved = me.resolve(tx, childId);

            if (childResolved.state === 'live') {
                tx.live.set(childId, {...childResolved.entry, parentId: newId})
            }
        });

        tx.children.set(newId, new Set(childSet));
        tx.children.set(oldId, new Set());

        // Parent membership swaps.
        if (entry.parentId) {
            const siblings = me.childrenOf(tx, entry.parentId);

            siblings.delete(oldId);
            siblings.add(newId)
        }
    },

    /**
     * Witnesses a `moveNode` reparenting: the entry's parent edge re-points and child-set
     * membership moves.
     * @param {Object} tx
     * @param {String} id
     * @param {String|undefined} parentId
     * @protected
     */
    reparent(tx, id, parentId) {
        if (typeof id !== 'string' || id === '' || typeof parentId !== 'string' || parentId === '') {
            return
        }

        const resolved = this.resolve(tx, id);

        if (resolved.state !== 'live') {
            return
        }

        const oldParent = resolved.entry.parentId;

        if (oldParent && oldParent !== parentId) {
            this.childrenOf(tx, oldParent).delete(id)
        }

        tx.live.set(id, {...resolved.entry, parentId});
        this.linkChild(tx, parentId, id)
    },

    /**
     * Resolves an id's state through the transaction view: this batch's transitions shadow the
     * committed maps.
     * @param {Object} tx
     * @param {String} id
     * @returns {Object} `{state: 'live'|'retired'|'unknown', entry}`
     * @protected
     */
    resolve(tx, id) {
        if (tx.retired.has(id)) {
            return {state: 'retired', entry: tx.retired.get(id)}
        }

        if (tx.live.has(id)) {
            return {state: 'live', entry: tx.live.get(id)}
        }

        if (tx.freed.has(id)) {
            return {state: 'unknown', entry: null}
        }

        if (this.retired.has(id)) {
            return {state: 'retired', entry: this.retired.get(id)}
        }

        if (this.live.has(id)) {
            return {state: 'live', entry: this.live.get(id)}
        }

        return {state: 'unknown', entry: null}
    },

    /**
     * Retires an id as physically removed, cascading transitively over witnessed child edges:
     * the subtree left the DOM with its root. Cascading through `unaddressable`-retired
     * intermediates upgrades them to `removed` (their physical nodes are gone now too).
     * @param {Object} tx
     * @param {String} id
     * @protected
     */
    retire(tx, id) {
        if (typeof id !== 'string' || id === '') {
            return
        }

        const
            me    = this,
            queue = [id];

        while (queue.length > 0) {
            const current  = queue.shift(),
                  resolved = me.resolve(tx, current);

            // Enqueue witnessed children before retiring the parent edge view.
            me.childrenOf(tx, current).forEach(childId => queue.push(childId));
            tx.children.set(current, new Set());

            if (resolved.state === 'live') {
                me.retireSingle(tx, current, RETIREMENT_KINDS.removed)
            } else if (resolved.state === 'retired' && resolved.entry?.kind === RETIREMENT_KINDS.unaddressable) {
                tx.retired.set(current, {...resolved.entry, kind: RETIREMENT_KINDS.removed})
            }
        }
    },

    /**
     * Retires every witnessed child of a parent (the `removeAll` children wipe), cascading per
     * child; the parent itself stays live.
     * @param {Object} tx
     * @param {String} parentId
     * @protected
     */
    retireChildren(tx, parentId) {
        if (typeof parentId !== 'string' || parentId === '') {
            return
        }

        [...this.childrenOf(tx, parentId)].forEach(childId => this.retire(tx, childId))
    },

    /**
     * Retires exactly one id (no cascade) with the given kind. `removed` dissolves the id's
     * membership in its parent's child set; `unaddressable` keeps all edges (the physical node
     * remains in the tree, so a later ancestor removal must still cascade through it).
     * @param {Object} tx
     * @param {String} id
     * @param {String} kind One of `RETIREMENT_KINDS`
     * @protected
     */
    retireSingle(tx, id, kind) {
        const resolved = this.resolve(tx, id);

        if (resolved.state !== 'live') {
            return
        }

        const entry = resolved.entry;

        tx.live.delete(id);
        tx.retired.set(id, {idSort: entry.idSort, retiredAt: this.batchSeq, kind});

        if (kind === RETIREMENT_KINDS.removed && entry.parentId) {
            this.childrenOf(tx, entry.parentId).delete(id)
        }
    },

    /**
     * Reference semantics for ids a delta positions against (`parentId` fields): unknown ids
     * first-touch into the live set (witnessing them as elements — parents are element-resolved
     * by the consumer), retired ids are a `C-target` finding (positioning against a known-dead
     * parent), live ids pass.
     * @param {Object} tx
     * @param {String|undefined} parentId
     * @param {Number} deltaIndex
     * @param {String} action
     * @protected
     */
    touchParent(tx, parentId, deltaIndex, action) {
        if (typeof parentId !== 'string' || parentId === '' || RESERVED_TARGET_IDS.has(parentId)) {
            return
        }

        const resolved = this.resolve(tx, parentId);

        if (resolved.state === 'retired') {
            tx.findings.push({
                rule      : COHERENCE_RULES.target,
                deltaIndex,
                detail    : `${action} positions against retired parent id "${parentId}" (${resolved.entry.kind}, batch ${resolved.entry.retiredAt})`
            })
        } else if (resolved.state === 'unknown') {
            tx.live.set(parentId, {idSort: ID_SORTS.element, parentId: null, bornAt: this.batchSeq, witnessed: 'first-touch'})
        }
    },

    /**
     * Target semantics for ids a delta acts upon: unknown ids first-touch into the live set
     * (sort as witnessed by the action — `updateVtext` proves vtext, everything else defaults
     * to element until better evidence), retired ids are a `C-target` finding, live ids pass.
     * Fragment and vtext ids legitimately fail DOM element lookups but ARE ledger-resolved —
     * the required sort-awareness falls out of never probing the DOM at all.
     * @param {Object} tx
     * @param {String|undefined} id
     * @param {Number} deltaIndex
     * @param {String} action
     * @param {String} [witnessSort=ID_SORTS.element] Sort to witness on first touch
     * @returns {Boolean} false when the reference is a finding or untrackable
     * @protected
     */
    touchTarget(tx, id, deltaIndex, action, witnessSort = ID_SORTS.element) {
        if (typeof id !== 'string' || id === '' || RESERVED_TARGET_IDS.has(id)) {
            return false
        }

        const resolved = this.resolve(tx, id);

        if (resolved.state === 'retired') {
            tx.findings.push({
                rule      : COHERENCE_RULES.target,
                deltaIndex,
                detail    : `${action} targets retired id "${id}" (${resolved.entry.kind}, batch ${resolved.entry.retiredAt})`
            });
            return false
        }

        if (resolved.state === 'unknown') {
            tx.live.set(id, {idSort: witnessSort, parentId: null, bornAt: this.batchSeq, witnessed: 'first-touch'})
        } else if (resolved.entry.idSort !== witnessSort && witnessSort === ID_SORTS.vtext) {
            // Better evidence refines a first-touch sort guess; sort is diagnostic metadata,
            // never a liveness gate, so refinement is silent.
            tx.live.set(id, {...resolved.entry, idSort: ID_SORTS.vtext})
        }

        return true
    }
};

export default DeltaCoherenceRegistry;

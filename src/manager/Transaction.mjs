import Manager       from './Base.mjs';
import StateProvider from '../state/Provider.mjs';

/**
 * @summary The worker-side authority for logical topology Groups, their window bindings and their history.
 * @description A Group is the persistent identity of one multi-window topology instance. `appName` is
 * routing metadata and never identifies a Group: two independent roots of the same app under one
 * SharedWorker are two Groups. A window binds into a Group under a `workspaceKey` — one key per full
 * Workspace slot — and the binding records the replaceable runtime generation, the `windowId`.
 *
 * The rules a binding follows:
 * - A warm reload releases its binding on `disconnect` and rebinds on `connect` with the same lineage
 *   token; only that binding's generation moves, no other slot and no other Group is touched.
 * - A late `disconnect` for a superseded generation finds no binding carrying its `windowId` and does
 *   nothing — it cannot unbind its successor.
 * - An identity presented while its binder is live, or against a released slot with a foreign token,
 *   forks: the newcomer receives a fresh Group and the caller rewrites the boot carrier.
 * - A released or reserved slot is held for its lineage for {@link #reconnectLeaseMs}; afterwards the
 *   lineage is dead — a window presenting it finds no slot in its Group and forks, a revocation naming
 *   it is refused. Only a Group this worker never saw admits a carried identity into an absent slot: a
 *   cold root returning after the worker restarted.
 * - An opener reserves a slot for a window it is about to create; the reservation is the token the
 *   child must present, bounded by the same lease, and the only token that may give the slot back.
 * - A minted or forked identity exists once its window's carrier holds it: admission awaits the main
 *   thread's acknowledgement, and a pending, refused or rejected write binds nothing and publishes
 *   nothing. An identity the carrier already holds — a rebind, a cold root — binds at once.
 * - A Group also holds keyed participants — the owners its slots resolve to, registered by the hosts
 *   that live in it. Membership is separate from binding: a participant lives while its Group does,
 *   whatever its window's generation is doing, and a Group holding participants is never empty.
 * - A Group keeps a bounded, append-only transaction history and one cursor when {@link #historyDepth}
 *   is above zero. {@link #write} admits a transaction through the Group's serialized queue and awaits
 *   the history module once — before any participant mutation — so a Group at depth zero never imports
 *   it; {@link #undo} and {@link #redo} move the cursor and return the row. The Group's
 *   {@link #getProvider provider} publishes `canUndo` / `canRedo` to every window bound into it.
 *
 * The main thread carries the identity across page loads in `sessionStorage` and rewrites it on request;
 * it never decides — it only says whether it could. This manager knows windows, keys, tokens, opaque
 * participants and plain-data rows — no dock, no document, no app class.
 * @class Neo.manager.Transaction
 * @extends Neo.manager.Base
 * @singleton
 */
class Transaction extends Manager {
    static config = {
        /**
         * @member {String} className='Neo.manager.Transaction'
         * @protected
         */
        className: 'Neo.manager.Transaction',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true,
        /**
         * The history depth a Group is born with. Zero — the default — means the Group keeps no history
         * and never loads `transaction/History.mjs`, so a single-window or history-disabled app pays
         * nothing for it. Depth is a Group's choice: a consumer that wants undo for its own Group calls
         * {@link #setHistoryDepth} before that Group's first write, so two independent roots of one app
         * in one worker never take each other's policy through this worker-wide default.
         * @member {Number} historyDepth=0
         */
        historyDepth: 0,
        /**
         * How long a released or reserved binding holds its slot for a token-matched successor before the
         * slot is free. The dock tear-out connect window is the precedent for the bound.
         * @member {Number} reconnectLeaseMs=20000
         */
        reconnectLeaseMs: 20000
    }

    /**
     * Lease timers keyed by binding, so a binding that is superseded, rebound or retired before its
     * lease ends never expires a slot it no longer describes.
     * @member {Map} leaseTimers=new Map()
     * @protected
     */
    leaseTimers = new Map()

    /**
     * Admissions whose carrier write is still in flight, keyed by `windowId`. A window that leaves
     * while its write is pending is refused when the answer arrives — never bound to a gone window.
     * @member {Map} pendingAdmissions=new Map()
     * @protected
     */
    pendingAdmissions = new Map()

    /**
     * This module loads on demand — the first multi-window participant imports it — so windows whose apps
     * registered before that moment are admitted here, with the identity their config registered with.
     * Every later window is admitted as its app registers (`worker/App#registerApp`).
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        Neo.currentWorker?.on?.({
            disconnect: me.onWindowDisconnect,
            scope     : me
        });

        Object.keys(Neo.apps || {}).forEach(windowId => {
            me.admit({topologyIdentity: Neo.windowConfigs?.[windowId]?.topologyIdentity, windowId})
        })
    }

    /**
     * Admits a window the worker just learned of: binds it under the identity its carrier presented.
     * An identity the carrier already holds — a rebind, a reserved slot, a cold root — binds and is
     * published at once. A minted or forked outcome names an identity the carrier does not hold yet, so
     * the write is awaited and only an accepted write binds and publishes: while it is pending nothing
     * is registered or announced; a refused or rejected write, or a window that left meanwhile, admits
     * nothing and fires `admissionRefused`.
     * @param {Object} data
     * @param {Object} data.topologyIdentity `{}` for a first boot; else `{groupId, workspaceKey, generationToken}`
     * @param {String} data.windowId
     * @returns {Promise<Object>} The binding description, see {@link #bind}, or `{outcome: 'refused',
     *   groupId: null, generationToken: null, generation: 0, windowId, workspaceKey}` when nothing was admitted.
     */
    async admit({topologyIdentity, windowId}) {
        let me       = this,
            identity = topologyIdentity || {},
            plan     = me.plan({...identity, windowId});

        if (
            plan.groupId         === identity.groupId      &&
            plan.workspaceKey    === identity.workspaceKey &&
            plan.generationToken === identity.generationToken
        ) {
            return me.settle(plan)
        }

        const pending = {cancelled: false};

        me.pendingAdmissions.set(windowId, pending);

        const accepted = await me.writeCarrier(windowId, {
            generationToken: plan.generationToken,
            groupId        : plan.groupId,
            workspaceKey   : plan.workspaceKey
        });

        me.pendingAdmissions.get(windowId) === pending && me.pendingAdmissions.delete(windowId);

        if (!accepted || pending.cancelled) {
            const description = {
                generation     : 0,
                generationToken: null,
                groupId        : null,
                outcome        : 'refused',
                windowId,
                workspaceKey   : plan.workspaceKey
            };

            me.fire('admissionRefused', {...description, presented: identity, reason: pending.cancelled ? 'window-gone' : 'carrier-refused'});

            return description
        }

        // Only a minted or forked identity waits, and both name a Group that does not exist yet, so the
        // registry cannot have moved under the plan — except by admitting this same window elsewhere,
        // in which case that binding stands and nothing new is published.
        const settled = me.findByWindow(windowId);

        if (settled) {
            const binding = me.get(settled.groupId).bindings.get(settled.workspaceKey);

            return {
                generation     : binding.generation,
                generationToken: binding.generationToken,
                groupId        : settled.groupId,
                outcome        : 'bound',
                windowId,
                workspaceKey   : settled.workspaceKey
            }
        }

        return me.settle(plan)
    }

    /**
     * Binds a window into a Group under a workspace key, synchronously and published at once — the
     * registry operation {@link #admit} runs after the carrier accepted. Without an identity the window is
     * a new root and receives a freshly minted Group. Every outcome names the identity the caller must
     * carry from now on: after `forked` it differs from the one presented.
     * @param {Object} data
     * @param {String} [data.groupId] The presented Group, absent for a first boot.
     * @param {String} [data.workspaceKey='main'] One key per full Workspace slot.
     * @param {String} [data.generationToken] The lineage token the carrier holds.
     * @param {String} data.windowId The runtime generation binding now.
     * @returns {{outcome: String, groupId: String, workspaceKey: String, generationToken: String, windowId: String, generation: Number}}
     *   `outcome` is one of `minted` (no identity presented), `cold` (a Group this worker never saw),
     *   `bound` (a reserved slot, or this window's own live binding), `rebound` (a released slot, token
     *   matched) or `forked` (a live binder's copy, a stranger's token, or a slot the Group no longer holds).
     */
    bind(data) {
        return this.settle(this.plan(data))
    }

    /**
     * Decides what binding a presented identity gets, without touching the registry. The plan carries
     * everything {@link #settle} needs, so a decision can wait for the carrier and land unchanged.
     * @param {Object} data See {@link #bind}.
     * @returns {{outcome: String, groupId: String, workspaceKey: String, generationToken: String, windowId: String, group: Object|null, binding: Object|null}}
     *   `group` is the existing Group the binding lands in, `null` when {@link #settle} creates it;
     *   `binding` is the existing slot the window takes over, `null` when a new one is added.
     * @protected
     */
    plan({groupId, workspaceKey='main', generationToken, windowId}) {
        let me      = this,
            group   = groupId ? me.get(groupId) : null,
            binding = group?.bindings.get(workspaceKey) ?? null,
            outcome;

        if (!groupId) {
            outcome = 'minted'
        } else if (!group) {
            outcome = 'cold'
        } else if (!binding) {
            // The presented lineage names a slot this Group does not hold: never reserved here, revoked,
            // or its lease ran out. A dead lineage is not a door into a live Group.
            outcome = 'forked'
        } else if (binding.windowId !== null) {
            // A copied identity while the binder lives forks; the binder is never superseded from outside.
            outcome = binding.windowId === windowId ? 'bound' : 'forked'
        } else if (binding.generationToken !== generationToken) {
            outcome = 'forked'
        } else {
            outcome = binding.generation === 0 ? 'bound' : 'rebound'
        }

        const fresh = outcome === 'minted' || outcome === 'forked';

        return {
            binding        : fresh ? null : binding,
            generationToken: fresh || !generationToken ? crypto.randomUUID() : generationToken,
            group          : fresh ? null : group,
            groupId        : fresh ? crypto.randomUUID() : groupId,
            outcome,
            windowId,
            workspaceKey
        }
    }

    /**
     * Lands a {@link #plan}: creates the Group a fresh or cold identity names, takes over or adds the
     * slot, and publishes the binding.
     * @param {Object} plan
     * @returns {Object} The binding description, see {@link #bind}.
     * @protected
     */
    settle(plan) {
        let me                                = this,
            {outcome, windowId, workspaceKey} = plan,
            group                             = plan.group ?? me.createGroup(plan.groupId),
            binding                           = plan.binding;

        if (binding) {
            if (binding.windowId === windowId) {
                return me.describe(group, binding, outcome)
            }

            me.clearLease(binding);
            binding.windowId = windowId;
            binding.generation++
        } else {
            binding = {
                generation     : 1,
                generationToken: plan.generationToken,
                windowId,
                workspaceKey
            };

            group.bindings.set(workspaceKey, binding)
        }

        return me.describe(group, binding, outcome)
    }

    /**
     * Ends a lease timer for a binding, if one is running.
     * @param {Object} binding
     * @protected
     */
    clearLease(binding) {
        let me      = this,
            timerId = me.leaseTimers.get(binding);

        if (timerId !== undefined) {
            clearTimeout(timerId);
            me.leaseTimers.delete(binding)
        }
    }

    /**
     * Registers a new Group. The id is minted here unless a carrier presents one this worker never saw.
     * The history bound is read now: a Group born at depth zero stays without history.
     * @param {String} [groupId]
     * @returns {Object} The Group record: `{id, bindings, createdAt, participants, historyDepth, history,
     *   historyReady, provider, queue}`
     * @protected
     */
    createGroup(groupId=crypto.randomUUID()) {
        const group = {
            bindings    : new Map(),
            createdAt   : Date.now(),
            history     : null,
            historyDepth: this.historyDepth,
            historyReady: null,
            id          : groupId,
            participants: new Map(),
            provider    : null,
            queue       : Promise.resolve()
        };

        this.register(group);

        return group
    }

    /**
     * @param {Object} group
     * @param {Object} binding
     * @param {String} outcome
     * @returns {Object}
     * @protected
     */
    describe(group, binding, outcome) {
        const result = {
            generation     : binding.generation,
            generationToken: binding.generationToken,
            groupId        : group.id,
            outcome,
            windowId       : binding.windowId,
            workspaceKey   : binding.workspaceKey
        };

        // The emitter annotates the object it is handed; callers get the plain description.
        this.fire('bind', {...result});

        return result
    }

    /**
     * Finds the Group and binding a live window belongs to.
     * @param {String} windowId
     * @returns {{groupId: String, workspaceKey: String, generation: Number}|null}
     */
    findByWindow(windowId) {
        for (const group of this.items) {
            for (const binding of group.bindings.values()) {
                if (binding.windowId === windowId) {
                    return {generation: binding.generation, groupId: group.id, workspaceKey: binding.workspaceKey}
                }
            }
        }

        return null
    }

    /**
     * @param {String} groupId
     * @param {String} workspaceKey
     * @returns {{windowId: String|null, generation: Number, workspaceKey: String}|null} A copy of the binding
     *   without its token; `windowId` is `null` while the slot is released or reserved.
     */
    getBinding(groupId, workspaceKey) {
        const binding = this.get(groupId)?.bindings.get(workspaceKey);

        return binding ? {generation: binding.generation, windowId: binding.windowId, workspaceKey} : null
    }

    /**
     * The participant a Group resolves one key to, or `null`.
     * @param {String} groupId
     * @param {String} workspaceKey
     * @returns {Object|null}
     */
    getParticipant(groupId, workspaceKey) {
        return this.get(groupId)?.participants.get(workspaceKey) ?? null
    }

    /**
     * The keys a Group holds participants under, in registration order.
     * @param {String} groupId
     * @returns {String[]}
     */
    participantKeys(groupId) {
        return [...(this.get(groupId)?.participants.keys() ?? [])]
    }

    /**
     * Runs one task on a Group's queue: tasks run in call order, one at a time, and a task that rejects
     * releases the queue for the next. The task's own promise is returned, so the caller sees its result
     * or its error. A task must not write to its own Group — that write would wait for the task holding
     * the queue.
     * @param {Object} group
     * @param {Function} task
     * @returns {Promise}
     * @protected
     */
    enqueue(group, task) {
        const run  = () => task(),
              turn = group.queue.then(run, run);

        group.queue = turn.then(() => {}, () => {});

        return turn
    }

    /**
     * The Group's `state.Provider`, created on first request: one instance per Group whatever window asks,
     * publishing `canUndo`, `canRedo`, `historyCursor`, `historyDepth` and `historyLength` — `false` and
     * empty until the first admitted transaction. A host binds its own provider to it as the explicit
     * parent, so a control reads the same answer from the opener and from a popped-out window.
     * @param {String} groupId
     * @returns {Neo.state.Provider|null} `null` for an unknown Group
     */
    getProvider(groupId) {
        const group = this.get(groupId);

        if (!group) return null;

        return group.provider ??= Neo.create(StateProvider, {data: this.historyState(group)})
    }

    /**
     * The provider-shaped view of a Group's history.
     * @param {Object} group
     * @returns {{canRedo: Boolean, canUndo: Boolean, historyCursor: Number, historyDepth: Number, historyLength: Number}}
     * @protected
     */
    historyState({history, historyDepth}) {
        return {
            canRedo      : history?.canRedo ?? false,
            canUndo      : history?.canUndo ?? false,
            historyCursor: history?.cursor  ?? -1,
            historyDepth,
            historyLength: history?.count   ?? 0
        }
    }

    /**
     * The one dynamic import of the history module, kept as a method so a harness can observe or replace
     * the load. The manager's static closure never contains the module.
     * @returns {Promise<Object>} The module namespace
     * @protected
     */
    importHistory() {
        return import('./transaction/History.mjs')
    }

    /**
     * The admission barrier: for a Group that keeps history, loads the module once and creates the Group's
     * History; every write awaits this before touching a participant. A Group at depth zero resolves to
     * `null` without importing anything.
     * @param {Object} group
     * @returns {Promise<Neo.manager.transaction.History|null>}
     * @protected
     */
    loadHistory(group) {
        if (group.historyDepth < 1) {
            return Promise.resolve(null)
        }

        return group.historyReady ??= this.importHistory().then(({default: History}) => {
            group.history = Neo.create(History, {depth: group.historyDepth});

            return group.history
        })
    }

    /**
     * Moves a Group's cursor on its queue — after the row was applied. The row a move would return is
     * read first, `apply` runs with it inside the queued step, and only when it resolved does the cursor
     * move and the provider publish; a rejected application leaves cursor and provider where they were,
     * so nothing ever reads a moved cursor as a completed undo before the application held.
     * @param {String} groupId
     * @param {String} direction `undo` or `redo`
     * @param {Function} apply Receives the row; may be async
     * @returns {Promise<Object|null>}
     * @protected
     */
    moveCursor(groupId, direction, apply) {
        let me    = this,
            group = me.get(groupId);

        if (!group) {
            return Promise.reject(new Error(`${me.className}#${direction}: unknown Group ${groupId}`))
        }

        if (typeof apply !== 'function') {
            return Promise.reject(new Error(`${me.className}#${direction}: apply(row) is required — the cursor moves only after the row was applied`))
        }

        return me.enqueue(group, async () => {
            me.assertLive(group, direction);

            const row = group.history?.peek(direction) ?? null;

            if (!row) {
                return null
            }

            await apply(row);

            me.assertLive(group, direction);
            group.history[direction]();
            me.publishHistory(group);

            return row
        })
    }

    /**
     * A task reaching the head of a Group's queue after the Group was retired must not touch what the
     * retirement released.
     * @param {Object} group
     * @param {String} method The caller, for the message
     * @protected
     */
    assertLive(group, method) {
        if (this.get(group.id) !== group) {
            throw new Error(`${this.className}#${method}: Group ${group.id} was retired while queued`)
        }
    }

    /**
     * Publishes the Group's history state to its provider, if one was ever requested.
     * @param {Object} group
     * @protected
     */
    publishHistory(group) {
        group.provider?.setData(this.historyState(group))
    }

    /**
     * Re-applies the row after a Group's cursor and, once `apply` resolved, moves the cursor onto it.
     * Resolves to that row, or `null` when there is nothing to redo or the Group keeps no history.
     * @param {Object} data
     * @param {String} data.groupId
     * @param {Function} data.apply Receives the row to re-apply; may be async — a rejection leaves the cursor
     * @returns {Promise<Object|null>}
     */
    redo({groupId, apply}) {
        return this.moveCursor(groupId, 'redo', apply)
    }

    /**
     * Sets the history depth of one Group — the Group's own policy, independent of this worker-wide
     * default and of any other Group. Refused for an unknown Group, a depth that is not a non-negative
     * integer, or a Group whose history already loaded: the bound is fixed at that first write.
     * @param {Object} data
     * @param {String} data.groupId
     * @param {Number} data.depth `0` keeps no history and loads nothing
     * @returns {Boolean}
     */
    setHistoryDepth({groupId, depth}) {
        const group = this.get(groupId);

        if (!group || group.historyReady || !Number.isInteger(depth) || depth < 0) {
            return false
        }

        group.historyDepth = depth;
        this.publishHistory(group);

        return true
    }

    /**
     * Applies the reverse of the row at a Group's cursor and, once `apply` resolved, moves the cursor
     * back. Resolves to that row, or `null` when there is nothing to undo or the Group keeps no history.
     * @param {Object} data
     * @param {String} data.groupId
     * @param {Function} data.apply Receives the row to reverse; may be async — a rejection leaves the cursor
     * @returns {Promise<Object|null>}
     */
    undo({groupId, apply}) {
        return this.moveCursor(groupId, 'undo', apply)
    }

    /**
     * Admits one transaction to a Group. The call joins the Group's queue; at its head the history module
     * is awaited if the Group keeps history — before any participant mutation — the descriptor is checked
     * against what the history admits, `adopt` runs with it, the frozen row is appended after the cursor
     * and the provider is published. The descriptor is enqueued exactly once. An `adopt` that throws
     * appends nothing and leaves the cursor where it was; the queue moves on to the next write.
     *
     * The body of this step is provisional and owned by the atomic-commit leaf: the participant protocol
     * (prepare every participant → adopt all with compensation → append the row → move the cursor →
     * publish one snapshot → release the queue) lands here as ONE step under ONE owner, compensation
     * across a failed append included. Nothing outside this method may depend on its parts being
     * separate steps; the queue, the barrier and the History are the primitives it composes.
     * @param {Object} data
     * @param {String} data.groupId
     * @param {Object} data.descriptor Plain data describing the transaction — it becomes the history row
     * @param {Function} [data.adopt] The participant-mutation slot; receives the descriptor, may be async
     * @returns {Promise<{result: *, row: Object|null}>} `result` is what `adopt` returned; `row` the frozen
     *   retained row, or `null` for a Group that keeps no history
     */
    write({groupId, descriptor, adopt}) {
        let me    = this,
            group = me.get(groupId);

        if (!group) {
            return Promise.reject(new Error(`${me.className}#write: unknown Group ${groupId}`))
        }

        return me.enqueue(group, async () => {
            me.assertLive(group, 'write');

            const history = await me.loadHistory(group);

            me.assertLive(group, 'write');
            history?.assertRow(descriptor);

            const result = await adopt?.(descriptor),
                  row    = history ? history.append(descriptor) : null;

            row && me.publishHistory(group);

            return {result, row}
        })
    }

    /**
     * Registers — or replaces — the participant a Group resolves one key to. What a participant IS is the
     * host's business: this manager holds it opaque, so a dock host registers document accessors and
     * another domain registers whatever its slots resolve to. An unknown Group refuses.
     * @param {Object} data
     * @param {String} data.groupId
     * @param {String} data.workspaceKey
     * @param {Object} data.participant
     * @returns {Boolean}
     */
    registerParticipant({groupId, workspaceKey, participant}) {
        const group = this.get(groupId);

        if (!group || typeof workspaceKey !== 'string' || !workspaceKey || !participant || typeof participant !== 'object') {
            return false
        }

        group.participants.set(workspaceKey, participant);

        return true
    }

    /**
     * Retires one participant of a Group — an explicit owner decision, never a side effect of a window's
     * binding leaving: closing a vessel unbinds a render target, it does not delete worker documents.
     * @param {Object} data
     * @param {String} data.groupId
     * @param {String} data.workspaceKey
     * @returns {Boolean}
     */
    unregisterParticipant({groupId, workspaceKey}) {
        return this.get(groupId)?.participants.delete(workspaceKey) ?? false
    }

    /**
     * Worker `disconnect`: the binding carrying this `windowId` is released and its slot held for the
     * lease. A `windowId` no binding carries — a superseded generation reporting late — changes nothing.
     * @param {Object} data
     * @param {String} data.windowId
     * @protected
     */
    onWindowDisconnect({windowId}) {
        this.release(windowId)
    }

    /**
     * Releases the binding a window holds and starts its lease. A window still waiting for its carrier's
     * answer holds no binding yet; its admission is cancelled instead, so the answer binds nothing.
     * @param {String} windowId
     * @returns {Boolean} Whether a binding was released.
     */
    release(windowId) {
        let me      = this,
            pending = me.pendingAdmissions.get(windowId);

        pending && (pending.cancelled = true);

        for (const group of me.items) {
            for (const binding of group.bindings.values()) {
                if (binding.windowId === windowId) {
                    binding.windowId = null;
                    me.startLease(group, binding);
                    me.fire('release', {generation: binding.generation, groupId: group.id, windowId, workspaceKey: binding.workspaceKey});
                    return true
                }
            }
        }

        return false
    }

    /**
     * Reserves a slot for a window the caller is about to open. The returned identity is what the opener
     * writes into the child's carrier; the child's `connect` then binds with the reserved token. A slot
     * with a live binder cannot be reserved.
     * @param {Object} data
     * @param {String} data.groupId
     * @param {String} data.workspaceKey
     * @returns {{groupId: String, workspaceKey: String, generationToken: String}|null}
     */
    reserve({groupId, workspaceKey}) {
        let me    = this,
            group = me.get(groupId),
            binding;

        if (!group || !workspaceKey) return null;

        binding = group.bindings.get(workspaceKey);

        if (binding?.windowId) return null;

        binding && me.clearLease(binding);

        binding = {
            generation     : binding ? binding.generation : 0,
            generationToken: crypto.randomUUID(),
            windowId       : null,
            workspaceKey
        };

        group.bindings.set(workspaceKey, binding);
        me.startLease(group, binding);

        return {generationToken: binding.generationToken, groupId, workspaceKey}
    }

    /**
     * Gives a reserved or released slot back before its lease ends — the opener's vessel never came,
     * or the host retired it. Only the lineage holding the slot may give it back: an older reservation's
     * failure or cleanup, arriving after the slot was reserved again, names a token the slot no longer
     * carries and is refused. A slot with a live binder is not the caller's to revoke.
     * @param {Object} data
     * @param {String} data.groupId
     * @param {String} data.workspaceKey
     * @param {String} data.generationToken The reservation's own token.
     * @returns {Boolean}
     */
    revoke({groupId, workspaceKey, generationToken}) {
        let me      = this,
            group   = me.get(groupId),
            binding = group?.bindings.get(workspaceKey);

        if (!binding || binding.windowId !== null || !generationToken || binding.generationToken !== generationToken) return false;

        me.clearLease(binding);
        group.bindings.delete(workspaceKey);

        return true
    }

    /**
     * Retires a Group with every lease, participant, history row and provider it holds. Whether a Group
     * MAY retire — durably persisted, no retained reference — is the caller's contract; this manager only
     * forgets what it is told to.
     * @param {String} groupId
     * @returns {Boolean}
     */
    retireGroup(groupId) {
        let me    = this,
            group = me.get(groupId);

        if (!group) return false;

        group.bindings.forEach(binding => me.clearLease(binding));
        group.participants.clear();
        group.provider?.destroy();
        group.history?.destroy();
        group.provider = group.history = null;
        me.unregister(group);

        return true
    }

    /**
     * Tells a window's carrier what to hold from now on and reports whether it took. A window is admitted
     * once its app registered, which is after the main realm registered its remote surface; a realm
     * without the setter — a unit harness that mocks no `Neo.Main` — has no carrier to disagree, so its
     * absence accepts. A present setter must answer exactly `true`: a pending answer is awaited, and
     * `false`, a rejection or anything else refuses.
     * @param {String} windowId
     * @param {{groupId: String, workspaceKey: String, generationToken: String}} identity
     * @returns {Promise<Boolean>}
     * @protected
     */
    async writeCarrier(windowId, identity) {
        if (typeof Neo.Main?.setTopologyIdentity !== 'function') return true;

        try {
            return await Neo.Main.setTopologyIdentity({...identity, windowId}) === true
        } catch (error) {
            return false
        }
    }

    /**
     * Holds a released or reserved slot for its lineage; on expiry the slot is free.
     * @param {Object} group
     * @param {Object} binding
     * @protected
     */
    startLease(group, binding) {
        let me = this;

        me.clearLease(binding);

        me.leaseTimers.set(binding, setTimeout(() => {
            me.leaseTimers.delete(binding);

            // Only the binding this lease was started for; a rebind replaced it with a live one.
            if (group.bindings.get(binding.workspaceKey) === binding && binding.windowId === null) {
                group.bindings.delete(binding.workspaceKey);
                me.fire('leaseExpired', {groupId: group.id, workspaceKey: binding.workspaceKey});

                // A Group with no binding, no participant and no retained history row holds nothing this
                // manager keeps for it, so letting it go loses nothing. A Group whose participants or rows
                // outlive its last window is not empty: its documents are still owned, its history is
                // still the truth of what they did. Conditional, lossless retirement of a Group that DOES
                // hold state is a later contract; this only stops closed windows from leaving empty Groups
                // behind in a long-lived worker.
                if (group.bindings.size === 0 && group.participants.size === 0 && !group.history?.count && me.get(group.id) === group) {
                    me.retireGroup(group.id);
                    me.fire('groupRetired', {groupId: group.id})
                }
            }
        }, me.reconnectLeaseMs))
    }
}

export default Neo.setupClass(Transaction);

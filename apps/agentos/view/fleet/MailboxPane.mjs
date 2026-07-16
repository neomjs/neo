import AgentMailboxStore                              from '../../store/AgentMailbox.mjs';
import Container                                      from '../../../../src/container/Base.mjs';
import {classifyPaneFreshness, describePaneFreshness} from './agentFreshness.mjs';

/**
 * @summary Is this payload the mirror adapter's own envelope?
 *
 * The producer emits `{capability, admission, rows, page}` — always all four, on EVERY state
 * including its degrades, because the not-wired snapshot is built by the same pure half as a live
 * one. So a payload missing any of them did not come from that producer, and reading a mail claim
 * out of it is fabrication: `{rows: []}` would render "No active messages for @x" and
 * `{rows: [message]}` would render a stranger's message list, both from a shape the pane never
 * recognized. Structural recognition only — the STATES inside it are the producer's to declare.
 * @param {Object} snapshot Candidate payload.
 * @returns {Boolean}
 * @private
 */
function isRecognizedMirrorEnvelope(snapshot) {
    return Boolean(snapshot)
        && typeof snapshot.capability === 'object' && snapshot.capability !== null
        && typeof snapshot.admission  === 'object' && snapshot.admission  !== null
        && typeof snapshot.page       === 'object' && snapshot.page       !== null
        && Array.isArray(snapshot.rows)
}

/**
 * The AgentDetail **Mailbox tab** — the S1 view half: a read-only, viewer-admitted mirror of the
 * drilled-in resident's ACTIVE A2A inbox, rendered from one Fleet mailbox-mirror adapter snapshot.
 *
 * **Read-only is structural.** The pane renders zero mutation affordances — no mark-read, no
 * archive, no reply (the graduated record's MUST-NOT: operator-side mark-read would mutate the
 * agent's own turn-start signal and swallow peer handoffs). The single interaction is
 * thread-collapse toggling — pure display-state navigation on the view-owned `threadCollapsed`
 * record field, never a data write. The Mailbox tab title stays COUNTLESS by design: an
 * unread-count badge would imply operator-side read tracking that deliberately does not exist
 * (the no-markRead MUST-NOT's quiet sibling); per-row `status` is the honest fact instead.
 *
 * **Four mutually exclusive honest states** (never a fake success):
 *  - `unobserved` — no snapshot injected yet: the feed is not wired; says so.
 *  - `denied` — the adapter's admission block reports the viewer holds no `CAN_READ_INBOX_OF`
 *    grant for the subject: a NAMED denial (viewer + subject), never an empty-success.
 *  - `degraded` — the source failed for a non-admission reason: the honest reason line.
 *  - `empty` — wired, admitted, zero active rows: an explicit empty state.
 *
 * **Rows** render flat-chronological newest-first (the store's binding sort) with thread-collapse
 * where `partOfThread` exists: the NEWEST message of a thread heads the collapsed row (consistent
 * with the pane's newest-first order) over a `+N earlier` count chip; expanding renders the thread
 * inline, still newest-first. All row content is escaped `text` — record-derived strings never
 * render as markup. Pane-grain freshness reuses the S1 `agentFreshness` closed vocabulary
 * (fresh / stale / lost / `unobserved` as the fail-closed degrade tier) against the snapshot's
 * `capability.capturedAt`, so the cockpit speaks ONE freshness language.
 *
 * The pane owns its {@link AgentOS.store.AgentMailbox} instance (created with the pane, destroyed
 * with it) — `AgentDetail` deliberately has no per-view `state.Provider`, and a leaf list owns a
 * local store. The wiring injects adapter snapshots via the reactive `snapshot_` config; the pane
 * renders, never fetches.
 *
 * @class AgentOS.view.fleet.MailboxPane
 * @extends Neo.container.Base
 */
class MailboxPane extends Container {
    static config = {
        /**
         * @member {String} className='AgentOS.view.fleet.MailboxPane'
         * @protected
         */
        className: 'AgentOS.view.fleet.MailboxPane',
        /**
         * @member {String} ntype='fm-mailbox-pane'
         * @protected
         */
        ntype: 'fm-mailbox-pane',
        /**
         * @member {String[]} baseCls=['fm-mailbox-pane']
         */
        baseCls: ['fm-mailbox-pane'],
        /**
         * The drilled-in resident record (or plain field bag) — only `agentId` is read, to label
         * the denial / empty states with the subject. `null` = no agent drilled in.
         * @member {Object|null} record_=null
         * @reactive
         */
        record_: null,
        /**
         * One Fleet mailbox-mirror adapter snapshot (`readFleetMailboxMirror` output):
         * `{capability, admission, rows, page}`. `null` = the honest `unobserved` state — the
         * pane NEVER fabricates rows while unwired.
         * @member {Object|null} snapshot_=null
         * @reactive
         */
        snapshot_: null,
        /**
         * Injected wall-clock (ms) for freshness classification; `null` → live `Date.now()`.
         * @member {Number|null} now_=null
         * @reactive
         */
        now_: null,
        /**
         * The mailbox mirror's honest live cadence (ms) — the freshness window the snapshot's
         * `capturedAt` is judged against. Tunable, not contractual.
         * @member {Number} freshnessTtl=60000
         */
        freshnessTtl: 60_000,
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         * @reactive
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * The pane head (freshness chip + page bounds) over the state line and the rows body.
         * @member {Object[]} items
         */
        items: [{
            ntype : 'container',
            cls   : ['fm-mailbox-head'],
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'center'},

            items: [{
                ntype    : 'component',
                cls      : ['fm-mailbox-title'],
                flex     : 1,
                text     : 'A2A Mailbox',
                reference: 'mailbox-title'
            }, {
                ntype    : 'component',
                // the page bounds + their transitions. Native buttons: the bounds label alone made
                // row 51 unreachable — a window with no way to move it is a claim about the data,
                // not access to it. The pane REQUESTS a page (it renders, never fetches); the
                // owner re-reads the mirror at the new offset.
                ntype    : 'component',
                cls      : ['fm-mailbox-page'],
                flex     : 'none',
                reference: 'mailbox-page',

                domListeners: [{
                    click   : 'up.onPageClick',
                    delegate: '.fm-mailbox-page-step'
                }]
            }, {
                ntype    : 'component',
                flex     : 'none',
                reference: 'mailbox-freshness'
            }]
        }, {
            // the honest-state line (unobserved / denied / degraded / empty); hidden in rows mode
            ntype    : 'component',
            cls      : ['fm-mailbox-state'],
            reference: 'mailbox-state'
        }, {
            // the rows body — vdom-built from the pane-owned store, delegated single listener for
            // the thread-collapse toggle (display-state navigation, the pane's ONLY interaction)
            ntype    : 'component',
            cls      : ['fm-mailbox-rows'],
            flex     : 1,
            hidden   : true,
            reference: 'mailbox-rows',

            // delegated to the native toggle BUTTON, not the row: a listener on the whole row makes
            // the row an interactive region no keyboard user can reach. The handler still resolves
            // the thread from the row's `data-thread-id` by walking the event path.
            domListeners: [{
                click   : 'up.onThreadHeadClick',
                delegate: '.fm-mail-thread-toggle'
            }]
        }]
    }

    /**
     * The pane-owned row store — created with the pane, destroyed with it (see class summary).
     * @member {AgentOS.store.AgentMailbox|null} store=null
     */
    store = null

    /**
     * @summary Create the pane-owned store, then render the initial (honest) state.
     * @param {...*} args
     */
    onConstructed(...args) {
        super.onConstructed(...args);

        this.store = Neo.create(AgentMailboxStore);
        this.applySnapshot()
    }

    /**
     * @summary Destroy the pane-owned store with the pane.
     * @param {...*} args
     */
    destroy(...args) {
        this.store?.destroy();
        this.store = null;

        super.destroy(...args)
    }

    /**
     * Triggered after the snapshot config changed — a new adapter read replaces the rows wholesale
     * (rows are immutable timestamped facts; the new snapshot IS the new truth).
     * @param {Object|null} value
     * @param {Object|null} oldValue
     * @protected
     */
    afterSetSnapshot(value, oldValue) {
        this.isConstructed && this.applySnapshot()
    }

    /**
     * Triggered after the record config changed — the subject label on the honest states follows
     * the drilled-in resident.
     * @param {Object|null} value
     * @param {Object|null} oldValue
     * @protected
     */
    afterSetRecord(value, oldValue) {
        this.isConstructed && this.applySnapshot()
    }

    /**
     * Triggered after the injected clock changed — freshness is time-relative.
     * @param {Number|null} value
     * @param {Number|null} oldValue
     * @protected
     */
    afterSetNow(value, oldValue) {
        this.isConstructed && this.applySnapshot()
    }

    /**
     * @summary Classify the snapshot into the pane's honest state.
     *
     * The unrecognized-envelope guard fails CLOSED to `unobserved`. A snapshot the pane cannot
     * recognize — `{}`, a torn payload, a future producer shape — has no `rows`, so a bare
     * length check would render "No active messages for @x": a confident, honest-LOOKING empty
     * inbox fabricated out of a payload we never understood. `empty` is a claim about the
     * subject's mail and may only be made when the producer actually said so.
     * @returns {String} 'unobserved' | 'denied' | 'degraded' | 'empty' | 'rows'
     * @protected
     */
    getPaneState() {
        const snapshot = this.snapshot;

        if (!snapshot) return 'unobserved';

        // The producer's envelope is `{capability, admission, rows, page}`. A payload missing ANY of
        // them is not a mailbox — it is something else that happens to have a rows array, and
        // reading rows/empty/page out of it fabricates a claim about this agent's mail from a
        // shape we never understood. Checked BEFORE denied/degraded so a torn payload cannot
        // borrow their authority either.
        if (!isRecognizedMirrorEnvelope(snapshot)) return 'unobserved';

        const named = typeof snapshot.admission.subjectAgentId === 'string'
            && snapshot.admission.subjectAgentId.trim().length > 0;

        // A snapshot that NAMES a subject must name THIS one. Anything else is about someone else,
        // and no state inside it may borrow this resident's pane to say it.
        if (named && !this.isSnapshotForThisSubject()) return 'unobserved';

        // A denial names the subject in its own sentence ("X holds no grant for Y's inbox"), so an
        // unattributed denial cannot be rendered — it would put a name in that sentence that the
        // producer never admitted.
        if (snapshot.admission.state === 'denied') return named ? 'denied' : 'unobserved';

        // A degrade claims nothing about anyone's MAIL — it reports on the READ. The adapter's own
        // refusals (unbound identity, viewer mismatch, inadmissible subject) legitimately resolve NO
        // subject, so gating them on one would swallow the honest reason and leave the operator with
        // a silent pane. This is the one state that may speak without an admitted subject.
        if (snapshot.capability.state === 'degraded') return 'degraded';

        // `rows` and `empty` are claims about THIS resident's mail. Both require a verified subject:
        // an unattributed row list is a stranger's inbox, and an unattributed zero is "no mail for
        // someone" rendered as "no mail for HIM".
        if (!named)                     return 'unobserved';
        if (snapshot.rows.length === 0) return 'empty';

        return 'rows'
    }

    /**
     * @summary Does the snapshot's admitted subject match the resident this pane is showing?
     *
     * The possession guard clears the snapshot on re-seat and the read is generation-latched, but
     * both protect the SEQUENCE. Neither reads the envelope: a `granted` snapshot for Vega assigned
     * onto Ada's pane renders Vega's mail under Ada's name with every guard satisfied, because the
     * record was already correct when it landed. The envelope has to be asked who it is about.
     *
     * The comparison is against `githubUsername` — the resident's mailbox identity authority — never
     * `agentId`, which is the Fleet registry key (`vega` vs the subject `@neo-opus-vega`) and for
     * custom / multi-instance residents need not correspond at all. Canonicalization is a single
     * `@` prefix, matching the graph's node-id form the adapter already returns.
     *
     * Fails CLOSED on every unknown: no record, no identity authority, or no admitted subject means
     * the pane cannot prove the mail is this resident's — and unprovable ownership renders nothing.
     * @returns {Boolean}
     * @protected
     */
    isSnapshotForThisSubject() {
        const
            username = this.record?.githubUsername,
            subject  = this.snapshot?.admission?.subjectAgentId;

        if (typeof username !== 'string' || !username.trim()) return false;
        if (typeof subject  !== 'string' || !subject.trim())  return false;

        const canonical = username.trim().startsWith('@') ? username.trim() : `@${username.trim()}`;

        return subject.trim() === canonical
    }

    /**
     * @summary Render the snapshot honestly: the freshness chip, the page bounds, and either the
     * named state line or the rows body — never both, never a fabricated success.
     * @protected
     */
    applySnapshot() {
        let me           = this,
            snapshot     = me.snapshot,
            state        = me.getPaneState(),
            rows         = state === 'rows',
            stateCmp     = me.getReference('mailbox-state'),
            rowsCmp      = me.getReference('mailbox-rows'),
            pageCmp      = me.getReference('mailbox-page'),
            now          = me.now ?? Date.now(),
            ledger       = snapshot ? {freshnessTtl: me.freshnessTtl, observedAt: snapshot.capability?.capturedAt} : null,
            {cls, label} = describePaneFreshness(classifyPaneFreshness(ledger, now));

        me.getReference('mailbox-freshness').set({cls, text: label});

        // page bounds are shown only when rows show — a denial/degrade never fakes a window
        const page = snapshot?.page;

        pageCmp.hidden  = !rows || !page;
        pageCmp.vdom.cn = rows && page ? me.buildPageVdom(page) : [];
        pageCmp.update();

        stateCmp.set({
            cls   : ['fm-mailbox-state', `is-${state}`],
            hidden: rows,
            text  : rows ? '' : me.getStateText(state)
        });

        rowsCmp.hidden = !rows;

        me.store.applySnapshotRows(rows ? snapshot.rows : []);
        rows && me.renderRows()
    }

    /**
     * @summary The honest-state line, named per state — the denial carries viewer + subject (an
     * auditable sentence, never a bare "no messages"), the degrade carries the adapter's reason.
     *
     * The degrade line deliberately does NOT name a cause. `capability.state: 'degraded'` covers
     * both a genuine source outage AND the adapter's own fail-closed refusals (an unbound request
     * identity, an asserted viewer that does not match the binding, an inadmissible namespace
     * subject) — all of which arrive as `admission.state: 'unavailable'`. Saying "source degraded"
     * would blame Memory Core for a refusal the adapter made, so the line states only what this
     * view actually knows — no rows, and the reason verbatim from the owner.
     * @param {String} state From {@link #getPaneState} (never 'rows' here).
     * @returns {String}
     * @protected
     */
    getStateText(state) {
        const
            snapshot = this.snapshot,
            subject  = snapshot?.admission?.subjectAgentId || this.record?.agentId || 'this agent';

        switch (state) {
            case 'denied':
                return `Access denied: ${snapshot.admission.viewerIdentity || 'the viewer'} holds no read grant for ${subject}'s inbox`;
            case 'degraded':
                return `Mailbox unavailable: ${snapshot.capability?.reason || 'source unavailable'}`;
            case 'empty':
                return `No active messages for ${subject}`;
            default:
                return 'Mailbox feed not wired'
        }
    }

    /**
     * @summary Build the rows body vdom from the pane-owned store: flat-chrono newest-first with
     * thread-collapse. Store order is the binding order; threads group in first-encounter order,
     * so the NEWEST message of a thread heads its collapsed row. All content renders as `text`.
     * @protected
     */
    renderRows() {
        let me      = this,
            rowsCmp = me.getReference('mailbox-rows'),
            groups  = new Map(),
            cn      = [];

        me.store.items.forEach(record => {
            const threadId = record.partOfThread;

            if (!threadId) {
                cn.push(me.createRowVdom(record));
                return
            }

            if (!groups.has(threadId)) {
                // first encounter = the newest message of the thread → the thread head
                const group = {head: record, rest: []};
                groups.set(threadId, group);
                cn.push(group)
            } else {
                groups.get(threadId).rest.push(record)
            }
        });

        rowsCmp.vdom.cn = cn.map(entry => {
            if (!entry.head) {
                return entry
            }

            const {head, rest} = entry;

            if (rest.length === 0) {
                return me.createRowVdom(head)
            }

            if (head.threadCollapsed) {
                return me.createRowVdom(head, {
                    collapsed  : true,
                    threadCount: rest.length,
                    threadId   : head.partOfThread
                })
            }

            return {
                cls: ['fm-mail-thread'],
                cn : [
                    me.createRowVdom(head, {expanded: true, threadId: head.partOfThread}),
                    ...rest.map(record => me.createRowVdom(record, {inThread: true}))
                ]
            }
        });

        rowsCmp.update()
    }

    /**
     * @summary One row's vdom — escaped `text` leaves only, no interpreted markup anywhere. The
     * thread head is the single interactive surface (the collapse toggle); everything else is
     * inert fact rendering.
     * @param {Object} record One {@link AgentOS.model.MailboxMessage} record.
     * @param {Object} [options={}]
     * @param {Boolean} [options.collapsed] Render as a collapsed thread head with a count chip.
     * @param {Boolean} [options.expanded] Render as an expanded thread head.
     * @param {Boolean} [options.inThread] Render as an indented thread member.
     * @param {Number}  [options.threadCount] Collapsed-away count for the chip.
     * @param {String}  [options.threadId] Thread id stamped on toggleable heads.
     * @returns {Object}
     * @protected
     */
    createRowVdom(record, {collapsed = false, expanded = false, inThread = false, threadCount = 0, threadId = null} = {}) {
        const
            isHead = collapsed || expanded,
            meta   = [record.from, record.priority, record.status, record.taskState, record.sentAt]
                .filter(Boolean)
                .join(' · ');

        return {
            cls: [
                'fm-mail-row',
                record.status === 'unread' ? 'is-unread' : '',
                isHead ? 'fm-mail-thread-head' : '',
                inThread ? 'is-in-thread' : ''
            ].filter(Boolean),
            data: threadId ? {threadId} : null,
            cn  : [{
                cls: ['fm-mail-row-main'],
                cn : [
                    {tag: 'span', cls: ['fm-mail-subject'], text: record.subject || '(no subject)'},
                    // The toggle is a NATIVE button, not a clickable div: it is the pane's only
                    // affordance, and a div owns no Enter/Space and no tab stop, so thread collapse
                    // was mouse-only. Same discipline as the card drill's native-button target —
                    // an interactive region that is not a control is not operable. `aria-expanded`
                    // names the state it toggles; the row keeps `fm-mail-thread-head` for styling.
                    ...(collapsed ? [{
                        tag            : 'button',
                        type           : 'button',
                        cls            : ['fm-mail-thread-count', 'fm-mail-thread-toggle'],
                        text           : `+${threadCount} earlier`,
                        'aria-expanded': 'false',
                        'aria-label'   : `Expand thread — ${threadCount} earlier messages`
                    }] : []),
                    ...(expanded ? [{
                        tag            : 'button',
                        type           : 'button',
                        cls            : ['fm-mail-thread-count', 'fm-mail-thread-toggle'],
                        text           : 'collapse thread',
                        'aria-expanded': 'true',
                        'aria-label'   : 'Collapse thread'
                    }] : [])
                ]
            }, {
                cls : ['fm-mail-row-meta'],
                text: meta
            }]
        }
    }

    /**
     * @summary Build the page-bounds strip: the window label between its two transitions.
     *
     * Both steps are native buttons — the bounds label on its own told the operator a window
     * exists without giving them any way to move it, which is a claim about the data rather than
     * access to it. A step is DISABLED, never hidden, when it would leave the range: a control that
     * vanishes teaches the operator the surface is inconsistent, while a disabled one says "this
     * edge is the end". `prev` is bounded at 0; `next` is offered only on a FULL page, because a
     * short page is the producer telling us it ran out.
     * @param {{limit: Number, offset: Number, count: Number}} page The snapshot's echoed bounds.
     * @returns {Object[]} the page strip's child vdom nodes.
     * @protected
     */
    buildPageVdom({limit, offset, count, hasMore}) {
        const
            atStart = offset <= 0,
            // The producer's own boundary fact, never inferred from `count === limit`. A full page
            // is ambiguous — it cannot distinguish "more follows" from "that was exactly the last
            // one" — and guessing enables Next on an exactly-full final page, whose read returns an
            // empty window at a positive offset: the pane then renders a global "no messages" and
            // hides the strip, trapping the operator with no way back.
            atEnd   = !hasMore;

        return [{
            tag          : 'button',
            type         : 'button',
            cls          : ['fm-mailbox-page-step', 'fm-mailbox-page-prev'],
            text         : '‹',
            disabled     : atStart,
            'aria-label' : 'Newer messages',
            'data-offset': String(Math.max(0, offset - limit))
        }, {
            tag : 'span',
            cls : ['fm-mailbox-page-range'],
            text: `${offset + 1}–${offset + count}`
        }, {
            tag          : 'button',
            type         : 'button',
            cls          : ['fm-mailbox-page-step', 'fm-mailbox-page-next'],
            text         : '›',
            disabled     : atEnd,
            'aria-label' : 'Older messages',
            'data-offset': String(offset + limit)
        }]
    }

    /**
     * @summary Request a page — the pane renders and never fetches, so it fires the intent and the
     * owner (which holds the read seam and the subject) performs the read.
     *
     * A disabled step cannot fire, so the range bound is enforced by the control's own state rather
     * than re-derived here; the offset rides on the button that knows it.
     * @param {Object} data Delegated click event data.
     * @protected
     */
    onPageClick(data) {
        const
            target = data.path?.find(node => node.data?.offset !== undefined),
            offset = Number(target?.data?.offset);

        Number.isSafeInteger(offset) && offset >= 0 && this.fire('pageRequest', {offset, source: this})
    }

    /**
     * @summary The pane's only interaction: toggle a thread's collapse — display-state navigation
     * on the view-owned record field, never a data write and never a read-state change.
     * @param {Object} data Delegated click event data.
     * @protected
     */
    onThreadHeadClick(data) {
        const
            me       = this,
            target   = data.path?.find(node => node.data?.threadId),
            threadId = target?.data?.threadId;

        if (!threadId) {
            return
        }

        const head = me.store.items.find(record => record.partOfThread === threadId);

        if (head) {
            head.threadCollapsed = !head.threadCollapsed;
            me.renderRows()
        }
    }
}

export default Neo.setupClass(MailboxPane);

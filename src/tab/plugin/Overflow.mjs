import Button from '../../button/Base.mjs';
import Plugin from '../../plugin/Base.mjs';

/**
 * @summary The tab-overflow affordance for a projected tab header toolbar: when the headers exceed the
 * available width, the overflowing tabs collapse behind a floating overflow control whose menu reaches them.
 *
 * The pure decision is this plugin's own static {@link Neo.tab.plugin.Overflow.computeOverflow} — a
 * projection concern, nothing persists. This plugin is the RUNTIME complement: it measures the live header extents
 * the pure core can only be handed, applies its verdict to the header buttons, and surfaces the hidden
 * remainder through a single overflow control whose selection routes back through the tab.Container's
 * EXISTING `activeIndex` path — zero new operations, zero new persisted state (the binding projection
 * constraint). `items` order and `activeItemId` already capture the state; overflow is projection only.
 *
 * It attaches to the projected tab header toolbar (`Neo.tab.header.Toolbar`) — it is NOT a dock-specific
 * `tab.Container` fork (the model contract's Split/Tab Adapter Boundary). The overflow control is an
 * OUT-OF-COLLECTION floating button rooted at `document.body`, deliberately NOT a member of `owner.items`:
 * the dock enables `dragResortable` (`DockLayoutAdapter`), so the header toolbar wires a SortZone that marks
 * every `owner.items` entry draggable and commits reorders via the `moveTo` the container fires on drop. A
 * trailing control inside `owner.items` would therefore be drag-reorderable and would corrupt the committed
 * dock tab order. Keeping the control floating (out of the collection) preserves the collection invariant —
 * `owner.items` stays exactly the real tabs, so the SortZone never sees it. The control also carries none of
 * a tab button's `activeIndex` click wiring (that lives in `getTabButtonConfig`, which the plugin bypasses),
 * so selecting it opens its menu rather than activating a phantom card.
 *
 * Natural-width discipline: overflowing buttons are removed from the DOM (Neo's built-in `hidden` /
 * removeDom), so re-measuring them would collapse their width to 0 and corrupt the next split. The plugin
 * therefore measures NATURAL widths once while every button is visible (on mount, and whenever the tab set
 * changes) and caches them; a plain resize only re-reads the always-visible strip extent and recomputes
 * against that cache.
 *
 * @class Neo.tab.plugin.Overflow
 * @extends Neo.plugin.Base
 */
class Overflow extends Plugin {
    static config = {
        /**
         * @member {String} className='Neo.tab.plugin.Overflow'
         * @protected
         */
        className: 'Neo.tab.plugin.Overflow',
        /**
         * @member {String} ntype='plugin-tab-overflow'
         * @protected
         */
        ntype: 'plugin-tab-overflow',
        /**
         * Width (px) the overflow control reserves from the header extent — handed to the pure core as
         * `controlWidth`, which reserves it ONLY when something overflows (a control that exists only when
         * needed must not consume width while everything fits).
         * @member {Number} controlWidth=40
         */
        controlWidth: 40
    }

    /**
     * The pure overflow decision — active-never-hidden packing with overflow-only control-width reservation.
     * Headless + deterministic (unit-covered): given header widths, the strip extent, the active id and the
     * reserved control width, it returns the visible/hidden id partition. It lives here as the plugin's own
     * static so the runtime half owns its decision — no adapter namespace-reach, no adapter chain in the test
     * path (the smell that marked the old dashboard home).
     * @param {Object}   config
     * @param {Object[]} config.items            `{id, headerWidth}` per tab, in header order.
     * @param {Number}   config.extent           The always-measurable strip extent.
     * @param {String}   [config.activeItemId]   The active tab id — never hidden.
     * @param {Number}   [config.controlWidth=0] Width reserved for the overflow control (only when overflowing).
     * @returns {{visible: String[], hidden: String[]}}
     */
    static computeOverflow({items, extent, activeItemId, controlWidth = 0}) {
        const list  = Array.isArray(items) ? items : [],
              width = entry => {
                  const value = Number(entry?.headerWidth);
                  return Number.isFinite(value) && value > 0 ? value : 0
              },
              total = list.reduce((sum, entry) => sum + width(entry), 0);

        if (!(total > extent)) {
            return {hidden: [], visible: list.map(entry => entry.id)}
        }

        const usable  = Math.max(0, extent - Math.max(0, Number(controlWidth) || 0)),
              visible = [],
              hidden  = [];
        let used = 0;

        for (const entry of list) {
            if (used + width(entry) <= usable && hidden.length === 0) {
                visible.push(entry.id);
                used += width(entry)
            } else {
                hidden.push(entry.id)
            }
        }

        // the active item never hides: swap it in, overflow the last-fitting non-active item
        const activeIndex = hidden.indexOf(activeItemId);

        if (activeIndex !== -1) {
            hidden.splice(activeIndex, 1);

            const activeWidth = width(list.find(entry => entry.id === activeItemId)),
                  order       = list.map(entry => entry.id),
                  displaced   = [];

            // Displace as many TRAILING visible items as it takes to fit the (possibly wider) active item.
            // Popping exactly one under-displaces when the active tab is wider than that single displaced tab
            // — the visible strip would then still exceed `usable` and the active spills. Loop until it fits,
            // or until nothing is left (the degenerate "active alone is wider than the strip" case, where it
            // stays visible regardless). Popping none is also correct when the active already fits (it was
            // hidden only because an earlier item overflowed the `hidden.length === 0` gate above).
            while (visible.length > 0 && used + activeWidth > usable) {
                const displacedId = visible.pop();
                used -= width(list.find(entry => entry.id === displacedId));
                displaced.push(displacedId)
            }

            visible.push(activeItemId);

            if (displaced.length > 0) {
                // re-insert the displaced items in list order so the overflow menu stays predictable
                hidden.push(...displaced);
                hidden.sort((a, b) => order.indexOf(a) - order.indexOf(b))
            }
        }

        return {hidden, visible}
    }

    /**
     * Plugin-owned active-button caps: button id → the caller's own `maxWidth` config value at
     * cap time (`null` when the consumer had none). Property presence on the button is NOT
     * provenance — a consumer may legitimately configure `maxWidth` — so this ledger is the one
     * source of truth for "the plugin installed this cap", and clearing always restores the exact
     * recorded caller value through the same public config channel.
     * @member {Map|null} appliedCaps=null
     */
    appliedCaps = null
    /**
     * The overflow control (a menu button), created on first overflow and torn down when everything fits.
     * @member {Neo.button.Base|null} control=null
     */
    control = null
    /**
     * Re-entrancy guard: `getDomRect` is an async main-thread round-trip, so a resize storm could overlap
     * measure passes and apply a stale split last.
     * @member {Boolean} measuring=false
     */
    measuring = false
    /**
     * The control's RENDERED width, measured while it is mounted (same round-trip as the extent read).
     * The `controlWidth` config is only the pre-creation estimate — the first overflow decision runs
     * before any control exists to measure. Once render truth is available, the reservation uses
     * `max(config, measured)`, so a skin that renders the control wider than the estimate can never
     * let packed buttons underlap it. `null` until the control has been measured; cleared with the control.
     * @member {Number|null} measuredControlWidth=null
     */
    measuredControlWidth = null
    /**
     * Natural (un-hidden) header widths keyed by tab-button id — see the class note on natural-width
     * discipline. `null` until the first capture.
     * @member {Object|null} naturalWidths=null
     */
    naturalWidths = null
    /**
     * Signature of the hidden set the control currently reflects (`index:text:iconCls` per entry).
     * Projections fire on many no-op events (resize, activation, the render-truth edges), and
     * rewriting identical menu items is not free: it rebuilds the dropdown list and closes an OPEN
     * menu mid-interaction. The signature makes syncControl's menu mutation idempotent — only a
     * changed partition touches the menu; re-arm and re-align stay unconditional.
     * @member {String|null} hiddenSignature=null
     */
    hiddenSignature = null
    /**
     * A project() call arrived while a measure pass was in flight; drained once the pass releases the
     * latch, so a coalesced resize / activation / tab-set change still applies against current extents.
     * @member {Boolean} projectQueued=false
     */
    projectQueued = false
    /**
     * Whether the coalesced re-run must re-read natural widths — sticky-true so a queued width-capturing
     * `project(true)` (the mount pass) is never downgraded to an extent-only pass by a later queued
     * `project(false)` (resize / activation) that overlapped it.
     * @member {Boolean} queuedRecapture=false
     */
    queuedRecapture = false
    /**
     * A re-mount attempt for a transiently unmounted control is in flight — see `syncControl`.
     * Prevents overlapping re-arms when syncs land faster than the mount round-trip settles.
     * @member {Boolean} remountArming=false
     */
    remountArming = false

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.onResize = me.onResize.bind(me);

        // The control is deliberately outside the owner's component collection and DOM subtree, so container
        // theme propagation cannot reach it. Keep that floating embodiment subscribed to every component in
        // the source toolbar's theme chain; button.Base carries the resolved nearest-active theme through to
        // the generated floating menu.List.
        //
        // Config subscribers run before the publisher's afterSetTheme() updates its cls carrier. Re-resolve in
        // the next microtask so getTheme() sees the completed ancestor change rather than the prior theme.
        if (Neo.typeOf(me.owner) === 'NeoInstance') {
            [me.owner, ...me.owner.getParents()].forEach(component => {
                me.observeConfig(component, 'theme', () => {
                    queueMicrotask(() => !me.isDestroyed && me.onOwnerThemeChange())
                })
            })
        }
    }

    /**
     * The tab.Container whose `activeIndex` an overflow-menu selection drives (the ordinary activation
     * path — no new operation). The header toolbar (`owner`) is its primary child.
     * @returns {Neo.tab.Container}
     */
    getTabContainer() {
        return this.owner.parent
    }

    /**
     * The header buttons that participate in overflow: the toolbar's items (the control is never among
     * them — see the class note).
     * @returns {Neo.tab.header.Button[]}
     */
    getTabButtons() {
        return (this.owner.items || []).filter(item => item !== this.control)
    }

    /**
     * Owner-mounted lifecycle hook: wire the resize + activation + tab-set-mutation listeners and run the
     * first (width-capturing) pass.
     *
     * Tab-set-change recapture wires the available header-mutation events: the owner toolbar fires `insert`
     * and `remove` on a tab add/remove, and the tab.Container fires `moveTo` on a reorder — each re-runs
     * `project(true)` so the cached natural widths, the split, and the overflow menu's indices follow the
     * mutated set even when neither a resize nor an `activeIndexChange` fires (a mid-menu insert / remove /
     * reorder into the hidden range would otherwise strand a pre-mutation projection and activate — or list —
     * the wrong record). This holds whether or not the dock rebuilds the header on a model change: if an
     * in-place update keeps this plugin instance, these listeners are what invalidate its cache; if a fresh
     * instance mounts instead, they are a harmless no-op it re-measures past. The sticky `queuedRecapture`
     * coalesces a mutation `project(true)` overlapping an in-flight resize/activation pass.
     * @override
     */
    onOwnerMounted() {
        let me      = this,
            {owner} = me;

        owner.addDomListeners([{resize: me.onResize, scope: me}]);
        // Re-run on activation too: selecting a hidden tab flips activeIndex, and active-never-hidden must
        // then surface the newly-active tab into the header (swapping a fitting one into the overflow menu).
        me.getTabContainer()?.on('activeIndexChange', me.onActiveIndexChange, me);
        // Re-run on a tab-set mutation: an add / remove (owner `insert` / `remove`) or a reorder
        // (tab.Container `moveTo`) changes the cached widths / menu indices without a resize or activation,
        // so recapture to keep the split live.
        owner.on('insert', me.onTabSetChange, me);
        owner.on('remove', me.onTabSetChange, me);
        me.getTabContainer()?.on('moveTo', me.onTabSetChange, me);
        me.project(true)
    }

    /**
     * Resize handler — an extent-only change, so recompute against the cached natural widths.
     * @param {Object} data
     */
    onResize(data) {
        this.project(false)
    }

    /**
     * Activation handler — a selection (including from the overflow menu) flipped `activeIndex`; recompute
     * so active-never-hidden surfaces the newly-active tab.
     */
    onActiveIndexChange() {
        this.project(false)
    }

    /**
     * Tab-set-mutation handler — a header add (`insert`) or reorder (`moveTo`) changed the button set, so
     * recapture natural widths (an added button has none cached) and re-partition against the mutated set.
     */
    onTabSetChange() {
        this.project(true)
    }

    /**
     * Re-resolves the source toolbar's nearest active theme onto the out-of-tree overflow embodiment.
     * A theme flip can change the control's rendered width (fonts, paddings), so the reservation
     * re-projects through the ordinary measure pass — the getDomRect round-trip queues behind the
     * theme update on the same channel, so it observes the re-skinned control.
     */
    onOwnerThemeChange() {
        let me        = this,
            {control} = me,
            value     = me.owner.getTheme();

        if (control && control.theme !== value) {
            control.theme = value;
            me.project(false)
        }
    }

    /**
     * Measures (natural widths as needed, strip extent always) and applies the visible/hidden split.
     * @param {Boolean} recapture  Re-read natural widths (mount, or the tab set changed).
     */
    async project(recapture) {
        let me      = this,
            {owner} = me,
            buttons = me.getTabButtons();

        if (!owner.mounted || buttons.length < 1) {
            return
        }

        // Re-entrancy: getDomRect is an async main-thread round-trip, so a resize / activation / tab-set
        // storm can overlap passes. Coalesce instead of dropping — remember a re-run is owed (recapture is
        // sticky) and apply it ONCE after the in-flight pass, so the last state wins over a stale split.
        if (me.measuring) {
            me.projectQueued   = true;
            me.queuedRecapture = me.queuedRecapture || recapture;
            return
        }

        me.measuring = true;

        try {
            // 1. Natural widths — measured once while every button is visible, then cached.
            if (recapture || !me.naturalWidths) {
                const removedButtons = buttons.filter(button => button.hidden),
                      cappedButtons  = buttons.filter(button => me.appliedCaps?.has(button.id));

                // A plugin-installed cap (applySplit) bounds the live rect below the natural width, so
                // measuring through it would poison the cache with the capped value. Restore the CALLER's
                // recorded maxWidth (reactively — the config's afterSet owns the vdom key; a silent write
                // would leave the capped vdom in place and measure the cap anyway) under the same latch
                // that restores hidden buttons. Ledger entries stay: the split right after re-caps against
                // fresh numbers (the recorded caller value stays authoritative) or clears via its ordinary
                // restore branch. Only ledger members are touched — a consumer-configured maxWidth is not
                // plugin residue and measures as part of the button's real constraint set.
                cappedButtons.forEach(button => {
                    button.maxWidth = me.appliedCaps.get(button.id)
                });

                // A prior split removes overflowing buttons from DOM. Restore them under this method's
                // measuring latch, then reconcile their closest common parent once so getDomRect observes
                // natural geometry. Any resize raised by that update queues behind the latch and drains as
                // an extent-only pass after this authoritative capture.
                if (removedButtons.length > 0 || cappedButtons.length > 0) {
                    removedButtons.forEach(button => {
                        button.setSilent({hidden: false});
                        // setSilent intentionally bypasses Component#show(). Keep the config and VDOM
                        // surfaces atomic or a later `button.hidden = false` becomes a no-op while the
                        // stale removeDom marker keeps the supposedly visible header physically absent.
                        delete button.vdom.removeDom
                    });
                    owner.updateDepth = -1;
                    await owner.promiseUpdate()
                }

                let previousWidths = me.naturalWidths || {},
                    rects          = await owner.getDomRect(buttons.map(button => button.id));

                me.naturalWidths = {};
                buttons.forEach((button, index) => {
                    // A recapture can run after the previous split removed overflowing headers from DOM.
                    // Their live rect is then zero by construction, not because their natural width changed.
                    // Keep the last positive measurement for those stable button identities; newly inserted
                    // buttons are visible on their first mutation pass and therefore still enter the cache.
                    me.naturalWidths[button.id] = Math.ceil(
                        rects[index]?.width || previousWidths[button.id] || 0
                    )
                })
            }

            // 2. The strip extent — the toolbar itself never hides, so it is always measurable. When the
            //    control is mounted, its rendered width rides the same round-trip: render truth for the
            //    reservation costs no extra latency.
            let controlId    = me.control?.mounted ? me.control.id : null,
                rects        = await owner.getDomRect(controlId ? [owner.id, controlId] : [owner.id]),
                extent       = Math.floor(rects[0]?.width || 0),
                tabContainer = me.getTabContainer(),
                activeButton = buttons[tabContainer?.activeIndex] || null,
                items        = buttons.map(button => ({id: button.id, headerWidth: me.naturalWidths[button.id]}));

            if (controlId && rects[1]?.width > 0) {
                me.measuredControlWidth = Math.ceil(rects[1].width)
            }

            // 3. The pure decision: active-never-hidden packing, overflow-only control reservation.
            //    The pure core is this plugin's own static (below) — no adapter namespace-reach, no cycle.
            let controlWidth = Math.max(me.controlWidth, me.measuredControlWidth || 0),
                {hidden}     = Overflow.computeOverflow({
                    activeItemId: activeButton?.id,
                    controlWidth,
                    extent,
                    items
                });

            me.applySplit(hidden, buttons, tabContainer, {
                activeButton,
                // The degenerate branch keeps an over-wide active visible past `usable` — cap its box so
                // every geometry derived from the button (the persistent per-button indicator, the strip's
                // crossfade indicator, the label itself) ends where the control begins.
                usable: hidden.length > 0 ? Math.max(0, extent - controlWidth) : null
            })
        } catch (error) {
            // getDomRect losing a race with teardown (owner unmounting mid-measure) is the ONE expected
            // failure: it must neither reject a fire-and-forget handler nor skip the drain below, and the
            // finally-released latch lets the NEXT event re-project (rejected→success self-heal). But a throw
            // against a LIVE owner is a programming defect — surface it rather than swallow it silently (a
            // blanket catch would hide real bugs behind a "just a teardown race" assumption).
            if (owner.mounted) {
                console.error('Neo.tab.plugin.Overflow: project() threw against a live owner', error)
            }
        } finally {
            // ALWAYS release the latch: a thrown getDomRect / applySplit must not strand `measuring` at
            // true, which would silently freeze every future projection (the header stops responding).
            me.measuring = false
        }

        // Drain a coalesced re-run: an event that arrived mid-pass is applied once here, against the
        // now-current extents, so the split never lags the last resize / activation / tab-set change.
        if (me.projectQueued) {
            let queuedRecapture = me.queuedRecapture;

            me.projectQueued   = false;
            me.queuedRecapture = false;
            me.project(queuedRecapture)
        }
    }

    /**
     * Applies the computed hidden set: hides the overflowing header buttons, bounds the degenerate
     * over-wide active button to the usable extent, and reflects the remainder through the overflow
     * control.
     *
     * The cap is horizontal-only by design: this plugin packs widths against a horizontal strip extent
     * (`tabBarPosition: 'top'` / `'bottom'` compositions); a vertical tab bar never mounts it, so the
     * vertical indicator branch has no overflow control to collide with.
     * @param {String[]} hidden  Overflowing button ids, in header order.
     * @param {Neo.tab.header.Button[]} buttons
     * @param {Neo.tab.Container} tabContainer
     * @param {Object}  activeCap
     * @param {Neo.tab.header.Button|null} activeCap.activeButton
     * @param {Number|null} activeCap.usable  Cap for the active button while overflowing; `null` clears.
     */
    applySplit(hidden, buttons, tabContainer, {activeButton, usable} = {}) {
        let me         = this,
            hiddenSet  = new Set(hidden),
            hiddenMeta = [];

        buttons.forEach((button, index) => {
            let isHidden = hiddenSet.has(button.id),
                needsCap = button === activeButton && usable !== null && usable !== undefined
                    && me.naturalWidths?.[button.id] > usable;

            // Neo's built-in `hidden` (removeDom) rather than a cls needing an external stylesheet rule —
            // the natural-width cache (captured while every button was visible) survives the DOM removal,
            // so a later widen re-measures nothing and simply flips `hidden` back.
            if (isHidden) {
                button.hidden = true
            } else if (button.hidden || button.vdom?.removeDom) {
                // Repair both surfaces. A prior silent batch can already report hidden=false while
                // removeDom still exists; assigning false again is then a reactive no-op, whereas
                // show() clears the marker and schedules the toolbar update which remounts the header.
                button.show()
            }

            // Degenerate-branch bound: `computeOverflow` keeps an active wider than `usable` visible
            // (active-never-hidden), so its box would run beneath the floating control — and with it every
            // geometry derived from the box: the persistent `.neo-tab-button-indicator` child, the strip's
            // crossfade indicator (sized from this rect), and the label glyphs the opaque control would
            // otherwise cover instead of an honest ellipsis. The cap rides the PUBLIC `maxWidth` config
            // (one channel, one vdom owner — the consumer's `style.maxWidth` is never touched), and the
            // `appliedCaps` ledger carries provenance: only a plugin-installed cap is ever cleared, and
            // clearing restores the exact caller value recorded at cap time.
            if (needsCap) {
                if (!me.appliedCaps?.has(button.id)) {
                    (me.appliedCaps ??= new Map()).set(button.id, button.maxWidth ?? null);
                    button.addCls('neo-tab-overflow-capped')
                }

                button.maxWidth = usable
            } else if (me.appliedCaps?.has(button.id)) {
                button.removeCls('neo-tab-overflow-capped');
                button.maxWidth = me.appliedCaps.get(button.id);
                me.appliedCaps.delete(button.id)
            }

            if (isHidden) {
                hiddenMeta.push({iconCls: button.iconCls, index, text: button.text})
            }
        });

        me.syncControl(hiddenMeta, tabContainer)
    }

    /**
     * Creates / updates / tears down the single overflow control. A menu selection sets the
     * tab.Container's `activeIndex` (the ordinary activation path); the follow-up measure pass then
     * surfaces the now-active tab by construction (active-never-hidden), so the selected tab is never
     * left in the menu.
     *
     * The control is a `button.Base` with a `menu` config — button.Base builds the dropdown `menu.List`
     * itself, so no menu is hand-assembled here. It is a floating instance rooted at `document.body` (out
     * of `owner.items`), and excluded from `getTabButtons()` by identity so it is never measured or hidden
     * as a tab — see the class note on why the control must stay out of the SortZone-draggable collection.
     * @param {Object[]} hiddenMeta  `{text, iconCls, index}` per hidden tab, in header order.
     * @param {Neo.tab.Container} tabContainer
     */
    syncControl(hiddenMeta, tabContainer) {
        let me = this;

        if (hiddenMeta.length < 1) {
            if (me.control) {
                me.control.destroy(true);
                me.control              = null;
                me.hiddenSignature      = null;
                // The measurement belongs to the torn-down embodiment; the next control re-measures.
                me.measuredControlWidth = null
            }
            return
        }

        let signature = hiddenMeta.map(meta => `${meta.index}:${meta.text}:${meta.iconCls}`).join('|'),
            menuItems = hiddenMeta.map(meta => ({
                handler: () => {tabContainer.activeIndex = meta.index},
                iconCls: meta.iconCls,
                text   : meta.text
            })),
            menuConfig = {
                // App-neutral identity for product skins. Theme ownership remains the control's live contract;
                // consumers can project their own token family without hand-building or subclassing this menu.
                cls  : ['neo-tab-overflow-menu'],
                items: menuItems
            };

        if (me.control) {
            // Idempotence gate: a projection that did not change the partition must not touch the
            // menu — rewriting identical items rebuilds the dropdown and closes it mid-interaction
            // (the render-truth edges made no-op projections routine, so this is load-bearing).
            if (signature !== me.hiddenSignature) {
                if (me.control.menuList) {
                    me.control.menuList.items = menuItems
                } else {
                    me.control.menu = menuConfig
                }
            }

            // Re-arm a transiently unmounted control. A floating instance mounts once at
            // create; any later unmount (a re-projection wave, a tour reset) previously
            // ratcheted into a permanent wedge — every following sync only mutated menu
            // items on the unmounted instance, and the overflow surface was gone for the
            // document's lifetime. The mount path itself is starvation-proof (message-driven
            // vnode create + insert; verified live in a fully hidden document), so
            // re-attempting here makes the surface self-healing against any transient
            // un-mounter. The latch bounds it to one in-flight attempt — which relies on
            // initVnode's lifecycle contract: its promise settles only when the REAL attempt
            // settles (a theme-file deferral chains through the re-entered attempt), and a
            // rejection releases isVnodeInitializing before rethrowing, so the guard above
            // re-opens and a later sync retries. The align follows only a successful mount
            // (mirroring the sync-time re-align below).
            if (!me.control.mounted && !me.control.isVnodeInitializing && !me.remountArming) {
                me.remountArming = true;

                me.control.initVnode(true)
                    .then(() => {
                        const {control} = me;
                        control && !control.isDestroyed && control.mounted && control.alignTo()
                    })
                    .catch(() => {})
                    .finally(() => {
                        me.remountArming = false
                    })
            }
        } else {
            // OUT-OF-COLLECTION mount: a floating button rooted directly at document.body, NOT a trailing
            // toolbar item. The dock sets `dragResortable: true` (DockLayoutAdapter), so the header toolbar
            // wires a SortZone that marks EVERY `owner.items` entry draggable — a trailing control there
            // would be drag-reorderable and would corrupt the committed dock tab order via the `moveTo` the
            // container fires on drop. Keeping the control OUT of `owner.items` preserves the collection
            // invariant (`owner.items` === exactly the real tabs) so the SortZone never sees it.
            //
            // `Neo.create` with `floating:true` + `parentId:'document.body'` roots at document.body directly
            // (verified: `Container.createItem` is the only path that injects `parentId=owner.id`, and we
            // bypass it). The parentless `initVnode(true)` autoMount reaches the DOM via the merged
            // hidden-document render-queue drain — before it, the insertNode reply parked behind a
            // suspended requestAnimationFrame in an offscreen / hidden document.
            me.control = Neo.create({
                module       : Button,
                // Align to the owner toolbar's right edge — the reserved overflow slot (the pure core keeps
                // `controlWidth` free there when anything overflows). Without an `align.target` a floating
                // component stays at its off-screen default (`left/top: -10000px`): it renders but is not
                // visible/clickable. `r0-r0` puts the control's right edge at the toolbar's right edge.
                align        : {edgeAlign: 'r0-r0', target: me.owner.id},
                appName      : me.owner.appName,
                autoInitVnode: true,
                autoMount    : true,
                cls          : ['neo-tab-overflow-control'],
                floating     : true,
                iconCls      : 'fa fa-ellipsis',
                menu         : menuConfig,
                parentId     : 'document.body',
                theme        : me.owner.getTheme(),
                windowId     : me.owner.windowId
            });

            // The reservation's render-truth EDGE: the pass that creates the control computed its split
            // with the pre-creation estimate — the rendered width does not exist yet, and no external
            // event is owed. Re-project when the mount lands (and on any later re-mount — idempotent, and
            // a fresh embodiment deserves a fresh measurement), so the estimate→rendered convergence is
            // this plugin's own lifecycle, never a wait for an unrelated resize/activation/mutation.
            if (Neo.typeOf(me.control) === 'NeoInstance') {
                me.observeConfig(me.control, 'mounted', value => {
                    value && !me.isDestroyed && me.project(false)
                })
            }
        }

        me.hiddenSignature = signature;

        // RA-13: re-align against the CURRENT owner rect. A floating component aligns once at mount and does
        // NOT re-align when its target moves — and a sync-driven projection change (tabs hidden/shown) moves
        // the toolbar's right edge without resizing the toolbar element, so neither the initial align nor the
        // offsetParent ResizeObserver re-fires. Re-aligning on each sync (control mounted) re-pins it to the
        // current edge — cheap + idempotent. The e2e owner-exact geometry assertion falsifies its absence.
        me.control?.mounted && me.control.alignTo()
    }

    /**
     * @param {...*} args
     * @override
     */
    destroy(...args) {
        let me = this;

        // A dying plugin must not strand its caps (a dock rebuild replaces the plugin, not the
        // buttons): restore each recorded caller value through the same channel the cap used.
        me.appliedCaps?.forEach((priorMaxWidth, buttonId) => {
            const button = me.getTabButtons().find(item => item.id === buttonId);

            if (button && !button.isDestroyed) {
                button.removeCls?.('neo-tab-overflow-capped');
                button.maxWidth = priorMaxWidth
            }
        });

        me.appliedCaps = null;
        me.control?.destroy(true);
        me.control = null;
        super.destroy(...args)
    }
}

export default Neo.setupClass(Overflow);

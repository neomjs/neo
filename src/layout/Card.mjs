import Base     from './Base.mjs';
import NeoArray from '../util/Array.mjs';

/**
 * @class Neo.layout.Card
 * @extends Neo.layout.Base
 */
class Card extends Base {
    /*
     * The name of the CSS class for an active item inside the card layout
     * @member {String} activeItemCls='neo-active-item'
     * @static
     */
    static activeItemCls = 'neo-active-item'
    /*
     * The name of the CSS class for an inactive item inside the card layout
     * @member {String} inactiveItemCls='neo-inactive-item'
     * @static
     */
    static inactiveItemCls = 'neo-inactive-item'
    /*
     * The name of the CSS class for an item inside the card layout
     * @member itemCls
     * @static
     */
    static itemCls = 'neo-layout-card-item'
    /**
     * Valid values for slideDirection
     * @member {String[]} iconPositions=['horizontal','vertical',null]
     * @protected
     * @static
     */
    static slideDirections = ['horizontal', 'vertical', null]

    static config = {
        /**
         * @member {String} className='Neo.layout.Card'
         * @protected
         */
        className: 'Neo.layout.Card',
        /**
         * @member {String} ntype='layout-card'
         * @protected
         */
        ntype: 'layout-card',
        /*
         * The item index of the card, which is currently active.
         * Change this value to activate a different card.
         * @member {Number} activeIndex_=0
         */
        activeIndex_: 0,
        /**
         * @member {String|null} containerCls='neo-layout-card'
         * @protected
         * @reactive
         */
        containerCls: 'neo-layout-card',
        /*
         * Remove the DOM of inactive cards.
         * This will keep the instances & vdom trees
         * @member {Boolean} removeInactiveCards=true
         */
        removeInactiveCards: true,
        /*
         * Valid values: 'horizontal', 'vertical', null
         * @member {String|null} slideDirection_=null
         */
        slideDirection_: null
    }

    /**
     * In-flight {@link #loadModule} calls for parked items carrying no `id`, keyed by the config
     * object so a second caller joins the first load instead of starting its own. Keyed by the
     * config rather than stored on it, because the config itself is handed to `Neo.create` once the
     * module resolves.
     * @member {WeakMap<Object,Promise>} loadingModules=new WeakMap()
     * @protected
     */
    loadingModules = new WeakMap()

    /**
     * In-flight {@link #loadModule} calls for parked items carrying an `id`.
     *
     * Object identity alone does not span a re-resolution. A consumer may legally hand `loadModule`
     * a DIFFERENT config object for the same item: `dashboard.dock`'s reconciler documents both
     * shapes as permitted — a cache-backed resolver returns the same instances, while the engine's
     * own default returns a fresh config literal. A repair pass re-resolving through that default
     * produced a new object, missed the identity guard, and constructed the item a second time.
     *
     * An `id` names the item across those re-resolutions, so it is registered ALONGSIDE the
     * identity entry rather than instead of it — never as a replacement. `core.Base.construct`
     * deletes `config.id` while the load is still pending, so an id-only registration would stop
     * matching the very object that started it. A plain `Map` rather than a `WeakMap` because a
     * string key holds nothing alive, and entries are removed on settle by {@link #loadModule},
     * exactly as the identity map's are.
     * @member {Map<String,Promise>} loadingModulesById=new Map()
     * @protected
     */
    loadingModulesById = new Map()

    /**
     * The admitted slot occupant and every config participating in one in-flight load, keyed by its promise.
     *
     * Exists only so the settle handler can release what the flight registered. The initiator is
     * known to it directly; a joiner is not, and a joiner's identity entry outliving the flight
     * would turn the documented retry-after-settle path into a silent cache — the next caller
     * would receive the settled promise and the previous instance instead of loading again.
     *
     * A `WeakMap` keyed on the promise, so a flight that somehow never settles cannot pin its
     * participants; the explicit delete in {@link #loadModule} is the ordinary path.
     * @member {WeakMap<Promise,Object>} #loadParticipants=new WeakMap()
     * @private
     */
    #loadParticipants = new WeakMap()

    /**
     * Modifies the CSS classes of the container items this layout is bound to.
     * Automatically gets triggered after changing the value of activeIndex.
     * Lazy loads items which use a module config containing a function.
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    async afterSetActiveIndex(value, oldValue) {
        let me              = this,
            {container, removeInactiveCards} = me,
            sCfg            = me.constructor,
            needsTransition = me.slideDirection && oldValue !== undefined,
            needsUpdate     = false,
            i, isActiveIndex, item, items, len, wrapperCls;

        if (Neo.isNumber(value) && container) {
            items = container.items;
            len   = items.length;

            // An empty container has nothing to activate yet: the index applies to the cards added later
            if (len && !items[value]) {
                Neo.error('Trying to activate a non existing card', value, items)
            }

            item = items[value];

            if (item && Neo.typeOf(item.module) === 'Function') {
                const requestedIndex = value,
                      previousCard   = items[oldValue];
                needsUpdate = true;
                const loaded = await me.loadModule(item, value);

                if (me.isDestroyed || container.isDestroyed) return;

                // Selection and membership may change while the import waits. Present the live cards.
                items = container.items;
                len   = items.length;
                value = me.activeIndex;
                needsTransition = needsTransition && value === requestedIndex && items[value] === loaded
                    && items[oldValue] === previousCard
            }

            for (i=0; i < len; i++) {
                isActiveIndex = i === value;
                item          = items[i];

                if (item instanceof Neo.component.Base) {
                    wrapperCls = item.wrapperCls;

                    NeoArray.remove(wrapperCls, isActiveIndex ? sCfg.inactiveItemCls : sCfg.activeItemCls);
                    NeoArray.add(   wrapperCls, isActiveIndex ? sCfg.activeItemCls   : sCfg.inactiveItemCls);

                    if (removeInactiveCards || needsUpdate) {
                        if (isActiveIndex) {
                            delete item.vdom.removeDom;
                            !needsTransition && item.activate?.()
                        } else if (removeInactiveCards) {
                            item.mounted        = false;
                            item.vdom.removeDom = true
                        }
                    }

                    item.wrapperCls = wrapperCls
                }
            }

            if (needsTransition) {
                await me.slideCards(value, oldValue)
            } else if (removeInactiveCards || needsUpdate) {
                container.updateDepth = -1; // include the full tree to honor new or changed inactive cards
                container.update()
            }
        }
    }

    /**
     * Initially sets the CSS classes of the container items this layout is bound to.
     * @param {Neo.component.Base} item
     * @param {Number} index
     * @param {Boolean} [keepInDom=false]
     */
    applyChildAttributes(item, index, keepInDom=false) {
        let me            = this,
            isActiveIndex = me.activeIndex === index,
            sCfg          = me.constructor,
            childCls      = item.wrapperCls || [],
            {vdom}        = item;

        NeoArray.add(   childCls, sCfg.itemCls);
        NeoArray.remove(childCls, isActiveIndex ? sCfg.inactiveItemCls : sCfg.activeItemCls);
        NeoArray.add(   childCls, isActiveIndex ? sCfg.activeItemCls   : sCfg.inactiveItemCls);

        if (me.removeInactiveCards) {
            if (isActiveIndex) {
                // An atomic cross-parent move can make a previously inactive card active. `keepInDom`
                // preserves its mounted identity, but must not preserve the source layout's remove marker.
                delete vdom.removeDom
            } else if (!keepInDom) {
                vdom.removeDom = true
            }
        }

        if (keepInDom && item.setSilent) {
            // Container.insert() uses keepInDom for atomic moves. Keep the item-level class mutation
            // inside that silent transaction; the caller's common-parent update owns the one DOM commit.
            item.setSilent({wrapperCls: childCls})
        } else {
            item.wrapperCls = childCls;
            me.removeInactiveCards && item.update?.() // can get called for an item config
        }
    }

    /**
     * Triggered before the slideDirection config gets changed
     * @param {String} value
     * @param {String} oldValue
     * @returns {String}
     * @protected
     */
    beforeSetSlideDirection(value, oldValue) {
        return this.beforeSetEnumValue(value, oldValue, 'slideDirection')
    }

    /**
     * @summary Loads a component.Base module which is defined via module: () => import('...')
     *
     * **Idempotent per item, and the guard belongs here.** Two callers legitimately ask for the same
     * parked item: a card layout loads it when its index activates, and `container.Base#insert`
     * starts the load itself when the inserted index is already the active one. Both are correct,
     * and neither can know about the other.
     *
     * `isLoading` below is NOT that guard. It is set for `form.Container` to read — its own comment
     * says so — and this method never consulted it, so both callers crossed the `await` on the
     * dynamic import and both reached `Neo.create`, the second overwriting the first instance and
     * orphaning a live component. The window is exactly the import's duration, which is why it
     * surfaced as an intermittent double construction under machine load rather than as a bug.
     *
     * A second call therefore joins the in-flight promise and settles on the same instance. What
     * counts as "the same item" is deliberately BOTH answers at once: the pending load is
     * registered under the config's object identity and, when it has one, under its `id`. Identity
     * alone was not enough — a caller re-resolving the item through a documented-legal path arrives
     * holding a new object for the same pane. The `id` alone is not enough either, because
     * construction deletes it from the config while the load is still in flight.
     * @param {Object} item
     * @param {Number} [index]
     * @returns {Promise<Neo.component.Base|null>} Null if the admitted item left its owner before settlement.
     */
    loadModule(item, index) {
        let me       = this,
            {id}     = item,
            admitted = me.container.items[Neo.isNumber(index) ? index : me.container.items.indexOf(item)],
            inFlight = me.loadingModules.get(item) || (id ? me.loadingModulesById.get(id) : null);

        if (inFlight && !me.loadingModules.has(item)) {
            const owner = me.#loadParticipants.get(inFlight)?.admitted;
            if (admitted ? owner !== admitted : !me.container.items.includes(owner)) inFlight = null
        }

        if (inFlight) {
            // A joiner that matched by `id` holds no identity entry of its own, and `id` is the
            // VOLATILE key: four sites delete it from a config as they consume it
            // (`Neo.mjs:263`, `collection/Base.mjs:633`, `core/Base.mjs:283`,
            // `functional/component/Base.mjs:493`). Registering the joiner under its own object
            // identity — the one key that cannot change — keeps its join for the rest of the
            // flight rather than only until its id is taken. Auditing those four call sites
            // instead would be an audit that rots at the fifth.
            me.loadingModules.set(item, inFlight);
            me.#loadParticipants.get(inFlight).participants.push(item);

            return inFlight
        }

        const load               = me.#loadModuleOnce(item, admitted),
              loadingModules     = me.loadingModules,
              loadingModulesById = me.loadingModulesById;

        // Registered under BOTH keys for the whole pending lifetime, and `id` is captured here
        // rather than re-read on the way out — because the parked object's key CHANGES while the
        // load is in flight. `core.Base.construct` runs `delete config.id` as it consumes the
        // config (`src/core/Base.mjs:283`), so choosing one key per call loses a joiner in
        // whichever direction it did not choose: an id-keyed entry misses a later caller holding
        // the same, now id-less object, and that caller re-enters the loader against an
        // `item.module` which has already become the resolved class. Two entries, one promise, so
        // a re-resolved config naming the item and the original object join the same load.
        const participants = [item];

        me.#loadParticipants.set(load, {admitted, participants});
        me.loadingModules.set(item, load);
        id && me.loadingModulesById.set(id, load);

        // A rejected import must not leave the item unloadable: the entries go whatever the
        // outcome, so the next activation retries against a config that is still parked behind its
        // placeholder. EVERY participant is removed, not just the initiator — a joiner's identity
        // entry outliving the flight would hand the next caller a settled promise and the old
        // instance, quietly converting the retry path into a cache. Removed by the captured id for
        // the same reason it was captured. `isLoading` goes too, or `form.Container` never re-queues it.
        return load.finally(() => {
            if (loadingModules.get(item) === load) delete item.isLoading;
            participants.forEach(participant => {
                if (loadingModules.get(participant) === load) loadingModules.delete(participant)
            });
            me.#loadParticipants.delete(load);
            if (id && loadingModulesById.get(id) === load) loadingModulesById.delete(id)
        })
    }

    /**
     * @summary Loads once per flight, publishing only while its admitted slot occupant remains in this owner.
     * @param {Object} item
     * @param {Object} admitted The slot occupant accepted before the import starts.
     * @returns {Promise<Neo.component.Base|null>}
     * @private
     */
    async #loadModuleOnce(item, admitted) {
        let me          = this,
            {container} = me,
            items       = container.items,
            {module}    = item,
            index, loaded, proto;

        if (!admitted) return null;

        item.isLoading = true; // prevent the item from getting queued multiple times inside form.Container

        module = await module();

        if (me.isDestroyed || container.isDestroyed) return null;

        items = container.items;
        index = items.indexOf(admitted);
        if (index < 0) return null;

        module = module.default;
        proto  = module.prototype;

        item.className = proto.className;
        item.module    = module;

        delete item.isLoading;
        delete item.vdom;

        item.appName  ??= container.appName;
        item.windowId ??= container.windowId;

        loaded = Neo.create(item);

        // Construction hooks can move or remove the admitted item, too.
        if (me.isDestroyed || container.isDestroyed) {
            loaded.destroy();
            return null
        }

        index = container.items.indexOf(admitted);
        if (index < 0) {
            loaded.destroy();
            return null
        }

        container.items[index] = item = loaded;

        me.applyChildAttributes(item, index);

        container.getVdomItemsRoot().cn[index] = item.createVdomReference();

        container.fire('cardLoaded', {item});

        return item
    }

    /**
     * @param {Number} index
     * @param {Number} oldIndex
     */
    async slideCards(index, oldIndex) {
        let me            = this,
            {container}   = me,
            slideVertical = me.slideDirection === 'vertical',
            {items, vdom} = container,
            card          = items[index],
            oldCard       = items[oldIndex],
            slideIn       = index > oldIndex,
            rect          = await container.getDomRect(container.id),
            animationWrapper, style, x, y;

        delete oldCard.vdom.removeDom;

        if (slideVertical) {
            y = slideIn ? 0 : -rect.height;

            style = {
                flexDirection: 'column',
                height       : `${2 * rect.height}px`,
                transform    : `translateY(${y}px)`,
                width        : `${rect.width}px`
            }
        } else {
            x = slideIn ? 0 : -rect.width;

            style = {
                height   : `${rect.height}px`,
                transform: `translateX(${x}px)`,
                width    : `${2 * rect.width}px`
            }
        }

        vdom.cn = [
            {cls: ['neo-relative'], cn: [
                {cls: ['neo-animation-wrapper'], style, cn: [card.createVdomReference()]}
            ]}
        ];

        animationWrapper = vdom.cn[0].cn[0];

        animationWrapper.cn[slideIn ? 'unshift' : 'push'](oldCard.createVdomReference());

        container.updateDepth = -1;

        await container.promiseUpdate();

        animationWrapper.style.transform = slideVertical ?
            `translateY(${slideIn ? -rect.height : 0}px)` :
            `translateX(${slideIn ? -rect.width  : 0}px)`;

        await container.promiseUpdate();

        await me.timeout(300); // transition duration defined via CSS for now

        vdom.cn = [];

        container.items.forEach(item => {
            vdom.cn.push(item.createVdomReference())
        });

        oldCard.vdom.removeDom = true;

        container.updateDepth = -1;

        await container.promiseUpdate()
    }

    /**
     * Serializes the instance into a JSON-compatible object for the Neural Link.
     * @returns {Object}
     */
    toJSON() {
        let me = this;

        return {
            ...super.toJSON(),
            activeIndex        : me.activeIndex,
            containerCls       : me.containerCls,
            removeInactiveCards: me.removeInactiveCards,
            slideDirection     : me.slideDirection
        }
    }
}

export default Neo.setupClass(Card);

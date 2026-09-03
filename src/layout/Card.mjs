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
     * In-flight {@link #loadModule} calls, keyed by the parked item config so a second caller joins
     * the first load instead of starting its own. Keyed by the config rather than stored on it,
     * because the config itself is handed to `Neo.create` once the module resolves.
     * @member {WeakMap<Object,Promise>} loadingModules=new WeakMap()
     * @protected
     */
    loadingModules = new WeakMap()

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
            i, isActiveIndex, item, items, len, module, wrapperCls;

        if (Neo.isNumber(value) && container) {
            items = container.items;
            len   = items.length;

            if (!items[value]) {
                Neo.error('Trying to activate a non existing card', value, items)
            }

            // we need to run the loop twice, since lazy loading a module at a higher index does affect lower indexes
            for (i=0; i < len; i++) {
                module = items[i].module;

                if (i === value && Neo.typeOf(module) === 'Function') {
                    needsUpdate = true;
                    break
                }
            }

            for (i=0; i < len; i++) {
                isActiveIndex = i === value;
                item          = items[i];
                module        = item.module;

                if (isActiveIndex && Neo.typeOf(module) === 'Function') {
                    item = await me.loadModule(item, i)
                }

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
     * A second call therefore joins the in-flight promise and settles on the same instance. The
     * promise is keyed in a `WeakMap` by the parked config rather than stored on it, because that
     * config is passed to `Neo.create` once it resolves.
     * @param {Object} item
     * @param {Number} [index]
     * @returns {Promise<Neo.component.Base>}
     */
    loadModule(item, index) {
        let me       = this,
            inFlight = me.loadingModules.get(item);

        if (inFlight) {
            return inFlight
        }

        const load = me.#loadModuleOnce(item, index);

        me.loadingModules.set(item, load);

        // A rejected import must not leave the item unloadable: the entry goes whatever the outcome,
        // so the next activation retries against a config that is still parked behind its placeholder.
        return load.finally(() => me.loadingModules.delete(item))
    }

    /**
     * The one-shot body of {@link #loadModule}, entered at most once per parked item at a time.
     * @param {Object} item
     * @param {Number} [index]
     * @returns {Promise<Neo.component.Base>}
     * @private
     */
    async #loadModuleOnce(item, index) {
        let me          = this,
            {container} = me,
            items       = container.items,
            {module}    = item,
            proto;

        if (!Neo.isNumber(index)) {
            index = items.indexOf(item)
        }

        item.isLoading = true; // prevent the item from getting queued multiple times inside form.Container

        module = await module();
        module = module.default;
        proto  = module.prototype;

        item.className = proto.className;
        item.module    = module;

        delete item.isLoading;
        delete item.vdom;

        item.appName  ??= container.appName;
        item.windowId ??= container.windowId;

        items[index] = item = Neo.create(item);

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

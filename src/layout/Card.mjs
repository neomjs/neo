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
     * Modifies the CSS classes of the container items this layout is bound to.
     * Automatically gets triggered after changing the value of activeIndex.
     * Lazy loads items which use a module config containing a function.
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    async afterSetActiveIndex(value, oldValue) {
        let me                  = this,
            containerId         = me.containerId,
            container           = Neo.getComponent(containerId) || Neo.get(containerId), // the instance might not be registered yet
            sCfg                = me.constructor,
            needsTransition     = me.slideDirection && oldValue !== undefined,
            needsUpdate         = false,
            removeInactiveCards = me.removeInactiveCards,
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

                    item.wrapperCls = wrapperCls;

                    if (!needsTransition && (removeInactiveCards || needsUpdate)) {
                        if (isActiveIndex) {
                            delete item.vdom.removeDom;
                            item.activate?.()
                        } else if (removeInactiveCards) {
                            item.mounted        = false;
                            item.vdom.removeDom = true
                        }
                    }
                }
            }

            if (needsTransition) {
                await me.slideCards(value, oldValue)
            } else {
                if (removeInactiveCards || needsUpdate) {
                    container.update()
                }
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
            childCls      = item.wrapperCls,
            vdom          = item.vdom;

        NeoArray.add(childCls, sCfg.itemCls);
        NeoArray.add(childCls, isActiveIndex ? sCfg.activeItemCls : sCfg.inactiveItemCls);

        if (!keepInDom && me.removeInactiveCards) {
            vdom.removeDom  = !isActiveIndex;
            item.wrapperCls = childCls;
            item.update()
        } else {
            item.wrapperCls = childCls
        }
    }

    /**
     * Applies CSS classes to the container this layout is bound to
     */
    applyRenderAttributes() {
        let me         = this,
            container  = Neo.getComponent(me.containerId),
            wrapperCls = container?.wrapperCls || [];

        if (!container) {
            Neo.logError('layout.Card: applyRenderAttributes -> container not yet created', me.containerId)
        }

        NeoArray.add(wrapperCls, 'neo-layout-card');

        container.wrapperCls = wrapperCls
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
     * Loads a component.Base module which is defined via module: () => import('...')
     * @param {Object} item
     * @param {Number} [index]
     * @returns {Neo.component.Base}
     */
    async loadModule(item, index) {
        let me          = this,
            containerId = me.containerId,
            container   = Neo.getComponent(containerId) || Neo.get(containerId), // the instance might not be registered yet
            items       = container.items,
            sCfg        = me.constructor,
            vdom        = container.vdom,
            module      = item.module,
            proto, wrapperCls;

        if (!Neo.isNumber(index)) {
            index = items.indexOf(item)
        }

        item.isLoading = true; // prevent the item from getting queued multiple times inside form.Container

        module     = await module();
        module     = module.default;
        proto      = module.prototype;
        wrapperCls = item.wrapperCls || proto.constructor.config.wrapperCls || [];

        item.className  = proto.className;
        item.wrapperCls = [...wrapperCls, sCfg.itemCls];
        item.module     = module;

        delete item.isLoading;
        delete item.vdom;

        items[index] = item = Neo.create(item);

        if (me.removeInactiveCards) {
            item.vdom.removeDom = true
        }

        container.fire('cardLoaded', {item});

        vdom.cn[index] = item.vdom;

        return item
    }

    /**
     * Removes all CSS rules from the container this layout is bound to.
     * Gets called when switching to a different layout.
     */
    removeRenderAttributes() {
        let me         = this,
            container  = Neo.getComponent(me.containerId),
            wrapperCls = container?.wrapperCls || [];

        if (!container) {
            Neo.logError('layout.Card: removeRenderAttributes -> container not yet created', me.containerId)
        }

        NeoArray.remove(wrapperCls, 'neo-layout-card');

        container.wrapperCls = wrapperCls
    }

    /**
     * @param {Number} index
     * @param {Number} oldIndex
     */
    async slideCards(index, oldIndex) {
        console.log('slideCards', index, oldIndex);

        let me                          = this,
            {container, slideDirection} = me,
            {items}                     = container,
            card                        = items[index],
            oldCard                     = items[oldIndex],
            height, rect, transform, vdom, x, width;

        rect      = await container.getDomRect(container.id);
        height    = `${rect.height}px`;
        x         = index > oldIndex ? 0 : -rect.width;
        transform = `translateX(${x}px)`;
        vdom      = container.vdom;
        width     = `${2 * rect.width}px`;

        delete card.vdom.removeDom;

        vdom.cn = [
            {cls: ['neo-relative'], cn: [
                {cls: ['neo-animation-wrapper'], style: {height, transform, width}, cn: [
                    oldCard.vdom,
                    card.vdom
                ]}
            ]}
        ];

        await container.promiseUpdate();

        x = index > oldIndex ? -rect.width : 0;

        vdom.cn[0].cn[0].style.transform = `translateX(${x}px)`;

        await container.promiseUpdate();

        await me.timeout(300);

        vdom.cn[0] = vdom.cn[0].cn[0].cn[1];

        await container.promiseUpdate()
    }
}

Neo.setupClass(Card);

export default Card;

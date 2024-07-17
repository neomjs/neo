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

        NeoArray.add(childCls, sCfg.itemCls);
        NeoArray.add(childCls, isActiveIndex ? sCfg.activeItemCls : sCfg.inactiveItemCls);

        if (!keepInDom && me.removeInactiveCards) {
            vdom.removeDom  = !isActiveIndex;
            item.wrapperCls = childCls;
            item.update?.() // can get called for an item config
        } else {
            item.wrapperCls = childCls
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
     * Loads a component.Base module which is defined via module: () => import('...')
     * @param {Object} item
     * @param {Number} [index]
     * @returns {Neo.component.Base}
     */
    async loadModule(item, index) {
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

        me.applyChildAttributes(item, index);

        delete item.isLoading;
        delete item.vdom;

        items[index] = item = Neo.create(item);

        container.getVdomItemsRoot().cn[index] = item.vdom;

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
                {cls: ['neo-animation-wrapper'], style, cn: [card.vdom]}
            ]}
        ];

        animationWrapper = vdom.cn[0].cn[0];

        animationWrapper.cn[slideIn ? 'unshift' : 'push'](oldCard.vdom);

        await container.promiseUpdate();

        animationWrapper.style.transform = slideVertical ?
            `translateY(${slideIn ? -rect.height : 0}px)` :
            `translateX(${slideIn ? -rect.width  : 0}px)`;

        await container.promiseUpdate();

        await me.timeout(300); // transition duration defined via CSS for now

        vdom.cn = [];

        container.items.forEach(item => {
            vdom.cn.push(item.vdom)
        });

        oldCard.vdom.removeDom = true;

        await container.promiseUpdate()
    }
}

Neo.setupClass(Card);

export default Card;

import Base     from './Base.mjs';
import NeoArray from '../util/Array.mjs';

/**
 * @class Neo.layout.Card
 * @extends Neo.layout.Base
 */
class Card extends Base {
    static getStaticConfig() {return {
        /*
         * The name of the CSS class for an active item inside the card layout
         * @member {String} activeItemCls='neo-active-item'
         * @static
         */
        activeItemCls: 'neo-active-item',
        /*
         * The name of the CSS class for an inactive item inside the card layout
         * @member {String} inactiveItemCls='neo-inactive-item'
         * @static
         */
        inactiveItemCls: 'neo-inactive-item',
        /*
         * The name of the CSS class for an item inside the card layout
         * @member itemCls
         * @static
         */
        itemCls: 'neo-layout-card-item'
    }}

    static getConfig() {return {
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
        removeInactiveCards: true
    }}

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
            sCfg                = me.getStaticConfig(),
            needsUpdate         = false,
            removeInactiveCards = me.removeInactiveCards,
            cls, i, isActiveIndex, item, items, len, module, proto, vdom;

        if (Neo.isNumber(value) && container) {
            items = container.items;
            vdom  = container.vdom;
            len   = items.length;

            if (!items[value]) {
                Neo.error('Trying to activate a non existing card', value, items);
            }

            // we need to run the loop twice, since lazy loading a module at a higher index does affect lower indexes
            for (i=0; i < len; i++) {
                module = items[i].module;

                if (i === value && !module?.isClass && Neo.isFunction(module)) {
                    needsUpdate = true;
                    break;
                }
            }

            for (i=0; i < len; i++) {
                isActiveIndex = i === value;
                item          = items[i];
                module        = item.module;

                if (isActiveIndex && !module?.isClass && Neo.isFunction(module)) {
                    module = await module();
                    module = module.default;
                    proto  = module.prototype;
                    cls    = item.wrapperCls || proto.constructor.config.wrapperCls || [];

                    item.className = proto.className;
                    item.cls       = [...wrapperCls, sCfg.itemCls];
                    item.module    = module;

                    delete item.vdom;

                    items[i] = item = Neo.create(item);

                    container.fire('cardLoaded', {item});

                    vdom.cn[i] = item.vdom;
                }

                if (item instanceof Neo.core.Base) {
                    cls = item.wrapperCls;

                    NeoArray.remove(cls, isActiveIndex ? sCfg.inactiveItemCls : sCfg.activeItemCls);
                    NeoArray.add(   cls, isActiveIndex ? sCfg.activeItemCls   : sCfg.inactiveItemCls);

                    if (removeInactiveCards || needsUpdate) {
                        item._wrapperCls = cls; // silent update
                        item.vdom.cls = [...cls];

                        if (isActiveIndex) {
                            delete item.vdom.removeDom;
                            item.activate?.();
                        } else if (removeInactiveCards) {
                            item.mounted = false;
                            item.vdom.removeDom = true;
                        }
                    } else {
                        item.wrapperCls = cls;
                    }
                }
            }

            if (removeInactiveCards || needsUpdate) {
                container.vdom = vdom;
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
            sCfg          = me.getStaticConfig(),
            childCls      = item.wrapperCls,
            vdom          = item.vdom;

        NeoArray.add(childCls, sCfg.itemCls);
        NeoArray.add(childCls, isActiveIndex ? sCfg.activeItemCls : sCfg.inactiveItemCls);

        if (!keepInDom && me.removeInactiveCards) {
            item._wrapperCls = childCls; // silent update
            vdom.removeDom = !isActiveIndex;
            item.vdom = vdom;
        } else {
            item.wrapperCls = childCls;
        }
    }

    /**
     * Applies CSS classes to the container this layout is bound to
     */
    applyRenderAttributes() {
        let me        = this,
            container = Neo.getComponent(me.containerId),
            cls       = container?.wrapperCls || [];

        if (!container) {
            Neo.logError('layout.Card: applyRenderAttributes -> container not yet created', me.containerId);
        }

        NeoArray.add(cls, 'neo-layout-card');

        container.wrapperCls = cls;
    }

    /**
     * Removes all CSS rules from the container this layout is bound to.
     * Gets called when switching to a different layout.
     */
    removeRenderAttributes() {
        let me        = this,
            container = Neo.getComponent(me.containerId),
            cls       = container?.wrapperCls || [];

        if (!container) {
            Neo.logError('layout.Card: removeRenderAttributes -> container not yet created', me.containerId);
        }

        NeoArray.remove(cls, 'neo-layout-card');

        container.wrapperCls = cls;
    }
}

Neo.applyClassConfig(Card);

export default Card;

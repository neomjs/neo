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
         * @member activeItemCls
         * @static
         */
        activeItemCls: 'active-item',
        /*
         * The name of the CSS class for an inactive item inside the card layout
         * @member inactiveItemCls
         * @static
         */
        inactiveItemCls: 'inactive-item',
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
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    async afterSetActiveIndex(value, oldValue) {
        let me          = this,
            container   = Neo.getComponent(me.containerId),
            sCfg        = me.getStaticConfig(),
            needsUpdate = false,
            isActiveIndex, cls, items, module, proto, vdom;

        if (container) {
            items = container.items;
            vdom  = container.vdom;

            if (!items[value]) {
                Neo.error('Trying to activate a non existing card', value, items);
            }

            // we need to run the loop twice, since lazy loading a module at a higher index does affect lower indexes
            for (let [index, item] of items.entries()) {
                module = item.module

                if (index === value && module && !module.isClass && Neo.isFunction(module)) {
                    needsUpdate = true;
                    break;
                }
            }

            for (let [index, item] of items.entries()) {
                isActiveIndex = index === value;
                module        = item.module

                if (isActiveIndex && module && !module.isClass && Neo.isFunction(module)) {
                    module = await module();
                    module = module.default;
                    proto  = module.prototype;
                    cls    = item.cls || proto.constructor.config.cls || [];

                    item.className = proto.className;
                    item.cls       = [...cls, sCfg.itemCls]
                    item.module    = module;

                    delete item.vdom;

                    items[index] = item = Neo.create(item);

                    vdom.cn[index] = item.vdom;
                }

                if (item instanceof Neo.core.Base) {
                    cls = item.cls;

                    NeoArray.remove(cls, isActiveIndex ? sCfg.inactiveItemCls : sCfg.activeItemCls);
                    NeoArray.add(   cls, isActiveIndex ? sCfg.activeItemCls   : sCfg.inactiveItemCls);

                    if (me.removeInactiveCards || needsUpdate) {
                        item._cls = cls; // silent update
                        item.getVdomRoot().cls = cls;

                        if (isActiveIndex) {
                            delete item.vdom.removeDom;
                        } else {
                            item.mounted = false;
                            item.vdom.removeDom = true;
                        }
                    } else {
                        item.cls = cls;
                    }
                }
            }

            if (me.removeInactiveCards || needsUpdate) {
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
            childCls      = item.cls,
            vdom          = item.vdom;

        NeoArray.add(childCls, sCfg.itemCls);
        NeoArray.add(childCls, isActiveIndex ? sCfg.activeItemCls : sCfg.inactiveItemCls);

        if (!keepInDom && me.removeInactiveCards) {
            item._cls = childCls; // silent update
            vdom.removeDom = !isActiveIndex;
            item.vdom = vdom;
        } else {
            item.cls = childCls;
        }
    }

    /**
     * Applies CSS classes to the container this layout is bound to
     */
    applyRenderAttributes() {
        let me        = this,
            container = Neo.getComponent(me.containerId),
            cls       = container && container.cls;

        if (!container) {
            Neo.logError('layout.Card: applyRenderAttributes -> container not yet created', me.containerId);
        }

        NeoArray.add(cls || [], 'neo-layout-card');

        container.cls = cls;
    }

    /**
     * Removes all CSS rules from the container this layout is bound to.
     * Gets called when switching to a different layout.
     */
    removeRenderAttributes() {
        let me        = this,
            container = Neo.getComponent(me.containerId),
            cls       = container && container.cls;

        if (!container) {
            Neo.logError('layout.Card: removeRenderAttributes -> container not yet created', me.containerId);
        }

        NeoArray.remove(cls, 'neo-layout-card');

        container.cls = cls;
    }
}

Neo.applyClassConfig(Card);

export {Card as default};
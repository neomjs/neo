import Base from '../../plugin/Base.mjs';

/**
 * @class Neo.list.plugin.Animate
 * @extends Neo.plugin.Base
 */
class Animate extends Base {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.list.plugin.Animate'
         * @protected
         */
        className: 'Neo.list.plugin.Animate'
    }}

    /**
     * @param {Object} config
     */
    constructor(config) {
        super(config);
        this.adjustCreateItem();
    }

    adjustCreateItem() {
        let me    = this,
            owner = me.owner;

        me.ownerCreateItem = owner.createItem.bind(owner);
        owner.createItem   = me.createItem.bind(owner, me);
    }

    createItem(scope, ...args) {
        let item  = scope.ownerCreateItem(...args),
            style = item.style || {};

        Object.assign(style, {
            position: 'absolute'
        });

        item.style = style;

        return item;
    }
}

Neo.applyClassConfig(Animate);

export {Animate as default};

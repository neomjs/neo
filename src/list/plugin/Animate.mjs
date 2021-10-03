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
        className: 'Neo.list.plugin.Animate',
        /**
         * Value in px
         * @member {Number} itemHeight=100
         */
        itemHeight: 200,
        /**
         * Value in px
         * @member {Number} itemWidth=300
         */
        itemWidth: 300,
        /**
         * @member {DOMRect|null} ownerRect=null
         */
        ownerRect: null
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

    createItem(me, ...args) {
        let item  = me.ownerCreateItem(...args),
            style = item.style || {};

        console.log(me.ownerRect);

        Object.assign(style, {
            height  : `${me.itemHeight}px`,
            position: 'absolute',
            width   : `${me.itemWidth}px`
        });

        item.style = style;

        return item;
    }

    /**
     *
     */
    onOwnerMounted() {
        let me = this;

        Neo.main.DomAccess.getBoundingClientRect({
            id: me.owner.id
        }).then(rect => {
            me.ownerRect = rect;
        });
    }
}

Neo.applyClassConfig(Animate);

export {Animate as default};

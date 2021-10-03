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
         * Read only
         * @member {Number|null} columns=null
         */
        columns: null,
        /**
         * Value in px
         * @member {Number} itemHeight=200
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
        ownerRect: null,
        /**
         * Read only
         * @member {Number|null} rows=null
         */
        rows: null
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

    createItem(me, record, index) {
        let item  = me.ownerCreateItem(record, index),
            style = item.style || {},
            column, row;

        if (!me.ownerRect) {
            return null;
        }

        column =  index % me.columns;
        row    = Math.floor(index / me.columns);

        Object.assign(style, {
            height   : `${me.itemHeight}px`,
            position : 'absolute',
            transform: `translate(${column * me.itemWidth}px, ${row * me.itemHeight}px)`,
            width    : `${me.itemWidth}px`
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
            Object.assign(me, {
                columns  : Math.floor(rect.width / me.itemWidth),
                ownerRect: rect,
                rows     : Math.floor(rect.height / me.itemHeight)
            });
        });
    }
}

Neo.applyClassConfig(Animate);

export {Animate as default};

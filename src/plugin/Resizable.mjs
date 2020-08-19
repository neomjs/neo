import Base from './Base.mjs';

/**
 * @class Neo.plugin.Resizable
 * @extends Neo.plugin.Base
 */
class Resizable extends Base {
    static getStaticConfig() {return {
        /**
         * Directions into which you want to drag => resize
         * @member {String[]} validDirections=['b','bl','br','l','r','t','tl','tr']
         * @static
         */
        validDirections: ['b', 'bl', 'br', 'l', 'r', 't', 'tl', 'tr']
    }}

    static getConfig() {return {
        /**
         * @member {String} className='Neo.plugin.Resizable'
         * @protected
         */
        className: 'Neo.plugin.Resizable',
        /**
         * @member {String} ntype='plugin-resizable'
         * @protected
         */
        ntype: 'plugin-resizable',
        /**
         * Directions into which you want to drag => resize
         * @member {String[]} directions_=['b','bl','br','l','r','t','tl','tr']
         */
        directions_: ['b', 'bl', 'br', 'l', 'r', 't', 'tl', 'tr'],
        /**
         * @member {Number} gap=10
         * @protected
         */
        gap: 15,
        /**
         * @member {Object} nodeBottom=null
         * @protected
         */
        nodeBottom: null,
        /**
         * @member {Object} nodeBottomLeft=null
         * @protected
         */
        nodeBottomLeft: null,
        /**
         * @member {Object} nodeBottomRight=null
         * @protected
         */
        nodeBottomRight: null,
        /**
         * @member {Object} nodeLeft=null
         * @protected
         */
        nodeLeft: null,
        /**
         * @member {Object} nodeRight=null
         * @protected
         */
        nodeRight: null,
        /**
         * @member {Object} nodeTop=null
         * @protected
         */
        nodeTop: null,
        /**
         * @member {Object} nodeTopLeft=null
         * @protected
         */
        nodeTopLeft: null,
        /**
         * @member {Object} nodeTopRight=null
         * @protected
         */
        nodeTopRight: null
    }}

    /**
     *
     * @param {Object} config
     */
    constructor(config) {
        super(config);

        let me           = this,
            domListeners = me.owner.domListeners;

        domListeners.push({
            mousemove: me.onMouseMove,
            local    : true,
            scope    : me
        });

        me.owner.domListeners = domListeners;
    }

    /**
     *
     * @param {Object} data
     */
    onMouseMove(data) {
        let me  = this,
            i   = 0,
            gap = me.gap,
            len = data.path.length,
            bottom, left, right, target, top;

        for (; i < len; i++) {
            if (data.path[i].cls.includes('neo-dialog')) {
                target = data.path[i];
                break;
            }
        }

        bottom = data.clientY >= target.offsetTop  - gap + target.offsetHeight;
        left   = data.clientX <= target.offsetLeft + gap;
        right  = data.clientX >= target.offsetLeft - gap + target.offsetWidth;
        top    = data.clientY <= target.offsetTop  + gap;

        console.log(bottom, left, right, top);
    }
}

Neo.applyClassConfig(Resizable);

export {Resizable as default};
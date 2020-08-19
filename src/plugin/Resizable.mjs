import Base     from './Base.mjs';
import NeoArray from '../util/Array.mjs';

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
        gap: 10,
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
     * @param {String} name
     * @returns {Boolean} true
     */
    addNode(name) {
        let me       = this,
            nodeName = 'node' + Neo.capitalize(name);

        me[nodeName] = {cls: ['neo-resizable', 'neo-resizable-' + name]};
        me.owner.getVdomRoot().cn.push(me[nodeName]);

        return true;
    }

    /**
     *
     * @param {Object} data
     */
    onMouseMove(data) {
        let me        = this,
            i         = 0,
            gap       = me.gap,
            hasChange = false,
            len       = data.path.length,
            vdom      = me.owner.vdom,
            bottom, left, right, target, top;

        for (; i < len; i++) {
            if (data.path[i].cls.includes('neo-dialog')) {
                target = data.path[i];
                break;
            }
        }

        bottom = data.clientY >= target.rect.y - gap + target.rect.height;
        left   = data.clientX <= target.rect.x + gap;
        right  = data.clientX >= target.rect.x - gap + target.rect.width;
        top    = data.clientY <= target.rect.y + gap;

        if (bottom) {
            if (!me.nodeBottom) {hasChange = me.addNode('bottom');}

            if      (left  && !me.nodeBottomLeft)  {hasChange = me.addNode('bottom-left');}
            else if (right && !me.nodeBottomRight) {hasChange = me.addNode('bottom-right');}
        }
        else if (left  && !me.nodeLeft)  {hasChange = me.addNode('left');}
        else if (right && !me.nodeRight) {hasChange = me.addNode('right');}
        else if (top) {
            if (!me.nodeTop) {hasChange = me.addNode('top');}

            if      (left  && !me.nodeTopLeft)  {hasChange = me.addNode('top-left');}
            else if (right && !me.nodeTopRight) {hasChange = me.addNode('top-right');}
        }

        if (!bottom) {
            if (me.nodeBottom) {hasChange = me.removeNode('bottom');}

            if      (!left  && me.nodeBottomLeft)  {hasChange = me.removeNode('bottom-left');}
            else if (!right && me.nodeBottomRight) {hasChange = me.removeNode('bottom-right');}
        }
        else if (!left  && me.nodeLeft)  {hasChange = me.removeNode('left');}
        else if (!right && me.nodeRight) {hasChange = me.removeNode('right');}
        else if (!top) {
            if (me.nodeTop) {hasChange = me.removeNode('top');}

            if      (!left  && me.nodeTopLeft)  {hasChange = me.removeNode('top-left');}
            else if (!right && me.nodeTopRight) {hasChange = me.removeNode('top-right');}
        }

        if (hasChange) {
            me.owner.vdom = vdom;
        }

        // console.log(bottom, left, right, top);
    }

    /**
     *
     * @param {String} name
     * @returns {Boolean} true
     */
    removeNode(name) {
        let me       = this,
            nodeName = 'node' + Neo.capitalize(name);

        NeoArray.remove(me.owner.getVdomRoot().cn, me[nodeName]);
        me[nodeName] = null;

        return true;
    }
}

Neo.applyClassConfig(Resizable);

export {Resizable as default};
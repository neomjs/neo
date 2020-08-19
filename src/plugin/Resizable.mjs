import Base     from './Base.mjs';
import NeoArray from '../util/Array.mjs';

/**
 * @class Neo.plugin.Resizable
 * @extends Neo.plugin.Base
 */
class Resizable extends Base {
    static getStaticConfig() {return {
        /**
         * remove - chars
         * @member {RegExp} nameRegEx=/-([a-z])/g
         * @protected
         * @static
         */
        nameRegEx: /-([a-z])/g,
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
            nodeName = 'node' + Neo.capitalize(name.replace(Resizable.nameRegEx, (str, letter) => letter.toUpperCase()));

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

        if      (bottom && left)  {if (!me.nodeBottomLeft)  {hasChange = me.addNode('bottom-left');}}
        else if (bottom && right) {if (!me.nodeBottomRight) {hasChange = me.addNode('bottom-right');}}
        else if (top    && left)  {if (!me.nodeTopLeft)     {hasChange = me.addNode('top-left');}}
        else if (top    && right) {if (!me.nodeTopRight)    {hasChange = me.addNode('top-right');}}
        else if (bottom)          {if (!me.nodeBottom)      {hasChange = me.addNode('bottom');}}
        else if (left)            {if (!me.nodeLeft)        {hasChange = me.addNode('left');}}
        else if (right)           {if (!me.nodeRight)       {hasChange = me.addNode('right');}}
        else if (top)             {if (!me.nodeTop)         {hasChange = me.addNode('top');}}

        if ((!bottom || bottom && left  || bottom && right) && me.nodeBottom) {hasChange = me.removeNode('bottom');}
        if ((!left   || bottom && left  || top    && left)  && me.nodeLeft)   {hasChange = me.removeNode('left');}
        if ((!right  || bottom && right || top    && right) && me.nodeRight)  {hasChange = me.removeNode('right');}
        if ((!top    || top    && left  || top    && right) && me.nodeTop)    {hasChange = me.removeNode('top');}

        if ((!bottom || !left)  && me.nodeBottomLeft)  {hasChange = me.removeNode('bottom-left');}
        if ((!bottom || !right) && me.nodeBottomRight) {hasChange = me.removeNode('bottom-right');}

        if ((!top || !left)  && me.nodeTopLeft)  {hasChange = me.removeNode('top-left');}
        if ((!top || !right) && me.nodeTopRight) {hasChange = me.removeNode('top-right');}

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
            nodeName = 'node' + Neo.capitalize(name.replace(Resizable.nameRegEx, (str, letter) => letter.toUpperCase()));

        NeoArray.remove(me.owner.getVdomRoot().cn, me[nodeName]);
        me[nodeName] = null;

        return true;
    }
}

Neo.applyClassConfig(Resizable);

export {Resizable as default};
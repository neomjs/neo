import Base     from './Base.mjs';
import DragZone from '../draggable/DragZone.mjs';
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
         * Internal position names
         * @member {String[]} validDirections=['bottom','bottom-left','bottom-right','left','right','top','top-left','top-right']
         * @static
         */
        positions: ['bottom', 'bottom-left', 'bottom-right', 'left', 'right', 'top', 'top-left', 'top-right'],
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
         * @member {String} currentNodeName=null
         * @protected
         */
        currentNodeName: null,
        /**
         * Must be set by each owner
         * @member {String} delegationCls=null
         */
        delegationCls: null,
        /**
         * Directions into which you want to drag => resize
         * @member {String[]} directions_=['b','bl','br','l','r','t','tl','tr']
         */
        directions_: ['b', 'bl', 'br', 'l', 'r', 't', 'tl', 'tr'],
        /**
         * @member {Neo.draggable.DragZone|null} dragZone=null
         */
        dragZone: null,
        /**
         * @member {Number} gap=10
         * @protected
         */
        gap: 10,
        /**
         * @member {Boolean} isDragging=false
         */
        isDragging: false,
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

        domListeners.push(
            {'drag:end'  : me.onDragEnd,    scope: me, delegate: '.neo-resizable'},
            {'drag:move' : me.onDragMove,   scope: me, delegate: '.neo-resizable'},
            {'drag:start': me.onDragStart,  scope: me, delegate: '.neo-resizable'},
            {mousemove   : me.onMouseMove,  scope: me, local   : true},
            {mouseleave  : me.onMouseLeave, scope: me}
        );

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

        me.currentNodeName = name;
        me[nodeName] = {cls: ['neo-resizable', `neo-resizable-${name}`]};
        me.owner.getVdomRoot().cn.push(me[nodeName]);

        return true;
    }

    /**
     *
     * @param {Object} data
     */
    onDragEnd(data) {
        console.log('onDragEnd', data);
        let me    = this,
            owner = me.owner;

        me.isDragging = false;
    }

    /**
     *
     * @param {Object} data
     */
    onDragMove(data) {
        if (this.dragZone.dragProxy) {
            let me    = this,
                style = me.dragZone.dragProxy.wrapperStyle;

            if (me.currentNodeName.includes('left')) {
                style.left = `${data.clientX}px`;
            }

            me.dragZone.dragProxy.wrapperStyle = style;
        }
    }

    /**
     *
     * @param {Object} data
     */
    onDragStart(data) {
        let me    = this,
            owner = me.owner;

        me.isDragging = true;

        if (!me.dragZone) {
            me.dragZone = Neo.create({
                module             : DragZone,
                appName            : owner.appName,
                boundaryContainerId: owner.boundaryContainerId,
                dragElement        : owner.vdom,
                moveInMainThread   : false
            });
        } else {
            me.dragZone.boundaryContainerId = owner.boundaryContainerId;
        }

        me.dragZone.dragStart(data);
    }

    /**
     *
     * @param {Object} data
     */
    onMouseMove(data) {
        let me   = this,
            dir  = me.directions,
            i    = 0,
            gap  = me.gap,
            h    = false,
            len  = data.path.length,
            vdom = me.owner.vdom,
            bottom, left, right, target, top;

        if (!me.isDragging && !me.owner.isDragging) {
            for (; i < len; i++) {
                if (data.path[i].cls.includes(me.delegationCls)) {
                    target = data.path[i];
                    break;
                }
            }

            bottom = data.clientY >= target.rect.y - gap + target.rect.height;
            left   = data.clientX <= target.rect.x + gap;
            right  = data.clientX >= target.rect.x - gap + target.rect.width;
            top    = data.clientY <= target.rect.y + gap;

            if      (dir.includes('bl') && bottom && left)  {if (!me.nodeBottomLeft)  {h = me.addNode('bottom-left');}}
            else if (dir.includes('br') && bottom && right) {if (!me.nodeBottomRight) {h = me.addNode('bottom-right');}}
            else if (dir.includes('tl') && top    && left)  {if (!me.nodeTopLeft)     {h = me.addNode('top-left');}}
            else if (dir.includes('tr') && top    && right) {if (!me.nodeTopRight)    {h = me.addNode('top-right');}}
            else if (dir.includes('b')  && bottom)          {if (!me.nodeBottom)      {h = me.addNode('bottom');}}
            else if (dir.includes('l')  && left)            {if (!me.nodeLeft)        {h = me.addNode('left');}}
            else if (dir.includes('r')  && right)           {if (!me.nodeRight)       {h = me.addNode('right');}}
            else if (dir.includes('t')  && top)             {if (!me.nodeTop)         {h = me.addNode('top');}}

            if (me.nodeBottom && (!bottom || bottom && left  || bottom && right)) {h = me.removeNode('bottom');}
            if (me.nodeLeft   && (!left   || bottom && left  || top    && left))  {h = me.removeNode('left');}
            if (me.nodeRight  && (!right  || bottom && right || top    && right)) {h = me.removeNode('right');}
            if (me.nodeTop    && (!top    || top    && left  || top    && right)) {h = me.removeNode('top');}

            if (me.nodeBottomLeft  && (!bottom || !left))  {h = me.removeNode('bottom-left');}
            if (me.nodeBottomRight && (!bottom || !right)) {h = me.removeNode('bottom-right');}
            if (me.nodeTopLeft     && (!top    || !left))  {h = me.removeNode('top-left');}
            if (me.nodeTopRight    && (!top    || !right)) {h = me.removeNode('top-right');}

            if (h) {
                me.owner.vdom = vdom;
            }
        }
    }

    /**
     *
     * @param {Object} data
     */
    onMouseLeave(data) {
        // limit the event to delegation targets
        if (data.path[0].cls.includes(this.delegationCls)) {
            this.removeAllNodes();
        }
    }

    /**
     * There should be max 1 node (resize handle) at any given time.
     * see: /issues/1139
     */
    removeAllNodes() {
        let me   = this,
            vdom = me.owner.vdom;

        if (me.currentNodeName) {
            me.removeNode(me.currentNodeName);
            me.owner.vdom = vdom;
        }
    }

    /**
     *
     * @param {String} name
     * @returns {Boolean} true in case the node existed
     */
    removeNode(name) {
        let me       = this,
            nodeName = 'node' + Neo.capitalize(name.replace(Resizable.nameRegEx, (str, letter) => letter.toUpperCase()));

        if (me[nodeName]) {
            me.currentNodeName = null;
            NeoArray.remove(me.owner.getVdomRoot().cn, me[nodeName]);
            me[nodeName] = null;

            return true;
        }

        return false;
    }
}

Neo.applyClassConfig(Resizable);

export {Resizable as default};
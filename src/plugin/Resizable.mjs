import Base     from './Base.mjs';
import DragZone from '../draggable/DragZone.mjs';
import NeoArray from '../util/Array.mjs';

/**
 * @class Neo.plugin.Resizable
 * @extends Neo.plugin.Base
 */
class Resizable extends Base {
    /**
     * Resize cursor styles use north, south based names, so we need a mapping.
     * The order has to match the static positions array.
     * @member {String[]} cursorPositions=['s','sw','se','w','e','n','nw','ne']
     * @protected
     * @static
     */
    static cursorPositions = ['s', 'sw', 'se', 'w', 'e', 'n', 'nw', 'ne']
    /**
     * remove - chars
     * @member {RegExp} nameRegEx=/-([a-z])/g
     * @protected
     * @static
     */
    static nameRegEx = /-([a-z])/g
    /**
     * Internal position names
     * @member {String[]} validDirections=['bottom','bottom-left','bottom-right','left','right','top','top-left','top-right']
     * @static
     */
    static positions = ['bottom', 'bottom-left', 'bottom-right', 'left', 'right', 'top', 'top-left', 'top-right']
    /**
     * Directions into which you want to drag => resize
     * @member {String[]} validDirections=['b','bl','br','l','r','t','tl','tr']
     * @static
     */
    static validDirections = ['b', 'bl', 'br', 'l', 'r', 't', 'tl', 'tr']

    static config = {
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
         * The name of the App this instance belongs to
         * @member {String|null} appName_=null
         */
        appName_: null,
        /**
         * @member {String|null} boundaryContainerId='document.body'
         */
        boundaryContainerId: 'document.body',
        /**
         * The DOMRect of the boundaryContainer if set (measured on drag:start)
         * @member {Object} boundaryContainerRect=null
         * @protected
         */
        boundaryContainerRect: null,
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
         * @member {Object} dragZoneConfig=null
         */
        dragZoneConfig: null,
        /**
         * @member {Number} gap=10
         * @protected
         */
        gap: 10,
        /**
         * The DOMRect of the element to drag (measured on drag:start)
         * @member {Object} initialRect=null
         * @protected
         */
        initialRect: null,
        /**
         * @member {Boolean} isDragging=false
         */
        isDragging: false,
        /**
         * maximum height when resizing in px
         * @member {Number|null} maxHeight=null
         */
        maxHeight: null,
        /**
         * maximum width when resizing in px
         * @member {Number|null} maxWidth=null
         */
        maxWidth: null,
        /**
         * minimum height when resizing in px
         * @member {Number} minHeight=200
         */
        minHeight: 200,
        /**
         * minimum width when resizing in px
         * @member {Number} minWidth=200
         */
        minWidth: 200,
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
        nodeTopRight: null,
        /**
         * vdom node which matches the delegationCls to add resize handles
         * @member {Object} targetNode=null
         * @protected
         */
        targetNode: null,
        /**
         * @member {Number|null} windowId_=null
         */
        windowId_: null
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.owner.addDomListeners([
            {'drag:end'  : me.onDragEnd,    scope: me, delegate: '.neo-resizable'},
            {'drag:move' : me.onDragMove,   scope: me, delegate: '.neo-resizable'},
            {'drag:start': me.onDragStart,  scope: me, delegate: '.neo-resizable'},
            {mousedown   : me.onMouseDown,  scope: me, delegate: '.neo-resizable'},
            {mousemove   : me.onMouseMove,  scope: me, local   : true},
            {mouseleave  : me.onMouseLeave, scope: me, delegate: `.${me.delegationCls}`},
            {mouseup     : me.onMouseUp,    scope: me, delegate: '.neo-resizable'}
        ])
    }

    /**
     *
     */
    addBodyCursorCls() {
        Neo.applyDeltas(this.appName, {
            id : 'document.body',
            cls: {
                add   : [`neo-cursor-${Resizable.cursorPositions[Resizable.positions.indexOf(this.currentNodeName)]}-resize`],
                remove: []
            }
        })
    }

    /**
     * @param {String} name
     * @returns {Boolean} true
     */
    addNode(name) {
        let me           = this,
            nodeName     = 'node' + Neo.capitalize(name.replace(Resizable.nameRegEx, (str, letter) => letter.toUpperCase())),
            {targetNode} = me;

        if (targetNode) {
            me.currentNodeName = name;
            me[nodeName] = {cls: ['neo-resizable', `neo-resizable-${name}`]};

            targetNode.cn = targetNode.cn || [];
            targetNode.cn.push(me[nodeName]);

            return true
        }

        return false
    }

    /**
     * Triggered after the appName config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetAppName(value, oldValue) {
        if (this.dragZone) {
            this.dragZone.appName = value
        }
    }

    /**
     * Triggered after the windowId config got changed
     * @param {Number} value
     * @param {Number|null} oldValue
     * @protected
     */
    afterSetWindowId(value, oldValue) {
        let me = this;

        value && Neo.currentWorker.insertThemeFiles(value, me.__proto__);

        if (me.dragZone) {
            me.dragZone.windowId = value
        }
    }

    /**
     * Triggered before the directions config gets changed.
     * @param {String[]} value
     * @param {String[]} oldValue
     * @returns {String[]}
     * @protected
     */
    beforeSetDirections(value, oldValue) {
        if (Array.isArray(value)) {
            let i   = 0,
                len = value.length;

            for (; i < len; i++) {
                if (this.beforeSetEnumValue(value[i], oldValue, 'directions', 'validDirections') !== value[i]) {
                    return oldValue
                }
            }
        }

        return value
    }

    /**
     * @param {Object} data
     */
    onDragEnd(data) {
        let me      = this,
            {owner} = me,
            style   = owner.wrapperStyle; // todo: delegation target

        Object.assign(me, {
            boundaryContainerRect: null,
            initialRect          : null,
            isDragging           : false
        });

        Object.assign(style, {
            opacity  : 1,
            transform: 'none',
            ...me.dragZone.dragProxy.wrapperStyle
        });

        owner.wrapperStyle = style;

        me.removeBodyCursorCls();

        me.dragZone.dragEnd();
        me.removeAllNodes();

        owner.focus(owner.id, true)
    }

    /**
     * @param {Object} data
     */
    onDragMove(data) {
        let me     = this,
            node   = me.currentNodeName,
            ctRect = me.boundaryContainerRect,
            {maxHeight, maxWidth, minHeight, minWidth} = me,
            rect   = me.initialRect,
            dist, size, style;

        if (!node) {
            me.onDragEnd({})
        } else if (me.dragZone.dragProxy) {
            style = me.dragZone.dragProxy.wrapperStyle;

            if (node.includes('bottom')) {
                size = Math.max(minHeight, data.clientY - rect.top);

                if (maxHeight) {
                    size = Math.min(size, maxHeight);
                }

                if (ctRect) {
                    size = Math.min(size, ctRect.bottom - rect.top);
                }

                style.height = `${size}px`
            } else if (node.includes('top')) {
                dist = Math.min(rect.bottom - minHeight, data.clientY);
                size = Math.max(minHeight, rect.height + rect.top - data.clientY);

                if (maxHeight) {
                    dist = Math.max(dist, rect.bottom - maxHeight);
                    size = Math.min(size, maxHeight)
                }

                if (ctRect) {
                    dist = Math.max(dist, ctRect.top);
                    size = Math.min(size, rect.bottom - ctRect.top)
                }

                style.height = `${size}px`;
                style.top    = `${dist}px`
            }

            if (node.includes('left')) {
                dist = Math.min(rect.right - minWidth, data.clientX);
                size = Math.max(minWidth, rect.width + rect.left - data.clientX);

                if (maxWidth) {
                    dist = Math.max(dist, rect.right - maxWidth);
                    size = Math.min(size, maxWidth)
                }

                if (ctRect) {
                    dist = Math.max(dist, ctRect.left);
                    size = Math.min(size, rect.right - ctRect.left)
                }

                style.left  = `${dist}px`;
                style.width = `${size}px`
            } else if (node.includes('right')) {
                size = Math.max(minWidth, rect.width - rect.right + data.clientX);

                if (maxWidth) {
                    size = Math.min(size, maxWidth)
                }

                if (ctRect) {
                    size = Math.min(size, ctRect.right - rect.left)
                }

                style.width = `${size}px`
            }

            me.dragZone.dragProxy.wrapperStyle = style
        }
    }

    /**
     * @param {Object} data
     */
    onDragStart(data) {
        let me                         = this,
            containerId                = me.boundaryContainerId,
            i                          = 0,
            len                        = data.path.length,
            {appName, owner, windowId} = me,
            style                      = owner.wrapperStyle, // todo: delegation target
            target, vdom, vdomStyle;

        me.isDragging = true;

        style.opacity = 0.3;
        owner.wrapperStyle = style;

        for (; i < len; i++) {
            target = data.path[i];

            if (target.cls.includes(me.delegationCls)) {
                me.initialRect = target.rect
            }

            if (containerId) {
                if (containerId === 'document.body' && target.tagName === 'body' || containerId === target.id) {
                    me.boundaryContainerRect = target.rect;
                    break // assuming that the dragEl is not outside of the container
                }
            }
        }

        if (!me.boundaryContainerRect) {
            owner.getDomRect(me.boundaryContainerRect).then(rect => {
                me.boundaryContainerRect = rect
            })
        }

        me.addBodyCursorCls();

        if (!me.dragZone) {
            vdom      = Neo.clone(owner.vdom, true);
            vdomStyle = vdom.style;

            delete vdom.height;
            delete vdom.width;

            delete vdomStyle.height;
            delete vdomStyle.left;
            delete vdomStyle.top;
            delete vdomStyle.width;

            vdomStyle.opacity = 0.7;

            me.dragZone = Neo.create({
                module             : DragZone,
                appName,
                boundaryContainerId: owner.boundaryContainerId,
                dragElement        : vdom,
                moveInMainThread   : false,
                owner,
                windowId,
                ...me.dragZoneConfig
            })
        } else {
            me.dragZone.boundaryContainerId = owner.boundaryContainerId
        }

        me.dragZone.dragStart(data)
    }

    /**
     * See: https://github.com/neomjs/neo/issues/2431
     * @param {Object} data
     */
    onMouseDown(data) {
        this.isDragging = true
    }

    /**
     * @param {Object} data
     */
    onMouseMove(data) {
        let me  = this,
            dir = me.directions,
            i   = 0,
            {gap, owner, targetNode} = me,
            h   = false,
            len = data.path.length,
            bottom, left, right, target, top;

        if (!me.isDragging && !owner.isDragging) {
            for (; i < len; i++) {
                if (data.path[i].cls.includes(me.delegationCls)) {
                    target = data.path[i];
                    break
                }
            }

            if (target) {
                if (target.id !== targetNode?.id) {
                    if (targetNode) {
                        me.removeAllNodes()
                    }

                    me.targetNode = owner.getVdomChild(target.id)
                }

                bottom = data.clientY >= target.rect.y - gap + target.rect.height;
                left   = data.clientX <= target.rect.x + gap;
                right  = data.clientX >= target.rect.x - gap + target.rect.width;
                top    = data.clientY <= target.rect.y + gap;

                if (me.nodeBottom && (!bottom || bottom && left  || bottom && right)) {h = me.removeNode('bottom')}
                if (me.nodeLeft   && (!left   || bottom && left  || top    && left))  {h = me.removeNode('left')}
                if (me.nodeRight  && (!right  || bottom && right || top    && right)) {h = me.removeNode('right')}
                if (me.nodeTop    && (!top    || top    && left  || top    && right)) {h = me.removeNode('top')}

                if (me.nodeBottomLeft  && (!bottom || !left))  {h = me.removeNode('bottom-left')}
                if (me.nodeBottomRight && (!bottom || !right)) {h = me.removeNode('bottom-right')}
                if (me.nodeTopLeft     && (!top    || !left))  {h = me.removeNode('top-left')}
                if (me.nodeTopRight    && (!top    || !right)) {h = me.removeNode('top-right')}

                if      (dir.includes('bl') && bottom && left)  {if (!me.nodeBottomLeft)  {h = me.addNode('bottom-left')}}
                else if (dir.includes('br') && bottom && right) {if (!me.nodeBottomRight) {h = me.addNode('bottom-right')}}
                else if (dir.includes('tl') && top    && left)  {if (!me.nodeTopLeft)     {h = me.addNode('top-left')}}
                else if (dir.includes('tr') && top    && right) {if (!me.nodeTopRight)    {h = me.addNode('top-right')}}
                else if (dir.includes('b')  && bottom)          {if (!me.nodeBottom)      {h = me.addNode('bottom')}}
                else if (dir.includes('l')  && left)            {if (!me.nodeLeft)        {h = me.addNode('left')}}
                else if (dir.includes('r')  && right)           {if (!me.nodeRight)       {h = me.addNode('right')}}
                else if (dir.includes('t')  && top)             {if (!me.nodeTop)         {h = me.addNode('top')}}

                h && owner.update()
            }
        }
    }

    /**
     * @param {Object} data
     */
    onMouseLeave(data) {
        let me = this;

        if (!me.isDragging && !me.owner.isDragging) {
            // limit the event to delegation targets
            if (data.path[0].cls.includes(me.delegationCls)) {
                me.removeAllNodes()
            }
        }
    }

    /**
     * See: https://github.com/neomjs/neo/issues/2431
     * @param {Object} data
     */
    onMouseUp(data) {
        this.isDragging = false
    }

    /**
     * There should be max 1 node (resize handle) at any given time.
     * see: /issues/1139
     */
    removeAllNodes() {
        let me = this;

        if (me.currentNodeName) {
            me.removeNode(me.currentNodeName);
            me.owner.update();

            me.currentNodeName = null;
            me.targetNode      = null
        }
    }

    /**
     *
     */
    removeBodyCursorCls() {
        Neo.applyDeltas(this.appName, {
            id : 'document.body',
            cls: {
                add   : [],
                remove: [`neo-cursor-${Resizable.cursorPositions[Resizable.positions.indexOf(this.currentNodeName)]}-resize`]
            }
        })
    }

    /**
     * @param {String} name
     * @returns {Boolean} true in case the node existed
     */
    removeNode(name) {
        let me       = this,
            nodeName = 'node' + Neo.capitalize(name.replace(Resizable.nameRegEx, (str, letter) => letter.toUpperCase()));

        if (me[nodeName]) {
            me.currentNodeName = null;
            NeoArray.remove(me.targetNode.cn, me[nodeName]);
            me[nodeName] = null;

            return true
        }

        return false
    }
}

export default Neo.setupClass(Resizable);

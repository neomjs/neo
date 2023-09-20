import Component from './Base.mjs';
import DragZone  from '../draggable/DragZone.mjs';
import NeoArray  from '../util/Array.mjs';

/**
 * Splitters can get put into containers to make siblings resizable via drag & drop
 * @class Neo.component.Splitter
 * @extends Neo.component.Base
 */
class Splitter extends Component {
    /**
     * Valid values for direction
     * @member {String[]} directions=['horizontal','vertical']
     * @protected
     * @static
     */
    static directions = ['horizontal', 'vertical']
    /**
     * Valid values for resizeTarget
     * @member {String[]} resizeTargets=['next','previous']
     * @protected
     * @static
     */
    static resizeTargets = ['next', 'previous']

    static config = {
        /**
         * @member {String} className='Neo.component.Splitter'
         * @protected
         */
        className: 'Neo.component.Splitter',
        /**
         * @member {String} ntype='splitter'
         * @protected
         */
        ntype: 'splitter',
        /**
         * @member {String[]} baseCls=['neo-splitter','neo-draggable']
         */
        baseCls: ['neo-splitter', 'neo-draggable'],
        /**
         * Either 'horizontal' or 'vertical'
         * @member {String} direction_='vertical'
         */
        direction_: 'vertical',
        /**
         * @member {Neo.draggable.DragZone|null} dragZone=null
         * @protected
         */
        dragZone: null,
        /**
         * @member {Object|null} dragZoneConfig=null
         */
        dragZoneConfig: null,
        /**
         * Choose which sibling to resize
         * Valid values: 'next' or 'previous'
         * @member {String} resizeTarget_='next'
         */
        resizeTarget_: 'next',
        /**
         * Either height or with, depending on the direction.
         * Defaults to px
         * @member {Number} size_=10
         */
        size_: 10
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.addDomListeners([
            {'drag:end'  : me.onDragEnd,   scope: me},
            {'drag:start': me.onDragStart, scope: me}
        ])
    }

    /**
     * Triggered after the direction config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetDirection(value, oldValue) {
        let me     = this,
            cls    = me.cls,
            height = value === 'vertical' ? null : me.size,
            width  = value !== 'vertical' ? null : me.size;

        NeoArray.add(cls, `neo-${value}`);

        if (oldValue) {
            NeoArray.remove(cls, `neo-${oldValue}`)
        }

        me.set({
            cls,
            height,
            minHeight: height,
            minWidth : width,
            width
        })
    }

    /**
     * Triggered after the size config got changed
     * @param {Boolean|null} value
     * @param {Boolean|null} oldValue
     * @protected
     */
    afterSetSize(value, oldValue) {
        this[this.direction === 'vertical' ? 'width' : 'height'] = value
    }

    /**
     * Triggered before the direction config gets changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     * @returns {String}
     */
    beforeSetDirection(value, oldValue) {
        return this.beforeSetEnumValue(value, oldValue, 'direction')
    }

    /**
     * Triggered before the resizeTarget config gets changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     * @returns {String}
     */
    beforeSetResizeTarget(value, oldValue) {
        return this.beforeSetEnumValue(value, oldValue, 'resizeTarget')
    }

    /**
     * @param {Object} data
     */
    onDragEnd(data) {
        let me         = this,
            style      = me.style || {},
            parent     = me.parent,
            parentId   = me.parentId,
            resizeNext = me.resizeTarget === 'next',
            size       = me.size,
            index, newSize, sibling;

        parent.disabled = false;

        me.dragZone.dragEnd(data);

        style.opacity = 1;

        me.style = style;

        me.getDomRect(parentId).then(parentRect => {
            index   = parent.indexOf(me);
            sibling = parent.items[resizeNext ? index + 1 :index - 1];
            style   = sibling.style || {};

            style.flex = 'none';

            if (me.direction === 'vertical') {
                newSize = data.clientX - data.offsetX - size - parentRect.left;

                if (resizeNext) {
                    newSize = parentRect.width - newSize -  2 * size
                } else {
                    newSize += size
                }

                newSize = Math.min(Math.max(newSize, 0), parentRect.width - size);

                style.width = `${newSize}px`
            } else {
                newSize = data.clientY - data.offsetY - size - parentRect.top;

                if (resizeNext) {
                    newSize = parentRect.height - newSize -  2 * size
                } else {
                    newSize += size
                }

                newSize = Math.min(Math.max(newSize, 0), parentRect.height - size);

                style.height = `${newSize}px`;
            }

            sibling.style = style
        })
    }

    /**
     * @param data
     */
    onDragStart(data) {
        let me       = this,
            style    = me.style || {},
            vertical = me.direction === 'vertical';

        me.parent.disabled = true;

        if (!me.dragZone) {
            me.dragZone = Neo.create({
                module             : DragZone,
                appName            : me.appName,
                bodyCursorStyle    : vertical ? 'ew-resize !important' : 'ns-resize !important',
                boundaryContainerId: me.parentId,
                dragElement        : me.vdom,
                moveHorizontal     : vertical,
                moveVertical       : !vertical,
                owner              : me,
                useProxyWrapper    : false,
                ...me.dragZoneConfig
            })
        } else {
            me.dragZone.set({
                bodyCursorStyle: vertical ? 'ew-resize !important' : 'ns-resize !important',
                moveHorizontal : vertical,
                moveVertical   : !vertical
            })
        }

        me.dragZone.dragStart(data);

        style.opacity = 0.5;

        me.style = style
    }
}

Neo.applyClassConfig(Splitter);

export default Splitter;

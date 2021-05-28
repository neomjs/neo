import Component from './Base.mjs';
import DragZone  from '../draggable/DragZone.mjs';
import NeoArray  from '../util/Array.mjs';

/**
 * Splitters can get placed between containers to make them resizable via drag & drop
 * @class Neo.component.Splitter
 * @extends Neo.component.Base
 */
class Splitter extends Component {
    static getStaticConfig() {return {
        /**
         * Valid values for direction
         * @member {String[]} directions=['horizontal','vertical']
         * @protected
         * @static
         */
        directions: ['horizontal', 'vertical']
    }}

    static getConfig() {return {
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
         * @member {String[]} cls=['neo-splitter','neo-draggable']
         */
        cls: ['neo-splitter', 'neo-draggable'],
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
         * Either height or with, depending on the direction.
         * Defaults to px
         * @member {Number} size_=10
         */
        size_: 10
    }}

    /**
     *
     * @param {Object} config
     */
    constructor(config) {
        super(config);

        let me           = this,
            domListeners = me.domListeners;

        domListeners.push(
            {'drag:end'  : me.onDragEnd,   scope: me},
            {'drag:start': me.onDragStart, scope: me}
        );

        me.domListeners = domListeners;
    }

    /**
     * Triggered after the direction config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetDirection(value, oldValue) {
        let me  = this,
            cls = me.cls;

        NeoArray.add(cls, `neo-${value}`);

        if (oldValue) {
            NeoArray.remove(cls, `neo-${oldValue}`);
        }
console.log(value, value === 'vertical' ? null : me.size, value !== 'vertical' ? null : me.size);
        me.set({
            cls   : cls,
            height: value === 'vertical' ? null : me.size,
            width : value !== 'vertical' ? null : me.size
        });
    }

    /**
     * Triggered after the size config got changed
     * @param {Boolean|null} value
     * @param {Boolean|null} oldValue
     * @protected
     */
    afterSetSize(value, oldValue) {
        this[this.direction === 'vertical' ? 'width' : 'height'] = value;
    }

    /**
     * Triggered before the direction config gets changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     * @returns {String}
     */
    beforeSetDirection(value, oldValue) {
        return this.beforeSetEnumValue(value, oldValue, 'direction');
    }

    /**
     *
     * @param data
     */
    onDragEnd(data) {
        let me      = this,
            style   = me.style || {},
            index, sibling, parent, size;

        me.dragZone.dragEnd(data);

        style.opacity = 1;

        me.style = style;

        Neo.main.DomAccess.getBoundingClientRect({
            id: me.parentId
        }).then(rect => {
            parent  = Neo.getComponent(me.parentId);
            index   = parent.indexOf(me);
            sibling = parent.items[index - 1];
            style   = sibling.style;

            style.flex = 'none';

            if (me.direction === 'vertical') {
                size = data.clientX - data.offsetX - 2 * me.size;
                size = Math.min(Math.max(size, 0), rect.width - me.size);

                style.width = `${size}px`;
            } else {
                size = data.clientY - data.offsetY - 2 * me.size;
                size = Math.min(Math.max(size, 0), rect.height - me.size);

                style.height = `${size}px`;
            }

            sibling.style = style;
        });
    }

    /**
     *
     * @param data
     */
    onDragStart(data) {
        let me       = this,
            style    = me.style || {},
            vertical = me.direction === 'vertical';

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
                ...me.dragZoneConfig || {}
            });
        } else {
            me.dragZone.set({
                bodyCursorStyle: vertical ? 'ew-resize !important' : 'ns-resize !important',
                moveHorizontal : vertical,
                moveVertical   : !vertical
            });
        }

        me.dragZone.dragStart(data);

        style.opacity = 0.5;

        me.style = style;
    }
}

Neo.applyClassConfig(Splitter);

export {Splitter as default};

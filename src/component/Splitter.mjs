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
         * @member {String[]} cls=['neo-splitter']
         */
        cls: ['neo-splitter'],
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
         * @member {Number|String} size_=10
         */
        size_: 10
    }}

    /**
     *
     * @param {Object} config
     */
    constructor(config) {
        super(config);

        let me = this;

        me.dragZone = Neo.create({
            module        : DragZone,
            appName       : me.appName,
            moveHorizontal: me.direction === 'horizontal',
            moveVertical  : me.direction === 'vertical',
            ...me.dragZoneConfig || {}
        });
    }

    /**
     * Triggered after the direction config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetDirection(value, oldValue) {
        let cls = this.cls;

        NeoArray.add(cls, `neo-${value}`);

        if (oldValue) {
            NeoArray.remove(cls, `neo-${oldValue}`);
        }

        this.cls = cls;
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
}

Neo.applyClassConfig(Splitter);

export {Splitter as default};

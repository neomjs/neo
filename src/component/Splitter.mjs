import Component from './Base.mjs';

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
         * Either height or with, depending on the direction.
         * Defaults to px
         * @member {Number|String} size_=10
         */
        size_: 10
    }}

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

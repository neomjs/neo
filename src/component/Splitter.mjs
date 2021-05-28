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
        direction_: 'vertical'
    }}

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

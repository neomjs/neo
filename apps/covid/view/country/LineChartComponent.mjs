import {default as Component} from '../../../../src/component/Base.mjs';

/**
 * @class Covid.view.country.LineChartComponent
 * @extends Neo.component.Base
 */
class LineChartComponent extends Component {
    static getConfig() {return {
        /**
         * @member {String} className='Covid.view.country.LineChartComponent'
         * @private
         */
        className: 'Covid.view.country.LineChartComponent',
    }}

    /**
     *
     * @param {Object} config
     */
    constructor(config) {
        super(config);
    }
}

Neo.applyClassConfig(LineChartComponent);

export {LineChartComponent as default};
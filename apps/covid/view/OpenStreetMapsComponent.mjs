import {default as AmChartComponent} from '../../../src/component/wrapper/AmChart.mjs';

/**
 * @class Covid.view.OpenStreetMapsComponent
 * @extends Neo.component.wrapper.AmChart
 */
class OpenStreetMapsComponent extends AmChartComponent {
    static getConfig() {return {
        /**
         * @member {String} className='Covid.view.OpenStreetMapsComponent'
         * @private
         */
        className: 'Covid.view.OpenStreetMapsComponent',
        /**
         * @member {String} ntype='covid-world-map'
         * @private
         */
        ntype: 'covid-openstreet-map'
    }}
}

Neo.applyClassConfig(OpenStreetMapsComponent);

export {OpenStreetMapsComponent as default};
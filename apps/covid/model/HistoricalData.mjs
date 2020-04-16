import Model  from '../../../src/data/Model.mjs';

/**
 * @class Covid.model.HistoricalData
 * @extends Neo.data.Model
 */
class HistoricalData extends Model {
    static getConfig() {return {
        className: 'Covid.model.HistoricalData',

        fields: [{
            name: 'active', // does not exist in the api => cases - deaths - recovered
            type: 'int'
        }, {
            name: 'cases',
            type: 'int'
        }, {
            name: 'date',
            type: 'string' // date => 1/22/20
        }, {
            name: 'dailyCases',
            type: 'int'
        }, {
            name: 'deaths',
            type: 'int'
        }, {
            name: 'recovered',
            type: 'int'
        }]
    }}
}

Neo.applyClassConfig(HistoricalData);

export {HistoricalData as default};
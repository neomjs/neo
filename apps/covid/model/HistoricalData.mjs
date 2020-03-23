import Model  from '../../../src/data/Model.mjs';

/**
 * @class Covid.model.HistoricalData
 * @extends Neo.data.Model
 */
class HistoricalData extends Model {
    static getConfig() {return {
        className: 'Covid.model.HistoricalData',

        fields: [{
            name: 'cases',
            type: 'int'
        }, {
            name: 'date',
            type: 'string' // date => 1/22/20
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
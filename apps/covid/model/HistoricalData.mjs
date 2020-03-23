import Model  from '../../../src/data/Model.mjs';

/**
 * @class Covid.model.HistoricalData
 * @extends Neo.data.Model
 */
class HistoricalData extends Model {
    static getConfig() {return {
        className: 'Covid.model.Country',

        fields: [{
            name: 'cases',
            type: 'int'
        }, {
            name: 'date',
            type: 'date'
        }, {
            name: 'critical',
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
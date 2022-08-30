import BaseModel from '../../../src/data/Model.mjs';

/**
 * @class Neo.examples.table.covid.Model
 * @extends Neo.data.Model
 */
class Model extends BaseModel {
    static getConfig() {return {
        className: 'Neo.examples.table.covid.Model',

        fields: [{
            name: 'country',
            type: 'string'
        }, {
            name: 'firstname',
            type: 'string'
        }, {
            name: 'githubId',
            type: 'string'
        }, {
            name: 'lastname',
            type: 'string'
        }]
    }}
}

Neo.applyClassConfig(Model);

export default Model;

import Model from '../../../src/data/Model.mjs';

/**
 * @class Neo.examples.data.pipeline.BeatlesModel
 * @extends Neo.data.Model
 */
class BeatlesModel extends Model {
    static config = {
        className: 'Neo.examples.data.pipeline.BeatlesModel',
        fields   : [{
            name: 'first',
            type: 'String'
        }, {
            name: 'last',
            type: 'String'
        }, {
            name: 'dob',
            type: 'Date'
        }]
    }
}

export default Neo.setupClass(BeatlesModel);

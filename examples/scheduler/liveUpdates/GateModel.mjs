import Model from '../../../src/data/Model.mjs';

/**
 * @summary Airport gate resource record (`id`, `name`, `pier`).
 * @class Neo.examples.scheduler.liveUpdates.GateModel
 * @extends Neo.data.Model
 */
class GateModel extends Model {
    static config = {
        className: 'Neo.examples.scheduler.liveUpdates.GateModel',
        fields   : [
            {name: 'id',   type: 'String'},
            {name: 'name', type: 'String'},
            {name: 'pier', type: 'String', defaultValue: 'A'}
        ]
    }
}

export default Neo.setupClass(GateModel);

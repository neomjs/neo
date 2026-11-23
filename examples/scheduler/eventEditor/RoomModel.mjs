import Model from '../../../src/data/Model.mjs';

/**
 * @summary A treatment room of the practice.
 * @class Neo.examples.scheduler.eventEditor.RoomModel
 * @extends Neo.data.Model
 */
class RoomModel extends Model {
    static config = {
        className: 'Neo.examples.scheduler.eventEditor.RoomModel',
        fields   : [
            {name: 'id',   type: 'String'},
            {name: 'name', type: 'String'}
        ]
    }
}

export default Neo.setupClass(RoomModel);

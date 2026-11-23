import Model from '../../../src/data/Model.mjs';

/**
 * @summary Record schema for the 42-clinician weekly hospital shift roster grid example.
 * @class Neo.examples.grid.container.MainModel
 * @extends Neo.data.Model
 */
class MainModel extends Model {
    static config = {
        className: 'Neo.examples.grid.container.MainModel',

        fields: [
            {name: 'id',    type: 'String'},
            {name: 'staff', type: 'String'},
            {name: 'unit',  type: 'String'},
            {name: 'role',  type: 'String'},
            {name: 'mon',   type: 'String'},
            {name: 'tue',   type: 'String'},
            {name: 'wed',   type: 'String'},
            {name: 'thu',   type: 'String'},
            {name: 'fri',   type: 'String'},
            {name: 'sat',   type: 'String'},
            {name: 'sun',   type: 'String'}
        ]
    }
}

export default Neo.setupClass(MainModel);

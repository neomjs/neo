import Model from '../../../src/data/Model.mjs';

/**
 * @summary The record shape backing the buffered-list example.
 *
 * Deliberately two fields: a buffered list's cost model depends on row COUNT and row HEIGHT, never
 * on record width, so a wide model would only obscure what the example demonstrates.
 * @class Neo.examples.list.buffered.MainModel
 * @extends Neo.data.Model
 */
class MainModel extends Model {
    static config = {
        className  : 'Neo.examples.list.buffered.MainModel',
        keyProperty: 'id',

        fields: [{
            name: 'id',
            type: 'Integer'
        }, {
            name: 'name',
            type: 'String'
        }]
    }
}

export default Neo.setupClass(MainModel);

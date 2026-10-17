import Model from '../../../src/data/Model.mjs';

/**
 * @summary One issue of `neomjs/neo`, as the snapshot in `neomjs/pages` (`resources_pub/data/neo_issues.json`) holds it.
 * @class Neo.examples.grid.issues.MainModel
 * @extends Neo.data.Model
 */
class MainModel extends Model {
    static config = {
        /**
         * @member {String} className='Neo.examples.grid.issues.MainModel'
         * @protected
         */
        className: 'Neo.examples.grid.issues.MainModel',
        /**
         * @member {Object[]} fields
         */
        fields: [
            {name: 'area',     type: 'String'},
            {name: 'author',   type: 'String'},
            {name: 'comments', type: 'Integer'},
            {name: 'created',  type: 'Date'},
            {name: 'id',       type: 'Integer'},
            {name: 'state',    type: 'String'},
            {name: 'summary',  type: 'String'},
            {name: 'title',    type: 'String'},
            {name: 'type',     type: 'String'}
        ]
    }
}

export default Neo.setupClass(MainModel);

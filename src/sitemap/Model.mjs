import BaseModel from '../data/Model.mjs';

/**
 * @class Neo.sitemap.Model
 * @extends Neo.data.Model
 */
class Model extends BaseModel {
    static config = {
        /*
         * @member {String} className='Neo.sitemap.Model'
         * @protected
         */
        className: 'Neo.sitemap.Model',
        /*
         * @member {Object[]} fields
         */
        fields: [{
            name: 'action',
            type: 'String'
        }, {
            name        : 'actionType', // handler, route, url
            defaultValue: 'route',
            type        : 'String'
        }, {
            name: 'column',
            type: 'Number' // zero based
        }, {
            name        : 'disabled',
            defaultValue: false,
            type        : 'Boolean'
        }, {
            name        : 'hidden',
            defaultValue: false,
            type        : 'Boolean'
        }, {
            name: 'id',
            type: 'Number'
        }, {
            name        : 'level', // indentation
            defaultValue: 0,
            type        : 'Number'
        }, {
            name: 'name',
            type: 'Html'
        }]
    }
}

Neo.setupClass(Model);

export default Model;

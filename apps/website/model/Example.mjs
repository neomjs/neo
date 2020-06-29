import Model  from '../../../src/data/Model.mjs';

/**
 * @class Website.model.Example
 * @extends Neo.data.Model
 */
class Example extends Model {
    static getConfig() {return {
        /**
         * @member {String} className='Website.model.Example'
         * @protected
         */
        className: 'BlogPost.model.Example',
        /**
         * @member {Object[]} fields
         * @protected
         */
        fields: [{
            name: 'backgroundColor',
            type: 'String'
        }, {
            name: 'id',
            type: 'Integer'
        }, {
            name: 'image',
            type: 'String'
        }, {
            name: 'name',
            type: 'String'
        }, {
            name: 'url',
            type: 'String'
        }]
    }}
}

Neo.applyClassConfig(Example);

export {Example as default};
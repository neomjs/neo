import Model from '../../../src/data/Model.mjs';

/**
 * @class Colors.model.Color
 * @extends Neo.data.Model
 */
class Color extends Model {
    static config = {
        /**
         * @member {String} className='Colors.model.Color'
         * @protected
         */
        className: 'Colors.model.Color'
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let startCharCode = 'A'.charCodeAt(0),
            i             = 0,
            len           = 26, // amount of chars inside the ISO basic latin alphabet
            fields        = [{
                name: 'id',
                type: 'String'
            }];

        for (; i < len; i++) {
            fields.push({
                name: 'column' + String.fromCharCode(startCharCode + i),
                type: 'String'
            })
        }

        this.fields = fields
    }
}

export default Neo.setupClass(Color);

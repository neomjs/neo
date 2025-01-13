import Model from '../../../src/data/Model.mjs';

/**
 * @class Neo.examples.grid.bigData.MainModel
 * @extends Neo.data.Model
 */
class MainModel extends Model {
    static config = {
        /**
         * @member {String} className='Neo.examples.grid.bigData.MainModel'
         * @protected
         */
        className: 'Neo.examples.grid.bigData.MainModel',
        /**
         * @member {Number} amountColumns_=50
         */
        amountColumns_: 50
    }

    /**
     * Triggered after the amountColumns config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetAmountColumns(value, oldValue) {
        let i      = 4,
            fields = [
                {name: 'id',        type: 'Int'},
                {name: 'firstname', type: 'String'},
                {name: 'lastname',  type: 'String'}
            ];

        for (; i < value; i++) {
            fields.push({name: 'number' + i, type: 'Int'})
        }

        this.fields = fields
    }
}

export default Neo.setupClass(MainModel);

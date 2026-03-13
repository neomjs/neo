import TreeModel from '../../../src/data/TreeModel.mjs';

/**
 * @class Neo.examples.grid.treeBigData.MainModel
 * @extends Neo.data.TreeModel
 */
class MainModel extends TreeModel {
    static config = {
        /**
         * @member {String} className='Neo.examples.grid.treeBigData.MainModel'
         * @protected
         */
        className: 'Neo.examples.grid.treeBigData.MainModel',
        /**
         * @member {Number} amountColumns_=50
         * @reactive
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
        let i      = 7,
            fields = [
                {name: 'id',        type: 'String'},
                {name: 'name',      type: 'String'},
                {name: 'countAction'},
                {name: 'counter',   type: 'Int'},
                {name: 'firstname', type: 'String'},
                {name: 'lastname',  type: 'String'},
                {name: 'progress',  type: 'Int'}
            ];

        for (; i <= value; i++) {
            fields.push({name: 'number' + i, type: 'Int'})
        }

        this.fields = [...this.fields, ...fields]
    }
}

export default Neo.setupClass(MainModel);

import Component from '../../../src/component/Base.mjs';

/**
 * @summary One pooled row of the buffered list — a recycled component, not a per-record instance.
 *
 * `Neo.list.Buffered` keeps a bounded pool whose cardinality depends only on viewport + buffer, and
 * re-points the surviving instances at different records as the mounted range moves. `record_` is
 * therefore the config that changes on recycling, which is why it is reactive: the row re-renders in
 * place instead of being destroyed and rebuilt. The list writes it through `recordProperty`.
 * @class Neo.examples.list.buffered.PooledRow
 * @extends Neo.component.Base
 */
class PooledRow extends Component {
    static config = {
        className: 'Neo.examples.list.buffered.PooledRow',
        baseCls  : ['neo-examples-buffered-row'],
        /**
         * The Store record this slot currently displays. Reassigned on recycling, never on scroll
         * alone — a scroll that crosses no buffer edge leaves every row's record untouched.
         * @member {Object|null} record_=null
         * @reactive
         */
        record_: null,
        /**
         * The store's record count, which every row names beside its own place
         * @member {Number|null} total_=null
         * @reactive
         */
        total_: null
    }

    /**
     * @param {Object|null} value
     * @param {Object|null} oldValue
     */
    afterSetRecord(value, oldValue) {
        this.updateText()
    }

    /**
     * @param {Number|null} value
     * @param {Number|null} oldValue
     */
    afterSetTotal(value, oldValue) {
        this.updateText()
    }

    /**
     * Writes "Record 1 of 5,000": the row's place in the store, then the store's count
     * @protected
     */
    updateText() {
        let {record, total} = this,
            format          = value => value.toLocaleString('en-US');

        this.text = record ? `Record ${format(record.id + 1)}${total ? ` of ${format(total)}` : ''}` : ''
    }
}

export default Neo.setupClass(PooledRow);

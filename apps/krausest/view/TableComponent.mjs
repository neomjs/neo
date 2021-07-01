import Base            from '../../../src/component/Base.mjs';
import ClassSystemUtil from '../../../src/util/ClassSystem.mjs';
import TableCollection from '../TableCollection.mjs';

function _random(max) {
    return Math.round(Math.random()*1000)%max;
}

/**
 * @class NeoApp.view.TableComponent
 * @extends Neo.component.Base
 */
class TableComponent extends Base {
    static getConfig() {return {
        /**
         * @member {String} className='NeoApp.view.TableComponent'
         * @protected
         */
        className: 'NeoApp.view.TableComponent',
        /**
         * @member {String[]} cls=['table','table-hover','table-striped','test-data']
         */
        cls: ['table', 'table-hover', 'table-striped', 'test-data'],
        /**
         * @member {NeoApp.TableCollection|null} store_=TableCollection
         */
        store_: TableCollection,
        /**
         * @member {Object} _vdom
         */
        _vdom:
        {tag: 'table', cn: [
            {tag: 'tbody', id: 'tbody', cn: []}
        ]}
    }}

    /**
     *
      */
    add() {
        let me   = this,
            vdom = me.vdom;

        me.store.add(me.store.buildData());

        me.store.items.forEach(item => {
            vdom.cn[0].cn.push(me.createTableRow(item));
        });

        me.vdom = vdom;
    }

    /**
     * Triggered before the store config gets changed.
     * @param {Object|Neo.data.Store} value
     * @param {Object|Neo.data.Store} oldValue
     * @returns {Neo.data.Store}
     * @protected
     */
    beforeSetStore(value, oldValue) {
        oldValue && oldValue.destroy();
        return ClassSystemUtil.beforeSetInstance(value);
    }

    /**
     *
     */
    clear() {
        let me   = this,
            vdom = me.vdom;

        me.store.clear();
        vdom.cn[0].cn = [];

        me.vdom = vdom;
    }

    /**
     *
     * @param {Object} data
     * @param {Number} data.id
     * @param {String} data.label
     * @returns {Object}
     */
    createTableRow(data) {
        return {tag: 'tr', cn: [
            {tag: 'td', cls: ['col-md-1'], html: data.id},
            {tag: 'td', cls: ['col-md-4'], cn: [
                {tag: 'a', cls: ['lbl'], html: data.label}
            ]},
            {tag: 'td', cls: ['col-md-1'], cn: [
                {tag: 'a', cls: ['remove'], cn: [
                    {tag: 'span', cls: ['remove', 'glyphicon', 'glyphicon-remove'], 'aria-hidden': true}
                ]}
            ]},
            {tag: 'td', cls: ['col-md-6']}
        ]};
    }
}

Neo.applyClassConfig(TableComponent);

export {TableComponent as default};

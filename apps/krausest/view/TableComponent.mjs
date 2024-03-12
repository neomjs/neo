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
    static config = {
        /**
         * @member {String} className='NeoApp.view.TableComponent'
         * @protected
         */
        className: 'NeoApp.view.TableComponent',
        /**
         * @member {String[]} baseCls=['table','table-hover','table-striped','test-data']
         */
        baseCls: ['table', 'table-hover', 'table-striped', 'test-data'],
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
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        Neo.main.addon.CloneNode.createNode({
            id  : this.id,
            tag : 'tr',
            html: [
                '<td class="col-md-1"></td>',
                '<td class="col-md-4"><a class="lbl"></a></td>',
                '<td class="col-md-1"><a class="remove"><span class="remove glyphicon glyphicon-remove" aria-hidden="true"></span></a></td>',
                '<td class="col-md-6"></td>'
            ].join(''),
            paths: {
                id   : '0',
                label: '1/0'
            }
        });
    }

    /**
     *
      */
    add() {
        let me    = this,
            store = me.store,
            items = store.buildData();

        store.add(items);

        Neo.main.addon.CloneNode.applyClones({
            data    : items,
            id      : me.id,
            parentId: 'tbody'
        });

        // this works pretty fast as well
        /*items.forEach(item => {
            me.vdom.cn[0].cn.push(me.createTableRow(item));
        });

        me.update();*/
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
        let me    = this,
            store = me.store;

        if (store.getCount() > 0) {
            store.clear();
            Neo.applyDeltas(me.appName, {
                action: 'setTextContent',
                id    : 'tbody',
                value : ''
            });
        }
    }

    /**
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

    /**
     *
     */
    runlots() {
        let me    = this,
            store = me.store,
            items = store.buildData(10000);

        me.clear();
        store.add(items);

        Neo.main.addon.CloneNode.applyClones({
            data    : items,
            id      : me.id,
            parentId: 'tbody'
        });
    }
}

Neo.setupClass(TableComponent);

export default TableComponent;

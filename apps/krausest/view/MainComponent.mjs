import Base                    from '../../../src/component/Base.mjs';
import MainComponentController from  './MainComponentController.mjs';
import TableComponent          from  './TableComponent.mjs';
import VdomUtil                from '../../../src/util/VDom.mjs';

/**
 * @class NeoApp.view.MainComponent
 * @extends Neo.component.Base
 */
class MainComponent extends Base {
    static config = {
        /**
         * @member {String} className='NeoApp.view.MainComponent'
         * @protected
         */
        className: 'NeoApp.view.MainComponent',
        /**
         * True automatically mounts a component after being rendered.
         * @member {Boolean} autoMount=true
         */
        autoMount: true,
        /**
         * @member {String[]} baseCls=['container']
         */
        baseCls: ['container'],
        /**
         * @member {Neo.controller.Component} controller=MainComponentController
         */
        controller: MainComponentController,
        /**
         * @member {Object[]} domListeners
         * @protected
         */
        domListeners: [{
            click   : 'onButtonClick',
            delegate: '.btn'
        }],
        /**
         * @member {NeoApp.view.TableComponent|null} table=null
         */
        table: null,
        /**
         * @member {Object} _vdom
         */
        _vdom:
        {cls: ['container'], cn: [
            {cls: ['jumbotron'], cn: [
                {cls: ['row'], cn: [
                    {cls: ['col-md-6'], cn: [
                        {cls: ['row'], cn: [
                            {tag: 'h1', html: 'neo.mjs'}
                        ]}
                    ]},
                    {cls: ['col-md-6'], cn: [
                        {cls: ['row'], flag: 'row', cn: []}
                    ]}
                ]}
            ]},
            {tag: 'span', cls: ['preloadicon', 'glyphicon', 'glyphicon-remove'], 'aria-hidden': true}
        ]}
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        this.createColumns(); // silent vdom update
        this.createTable();
    }

    /**
     *
     */
    createColumns() {
        let me   = this,
            vdom = me.vdom,
            row  = VdomUtil.getByFlag(vdom, 'row'),
            i    = 0,
            item,

            map = [
                {id: 'run',      html: 'Create 1,000 rows'},
                {id: 'runlots',  html: 'Create 10,000 rows'},
                {id: 'add',      html: 'Append 1,000 rows'},
                {id: 'update',   html: 'Update every 10th row'},
                {id: 'clear',    html: 'Clear'},
                {id: 'swaprows', html: 'Swap Rows'}
            ];

        for (; i < 6; i++) {
            item = map[i];

            row.cn.push(
                {cls: ['col-sm-6 smallpad'], cn: [
                    {tag: 'button', type: 'button', cls: ['btn', 'btn-primary', 'btn-block'], id: item.id, html: item.html}
                ]}
            );
        }
    }

    /**
     *
     */
    createTable() {
        let me = this;

        me.table = Neo.create({
            module   : TableComponent,
            appName  : me.appName,
            parentId : me.id,
            reference: 'table'
        });

        me.vdom.cn.splice(1, 0, me.table.vdom);

        me.update();
    }
}

export default Neo.setupClass(MainComponent);

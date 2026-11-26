import Container  from '../../src/container/Base.mjs';
import EmptyState from '../../src/component/EmptyState.mjs';

/**
 * @summary Shows one entry of the explorer: its name, where it lives, what kind it is, and its size and last change
 * for a file or what it holds for a folder. It renders what `details` says and knows nothing of the store.
 * @class Neo.examples.fileExplorer.DetailPane
 * @extends Neo.container.Base
 */
class DetailPane extends Container {
    static config = {
        /**
         * @member {String} className='Neo.examples.fileExplorer.DetailPane'
         * @protected
         */
        className: 'Neo.examples.fileExplorer.DetailPane',
        /**
         * @member {String[]} cls=['fe-detail']
         * @reactive
         */
        cls: ['fe-detail'],
        /**
         * What to show: `{icon, kind, name, path, rows}`, `rows` being `[label, value]` pairs, or null for nothing
         * selected
         * @member {Object|null} details_=null
         * @reactive
         */
        details_: null,
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         * @reactive
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {String} tag='section'
         * @reactive
         */
        tag: 'section'
    }

    /**
     * @summary Builds the shared empty state and the populated entry-details body.
     * @protected
     */
    createItems() {
        let me = this;

        me.items = [{
            module      : EmptyState,
            cls         : ['fe-detail-empty'],
            contentAlign: 'center',
            flex        : 1,
            reference   : 'empty-state',
            text        : 'Select a file or a folder to see its details.',
            ui          : 'plain'
        }, {
            ntype    : 'component',
            cls      : ['fe-detail-body'],
            flex     : 'none',
            hidden   : true,
            reference: 'detail-body',
            vdom     : {cn: []}
        }];

        super.createItems();
        me.syncDetails(me.details)
    }

    /**
     * @summary Renders the details, or the empty state.
     * @param {Object|null} value
     * @param {Object|null} oldValue
     * @protected
     */
    afterSetDetails(value, oldValue) {
        this.items?.length && this.syncDetails(value)
    }

    /**
     * @summary Toggles the empty state against the populated entry metadata view.
     * @param {Object|null} value
     * @protected
     */
    syncDetails(value) {
        let emptyState = this.down({reference: 'empty-state'}),
            body       = this.down({reference: 'detail-body'});

        if (!emptyState || !body) {
            return
        }

        if (!value) {
            body.vdom.cn      = [];
            body.hidden       = true;
            emptyState.hidden = false
        } else {
            emptyState.hidden = true;
            body.vdom.cn      = [{
                cls: ['fe-detail-head'],
                cn : [
                    {tag: 'span', cls: ['fe-detail-icon', ...value.icon], 'aria-hidden': true},
                    {tag: 'h2',   cls: ['fe-detail-name'], text: value.name}
                ]
            }, {
                cls : ['fe-detail-path'],
                text: value.path
            }, {
                tag: 'dl',
                cn : value.rows.flatMap(([label, text]) => [{tag: 'dt', text: label}, {tag: 'dd', text}])
            }];
            body.hidden = false;
            body.update()
        }
    }
}

export default Neo.setupClass(DetailPane);

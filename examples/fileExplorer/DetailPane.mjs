import Component from '../../src/component/Base.mjs';

/**
 * @summary Shows one entry of the explorer: its name, where it lives, what kind it is, and its size and last change
 * for a file or what it holds for a folder. It renders what `details` says and knows nothing of the store.
 * @class Neo.examples.fileExplorer.DetailPane
 * @extends Neo.component.Base
 */
class DetailPane extends Component {
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
         * @member {Object} _vdom
         */
        _vdom: {
            tag: 'section',
            cn : []
        }
    }

    /**
     * @summary Renders the details, or the empty state.
     * @param {Object|null} value
     * @param {Object|null} oldValue
     * @protected
     */
    afterSetDetails(value, oldValue) {
        let me = this;

        if (!value) {
            me.vdom.cn = [{cls: ['fe-detail-empty'], text: 'Select a file or a folder to see its details.'}]
        } else {
            me.vdom.cn = [{
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
            }]
        }

        me.update()
    }
}

export default Neo.setupClass(DetailPane);

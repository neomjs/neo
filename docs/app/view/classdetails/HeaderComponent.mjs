import Component           from '../../../../src/component/Base.mjs';
import SourceViewComponent from './SourceViewComponent.mjs';

/**
 * @class Docs.view.classdetails.HeaderComponent
 * @extends Neo.component.Base
 */
class HeaderComponent extends Component {
    static config = {
        /**
         * @member {String} className='Docs.view.classdetails.HeaderComponent'
         * @protected
         */
        className: 'Docs.view.classdetails.HeaderComponent',
        /**
         * @member {String} ntype='classdetails-headercomponent'
         * @protected
         */
        ntype: 'classdetails-headercomponent',
        /**
         * @member {String[]} baseCls=['neo-docs-classdetails-headercomponent']
         */
        baseCls: ['neo-docs-classdetails-headercomponent'],
        /**
         * @member {Object|null} record_=null
         */
        record_: null,
        /**
         * @member {Object} domListeners
         */
        domListeners: {
            click: {
                fn      : 'onHeaderClick', // Docs.app.view.MainContainerController
                delegate: '.neo-docs-header-text'
            }
        },
        /**
         * @member {Object} _vdom
         */
        _vdom:
        {cn: [
            {tag: 'span', cls: ['neo-docs-header-text']}
        ]}
    }

    /**
     * Triggered after the mounted config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetMounted(value, oldValue) {
        super.afterSetMounted(value, oldValue);

        value && setTimeout(() => {
            Neo.main.addon.HighlightJS.syntaxHighlightInit();
        }, 100);
    }

    /**
     *
     */
    async onConstructed() {
        super.onConstructed();

        let me         = this,
            className = me.record.className,
            store     = me.up('main-container').store,
            record    = store.find({$kind: className === 'Neo' ? 'module' : 'class', neoClassName: className})[0],
            i         = 0,
            len       = record?.tags?.length || 0,
            singleton = false;

        for (; i < len; i++) {
            if (record.tags[i].title === 'singleton') {
                singleton = true;
                break
            }
        }

        me.vdom.cn[0].innerHTML = singleton ? (className + ' → Singleton') : className;

        if (record.description) {
            let html = await Neo.main.addon.Markdown.markdownToHtml(record.description);

            me.vdom.cn.push({
                cls: ['neo-docs-header-description'],
                html
            })
        }

        me.update();

        setTimeout(() => {
            Neo.main.addon.HighlightJS.syntaxHighlightInit();
        }, 100)
    }
}

Neo.applyClassConfig(HeaderComponent);

export default HeaderComponent;

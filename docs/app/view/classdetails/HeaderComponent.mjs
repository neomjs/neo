import Component           from '../../../../src/component/Base.mjs';
import SourceViewComponent from './SourceViewComponent.mjs';

/**
 * @class Docs.app.view.classdetails.HeaderComponent
 * @extends Neo.component.Base
 */
class HeaderComponent extends Component {
    static getConfig() {return {
        /**
         * @member {String} className='Docs.app.view.classdetails.HeaderComponent'
         * @protected
         */
        className: 'Docs.app.view.classdetails.HeaderComponent',
        /**
         * @member {String} ntype='classdetails-headercomponent'
         * @protected
         */
        ntype: 'classdetails-headercomponent',
        /**
         * @member {String[]} cls=['neo-docs-classdetails-headercomponent']
         */
        cls: ['neo-docs-classdetails-headercomponent'],
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
        _vdom: {
            cn: [{
                tag: 'span',
                cls: ['neo-docs-header-text']
            }]
        }
    }}

    /**
     *
     */
    onConstructed() {
        super.onConstructed();

        let me         = this,
            vdom      = me.vdom,
            className = me.record.className,
            store     = me.up('main-container').store,
            record    = store.find({$kind: className === 'Neo' ? 'module' : 'class', neoClassName: className})[0],
            i         = 0,
            len       = record && record.tags && record.tags.length || 0,
            singleton = false;

        for (; i < len; i++) {
            if (record.tags[i].title === 'singleton') {
                singleton = true;
                break;
            }
        }

        vdom.cn[0].innerHTML = singleton ? (className + ' → Singleton') : className;

        if (record.description) {
            vdom.cn.push({
                cls      : ['neo-docs-header-description'],
                innerHTML: record.description
            });
        }

        me.vdom = vdom;
    }
}

Neo.applyClassConfig(HeaderComponent);

export {HeaderComponent as default};
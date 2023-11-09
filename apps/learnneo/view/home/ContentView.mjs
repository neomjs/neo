import Component from '../../../../src/component/Base.mjs';

/**
 * @class LearnNeo.view.home.ContentView
 * @extends Neo.component.Base
 */
class ContentView extends Component {
    static config = {
        /**
         * @member {String} className='LearnNeo.view.home.ContentView'
         * @protected
         */
        className: 'LearnNeo.view.home.ContentView',
        /**
         * @member {String[]} baseCls=['learn-content']
         * @protected
         */
        baseCls: ['learn-content']
    }

    /**
     * @member {Object} record=null
     */
    record = null

    /**
     * @param {Object} data
     */
    onClick(data) {
        let me     = this,
            record = me.record;

        if (data.altKey && data.shiftKey && !data.metaKey) {
            me.fire('edit', {component: me, record})
        }
        // Command/windows shift click = refresh
        else if (!data.altKey && data.shiftKey && data.metaKey) {
            me.fire('refresh', {component: me, record})
        }
    }

    /**
     *
     */
    onConstructed() {
        super.onConstructed();

        let me = this;

        me.addDomListeners({
            click: me.onClick,
            scope: me
        })
    }

}

Neo.applyClassConfig(ContentView);

export default ContentView;

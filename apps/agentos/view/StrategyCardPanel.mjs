import Panel from '../../../src/container/Panel.mjs';

/**
 * @class AgentOS.view.StrategyCardPanel
 * @extends Neo.container.Panel
 */
class StrategyCardPanel extends Panel {
    static config = {
        /**
         * @member {String} className='AgentOS.view.StrategyCardPanel'
         * @protected
         */
        className: 'AgentOS.view.StrategyCardPanel',
        /**
         * @member {String[]} baseCls=['agent-kpi-card-panel','neo-panel','neo-container']
         * @reactive
         */
        baseCls: ['agent-kpi-card-panel', 'neo-panel', 'neo-container'],
        /**
         * @member {Object[]} headers
         * @reactive
         */
        headers: [{
            cls : ['neo-panel-header', 'neo-draggable'],
            dock: 'top'
        }],
        /**
         * @member {String|null} title_=null
         * @reactive
         */
        title_: null,
        /**
         * @member {String|null} value_=null
         * @reactive
         */
        value_: null,
        /**
         * @member {Object[]} items
         */
        items: [{
            ntype    : 'component',
            cls      : ['agent-kpi-card'],
            reference: 'body-component',
            vdom     : {cn: [{cls: 'agent-kpi-value'}]}
        }]
    }

    /**
     * Triggered after the title config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetTitle(value, oldValue) {
        this.headers[0].text = value
    }

    /**
     * Triggered after the value config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetValue(value, oldValue) {
        let bodyComponent = this.getItem('body-component');

        bodyComponent.vdom.cn[0].text = value;
        bodyComponent.update?.() // Only available after construction
    }
}

export default Neo.setupClass(StrategyCardPanel);

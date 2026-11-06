import Button        from '../../../../../src/button/Base.mjs';
import CardContainer from '../../../../../src/container/Base.mjs';
import EffectButton  from '../../../../../src/tab/header/EffectButton.mjs';
import TabContainer  from '../../../../../src/tab/Container.mjs';

/**
 * @class Test.Playwright.Component.TabClose.Container
 * @extends Neo.tab.Container
 * @summary Exposes real close-event ordering and a veto inside the component test's App Worker.
 */
class Container extends TabContainer {
    static config = {
        className: 'Test.Playwright.Component.TabClose.Container',
        ntype    : 'tab-close-test-container',
        /**
         * Requests one public close operation through the component test RPC.
         * @member {Number|null} closeIndex_=null
         * @reactive
         */
        closeIndex_  : null,
        effectHeaders: false,
        /** @member {Boolean} panelCloseButton=false */
        panelCloseButton: false,
        vetoClose       : false
    }

    /** @member {Object[]} closeReceipt=[] */
    closeReceipt = []

    /**
     * @summary Optionally hosts a panel-owned Done button and observes the real close events inside the worker.
     * @param {Object} config
     */
    construct(config) {
        if (config.panelCloseButton) {
            const index = config.activeIndex ?? 0,
                  card  = config.items[index];

            config.items[index] = {
                module: CardContainer,
                header: card.header,
                items : [{
                    module : Button,
                    text   : 'Done',
                    handler: () => this.closeTab()
                }]
            }
        }
        super.construct(config);

        this.on({
            beforeTabClose: this.onBeforeTabClose,
            tabClose      : this.onTabClose,
            scope         : this
        });
        this.publishCloseReceipt()
    }

    /**
     * @summary Exercises the effect header through an isolated subclass rather than a global overwrite.
     * @param {Object} config
     * @param {Number} index
     * @returns {Object}
     */
    getTabButtonConfig(config, index) {
        const result = super.getTabButtonConfig(config, index);

        if (this.effectHeaders) result.module = EffectButton;
        return result
    }

    /**
     * @summary Calls the public close API from the worker while the spec keeps focus elsewhere.
     * @param {Number|null} value
     */
    afterSetCloseIndex(value) {
        if (value !== null) {
            const result = this.closeTab(value);
            this.changeVdomRootKey('data-close-result', result === false ? 'refused' : 'closed')
        }
    }

    /**
     * @summary Records the pre-removal membership and optionally exercises the supported veto.
     * @param {Object} context
     */
    onBeforeTabClose(context) {
        if (this.vetoClose) context.abort = true;
        this.closeReceipt.push({event: 'before', tabs: this.getTabButtons().map(button => button.text)});
        this.publishCloseReceipt()
    }

    /** @summary Records the membership visible to the post-removal event. */
    onTabClose() {
        this.closeReceipt.push({event: 'after', tabs: this.getTabButtons().map(button => button.text)});
        this.publishCloseReceipt()
    }

    /** @summary Publishes the event receipt as observable browser state. */
    publishCloseReceipt() {
        this.changeVdomRootKey('data-close-receipt', JSON.stringify(this.closeReceipt))
    }
}

export default Neo.setupClass(Container);

import SplitButton from '../../../../../src/button/Split.mjs';

/**
 * @class Test.Playwright.Component.SplitButton.Split
 * @extends Neo.button.Split
 * @summary Records which handler a real click ran, inside the component test's App Worker: `main` for the split's
 * own handler, `caret` for its trigger's.
 */
class Split extends SplitButton {
    static config = {
        /**
         * @member {String} className='Test.Playwright.Component.SplitButton.Split'
         * @protected
         */
        className: 'Test.Playwright.Component.SplitButton.Split',
        /**
         * @member {String} ntype='split-button-receipt-test'
         * @protected
         */
        ntype: 'split-button-receipt-test',
        /**
         * @member {Function} handler
         */
        handler: ({component}) => component.clickReceipt.push('main')
    }

    /**
     * @member {String[]} clickReceipt=[]
     */
    clickReceipt = []

    /**
     * @summary Records a click on the trigger button.
     * @param {Object} data
     */
    splitButtonHandler(data) {
        this.clickReceipt.push('caret')
    }
}

export default Neo.setupClass(Split);

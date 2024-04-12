import ComponentController from '../../../src/controller/Component.mjs';
import Toast               from '../../../src/component/Toast.mjs';

/**
 * @class Neo.examples.component.toast.MainContainerController
 * @extends Neo.controller.Component
 */
class MainContainerController extends ComponentController {
    static config = {
        /**
         * @member {String} className='Neo.examples.component.toast.MainContainerController'
         * @protected
         */
        className: 'Neo.examples.component.toast.MainContainerController'
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);
        Neo.main.addon.HighlightJS.switchTheme('dark');
        Neo.main.addon.HighlightJS.loadLibrary({});
    }

    /**
     * Whenever any field changes we update the output
     * @param {Object} data
     * @returns {Promise<void>}
     */
    async onChange(data) {
        let me      = this,
            form    = me.getReference('form'),
            output  = me.getReference('output'),
            button  = me.getReference('creation-button'),
            oVdom   = output.vdom.cn[0].cn[0],
            isValid = await form.isValid(),
            values;

        if (Neo.isBoolean(data.value)) {
            me.getReference('closable').value = data.value;
        }

        values = await form.getSubmitValues();

        values.appName = me.component.appName;
        button.disabled = !isValid;

        if (isValid) {
            oVdom.cn = output.itemTpl(values);

            output.update();

            await me.timeout(20);
            me.syntaxHighlight()
        }
    }

    /**
     * Cleanup the values and show the toast
     */
    async createToast() {
        let me     = this,
            form   = me.getReference('form'),
            values = await form.getSubmitValues(),
            clear  = ['position', 'slideDirection', 'ui', 'minHeight', 'maxWidth', 'closable', 'timeout'];

        // use the defaults from toast if not set
        clear.forEach(item => {
            if (values[item] === null) {
                delete values[item];
            }
        })

        values.appName = me.component.appName;
        Neo.toast(values);
    }

    /**
     * 3rd party tool to highlight the code
     */
    syntaxHighlight() {
        let me     = this,
            output = me.getReference('output'),
            oVdom  = output.vdom;

        Neo.main.addon.HighlightJS.syntaxHighlight({
            appName: me.component.appName,
            vnodeId: oVdom.cn[0].id
        });
    }
}

Neo.setupClass(MainContainerController);

export default MainContainerController;

import Component    from '../../../src/controller/Component.mjs';
import '../../../src/form/field/Select.mjs'

/**
 * @class Neo.examples.container.dialog.MainContainerController
 * @extends Neo.controller.Component
 */
class MainContainerController extends Component {
    static config = {
        /**
         * @member {String} className='Neo.examples.container.dialog.MainContainerController'
         * @protected
         */
        className: 'Neo.examples.container.dialog.MainContainerController'
    }

    dialog = null;
    title = 'example dialog';
    height = 300;
    width = 500;

    /**
     * 
     * @param {*} config 
     */
    construct(config) {
        super.construct(config);
    }

    /**
     * 
     * @param {Object} data 
     */
    async onButtonClick(data) {
        if (!this.dialog) {
            let module = await import ('../../../src/container/Dialog.mjs');
            this.dialog = Neo.create({
                module: module.default,
                appName: this.component.appName,
                autoMount: true,
                autoRender: true,
                title: this.title,
                height: this.height,
                width: this.width,
                iconCls: ['fa', 'fa-home'],
                
                headerConfig: {
                    items: [{
                        ntype: 'button',
                        text: 'foo'
                    }],
                    style: {borderBottom: 'solid 1px #bdbdbd'}
                },

                items: [{
                    ntype: 'container',
                    html: 'text'
                }, {
                    ntype     : 'selectfield',
                    labelText : 'Select',
                    store     : {
                        data : [{
                            id   : 0,
                            name : 'Option 1'
                        }]
                    }
                }]
            })
        }
        this.dialog.show();

        console.log(data, this);
    }

    /**
     * @param {String} config
     * @param {Object} opts
     */
    onConfigChange(config, opts) {
        if (this.dialog) {
            this.dialog[config] = opts.value;
        } else {
            this[config] = opts.value;
        }
    }
}

Neo.applyClassConfig(MainContainerController);

export default MainContainerController;

import Component    from '../../../src/controller/Component.mjs';
import TabContainer from '../../../src/tab/Container.mjs';

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

    /**
     * 
     * @param {*} config 
     */
    construct(config) {
        super.construct(config);
        console.log('I am here')
    }

    /**
     * 
     * @param {Object} data 
     */
    onButtonClick(data) {
        let me = this;
        if (!this.dialog) {
            import ('../../../src/container/Dialog.mjs').then((module) => {
                this.dialog = Neo.create({
                    module: module.default,
                    appName: this.component.appName,
                    autoMount: true,
                    autoRender: true,
                    title: 'test title',
                    height: 400,
                    width: 600,
                    headerConfig: {
                        items: [{
                            ntype: 'container',
                            cls: ['neo-button-glyph'],
                            html: '<i class="fa-solid fa-circle-check"></i>',
                            style: {height:'100%', justifyContent: 'center'}
                        }],
                        style: {borderBottom: 'solid 1px #bdbdbd'}
                    },

                    items: [ {
                        module: TabContainer,
                        items: [{
                            tabButtonConfig: {text: 'Tab 1', flag: 'tab1'},
                            ntype: 'container',
                            html: 'text'
                        }, {
                            tabButtonConfig: {text: 'Tab 2'},
                            ntype: 'container',
                            html: 'text2'
                        }]
                    }]
                })
            })
        } else {
            //TODO: this.dialog.show()
        }

        console.log(data, this);
    }
}

Neo.applyClassConfig(MainContainerController);

export default MainContainerController;

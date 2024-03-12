import Panel    from '../../../src/container/Panel.mjs';
import Viewport from '../../../src/container/Viewport.mjs';

/**
 * @class Neo.examples.core.config.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.core.config.MainContainer'
         * @protected
         */
        className: 'Neo.examples.core.config.MainContainer',
        /**
         * @member {Number|null} a_=null
         */
        a_: null,
        /**
         * @member {Number|null} b_=null
         */
        b_: null,
        /**
         * @member {Object} style
         */
        style: {
            padding: '20px'
        }
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.items = [{
            module: Panel,

            containerConfig: {
                layout: {ntype: 'vbox', align: 'start'},
                style : {padding: '20px'}
            },

            headers: [{
                dock : 'top',
                items: [{
                    ntype: 'label',
                    flag : 'label1'
                }, {
                    ntype: 'label',
                    flag : 'label2'
                }, {
                    ntype: 'component',
                    flex : 1
                }, {
                    handler  : me.changeConfig.bind(me),
                    iconCls  : 'fa fa-user',
                    text     : 'Change configs'
                }]
            }],

            items: [{
                ntype: 'label',
                text : 'Click the change configs button!'
            }]
        }];
    }

    /**
     * @param {Object} data
     */
    changeConfig(data) {
        this.set({
            a: 10,
            b: 10
        });
    }

    /**
     * Triggered after the a config got changed
     * @param {Number|null} value
     * @param {Number|null} oldValue
     * @protected
     */
    afterSetA(value, oldValue) {
        if (oldValue !== undefined) {
            this.down({flag: 'label1'}).text = value + this.b;
        }
    }

    /**
     * Triggered after the b config got changed
     * @param {Number|null} value
     * @param {Number|null} oldValue
     * @protected
     */
    afterSetB(value, oldValue) {
        if (oldValue !== undefined) {
            this.down({flag: 'label2'}).text = value + this.a;
        }
    }

    /**
     *
     */
    onConstructed() {
        super.onConstructed();

        this.set({
            a: 5,
            b: 5
        });
    }
}

Neo.setupClass(MainContainer);

export default MainContainer;

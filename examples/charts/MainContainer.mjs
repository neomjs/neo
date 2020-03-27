import {default as Viewport} from '../../src/container/Viewport.mjs';

/**
 * @class TestApp.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static getConfig() {return {
        className: 'TestApp.MainContainer',
        ntype    : 'main-container',

        autoMount: true,
        layout   : 'fit',

        style: {
            padding: '50px'
        },

        items: [{
            ntype: 'component',
            id   : 'am-chart-1',
            html : 'Hello World!'
        }]
    }}

    /**
     *
     * @param {Object} config
     */
    constructor(config) {
        super(config);

        this.on('mounted', () => {
            console.log('mounted');

            Neo.main.DomAccess.createLineChart({
                id: 'am-chart-1'
            });
        });
    }
}

Neo.applyClassConfig(MainContainer);

export {MainContainer as default};

import BaseViewport from '../../../src/container/Viewport.mjs';
import Button       from '../../../src/button/Base.mjs';

/**
 * @class Neo.examples.serverside.gridContainer.Viewport
 * @extends Neo.container.Viewport
 */
class Viewport extends BaseViewport {
    static config = {
        className: 'Neo.examples.serverside.gridContainer.Viewport',
        cls      : ['neo-serverside-gridcontainer-viewport'],
        layout   : 'base',

        items: [{
            ntype    : 'container',
            cls      : 'neo-serverside-gridcontainer-content',
            layout   : 'fit',
            reference: 'container'
        }, {
            module : Button,
            handler: 'up.onLoadGridContainerButtonClick',
            style  : {marginTop: '1em'},
            text   : 'Load Grid Container'
        }]
    }

    /**
     * @param {Object} data
     * @returns {Promise<void>}
     */
    async onLoadGridContainerButtonClick(data) {
        data.component.disabled = true;

        let response   = await fetch('../../examples/serverside/gridContainer/resources/data/grid-container.json'),
            remoteData = await response.json();

        if (remoteData.modules) {
            await Promise.all(remoteData.modules.map(module => import(module)))
        }

        this.getReference('container').add(remoteData.items)
    }

    /**
     * @param {Object} data
     * @param {String} data.value
     * @returns {String}
     */
    rendererGithubId({value}) {
        return `<i class='fa-brands fa-github'></i> ${value}`
    }
}

export default Neo.setupClass(Viewport);

import Button   from '../../../../src/button/Base.mjs';
import TextArea from '../../../../src/form/field/TextArea.mjs';
import Viewport from '../../../../src/container/Viewport.mjs';

/**
 * @class NeuralLink.view.Viewport
 * @extends Neo.container.Viewport
 */
class NeuralLinkViewport extends Viewport {
    static config = {
        className: 'NeuralLink.view.Viewport',
        layout: { ntype: 'vbox', align: 'stretch'},
        style : { padding: '20px' },
        items : [{
            ntype: 'component',
            flex : 'none',
            html : '<h1>Neural Link Testbed</h1><p>Open the browser console to see connection logs.</p>'
        }, {
            module   : TextArea,
            labelText: 'Logs (Placeholder)',
            height   : 300,
            reference: 'log-view'
        }, {
            module : Button,
            flex   : 'none',
            text   : 'Ping Agent',
            handler: 'up.onPing',
            style  : {marginTop: '10px'}
        }]
    }

    onPing() {
        console.log('Ping button clicked');
    }
}

export default Neo.setupClass(NeuralLinkViewport);

import LivePreview from '../../../src/code/LivePreview.mjs';
import Viewport    from '../../../src/container/Viewport.mjs';

/**
 * The function the Source tab holds and the Preview tab runs: a counter whose button text follows its
 * `useConfig` state. The executor resolves its imports against `src/code/`, as on the learn pages.
 * @type {String}
 */
const COUNTER_SOURCE = `import {defineComponent, useConfig} from '../functional/_export.mjs';
import Button                       from '../button/Base.mjs';

export default defineComponent({
    config: {
        className: 'Neo.examples.code.livePreview.Counter'
    },

    createVdom() {
        const [count, setCount] = useConfig(0);

        return {
            cn: [{
                module : Button,
                text   : \`Count: \${count}\`,
                handler: () => setCount(prev => prev + 1)
            }]
        }
    }
});
`;

/**
 * @summary The engine's own code editor as an example: `Neo.code.LivePreview` opens on the Source tab with a
 * function component, and its Preview tab runs that source, again after every edit.
 * @class Neo.examples.code.livePreview.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.code.livePreview.MainContainer'
         * @protected
         */
        className: 'Neo.examples.code.livePreview.MainContainer',
        /**
         * @member {Object[]} items
         */
        items: [{
            module   : LivePreview,
            // The editor's own height is the 400px of a learn page; a flex basis of 0 lets the page take it whole
            flex     : 1,
            reference: 'live-preview',
            value    : COUNTER_SOURCE
        }],
        /**
         * @member {Object|String} layout={ntype:'vbox',align:'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'}
    }
}

export default Neo.setupClass(MainContainer);

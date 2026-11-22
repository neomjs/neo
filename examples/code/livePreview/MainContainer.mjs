import Button      from '../../../src/button/Base.mjs';
import Component   from '../../../src/component/Base.mjs';
import Container   from '../../../src/container/Base.mjs';
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
 * function component, and its Preview tab runs that source, again after every edit. A header names what the page
 * shows and what to try, beside a button that switches between the neo-light and neo-dark themes.
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
         * @member {String[]} cls=['neo-examples-livepreview']
         * @reactive
         */
        cls: ['neo-examples-livepreview'],
        /**
         * @member {Object[]} items
         */
        items: [{
            module: Container,
            cls   : ['neo-examples-livepreview-header'],
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'center', wrap: 'wrap'},

            items: [{
                module: Component,
                cls   : ['neo-examples-livepreview-intro'],
                vdom  : {tag: 'header', cn: [
                    {tag: 'h1', cls: ['neo-examples-livepreview-title'],       text: 'A code editor that runs the function component it holds'},
                    {tag: 'p',  cls: ['neo-examples-livepreview-instruction'], text: 'Open Preview and press the counter, then change its text in Source: Preview runs the edited component, and only that one.'}
                ]}
            }, {
                module   : Button,
                handler  : 'up.onThemeButtonClick',
                iconCls  : 'fa-solid fa-moon',
                reference: 'theme-button',
                text     : 'Dark theme',
                tooltip  : 'Switch between the light and dark theme',
                ui       : 'ghost'
            }]
        }, {
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

    /**
     * @summary Shows the theme button for the theme the example started in.
     */
    onConstructed() {
        super.onConstructed();
        this.syncThemeButton()
    }

    /**
     * @summary Switches the page between neo-light and neo-dark, revealed from the click as in the other renewed
     * examples. The theme travels down the component tree, so the editor follows it through its own theme map.
     * @param {Object} data
     * @param {Number} [data.clientX]
     * @param {Number} [data.clientY]
     */
    async onThemeButtonClick(data) {
        let toDark = this.getTheme() !== 'neo-theme-neo-dark';

        await Neo.main.DomAccess.startViewTransition({
            delay   : 100,
            reveal  : {x: data?.clientX, y: data?.clientY},
            windowId: this.windowId
        }).catch(() => {});

        this.theme = toDark ? 'neo-theme-neo-dark' : 'neo-theme-neo-light';
        this.syncThemeButton()
    }

    /**
     * @summary Labels the button with the theme its next click selects.
     */
    syncThemeButton() {
        const dark = this.getTheme() === 'neo-theme-neo-dark';

        this.getReference('theme-button').set({
            iconCls: dark ? 'fa-solid fa-sun' : 'fa-solid fa-moon',
            text   : dark ? 'Light theme' : 'Dark theme'
        })
    }
}

export default Neo.setupClass(MainContainer);

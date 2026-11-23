import Button   from '../../../../../src/button/Base.mjs';
import Viewport from '../../../../../src/container/Viewport.mjs';

/**
 * @summary Component-test fixture for the shared tooltip outside the main view: one viewport button with a shared
 * tooltip, the control. `driver.mjs` opens dialogs under `document.body` whose buttons use the same shared tooltip.
 */
export const onStart = () => Neo.app({
    mainView: {
        module: Viewport,
        id    : 'tooltip-floating-root-viewport',
        layout: {ntype: 'vbox', align: 'start'},
        style : {padding: '40px'},
        items : [{
            module : Button,
            id     : 'tooltip-floating-root-viewport-target',
            text   : 'Viewport target',
            tooltip: 'Viewport tooltip'
        }]
    },
    name: 'Test.Playwright.TooltipFloatingRoot'
});

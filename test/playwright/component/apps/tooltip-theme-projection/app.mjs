import Button   from '../../../../../src/button/Base.mjs';
import Viewport from '../../../../../src/container/Viewport.mjs';

/**
 * One button with a shared tooltip under the dark neo theme (the body carries the first entry of
 * `themes`). `index.html` projects `--tooltip-bg` at theme-root — the consumer's documented path —
 * before any engine theme sheet loads, and leaves every other tooltip token to the engine sheet.
 */
export const onStart = () => Neo.app({
    mainView: {
        module: Viewport,
        id    : 'tooltip-theme-projection-viewport',
        layout: {ntype: 'vbox', align: 'start'},
        style : {padding: '40px'},
        items : [{
            module : Button,
            id     : 'tooltip-theme-projection-target',
            text   : 'Hover me',
            tooltip: {text: 'Projected tooltip'}
        }]
    },
    name: 'Test.Playwright.TooltipThemeProjection'
});

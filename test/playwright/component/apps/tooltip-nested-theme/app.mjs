import Button    from '../../../../../src/button/Base.mjs';
import Container from '../../../../../src/container/Base.mjs';
import Viewport  from '../../../../../src/container/Viewport.mjs';

/**
 * @summary A container that carries the light theme as its class default, so item creation hands
 * it to the container and its children.
 * @class Test.Playwright.Component.TooltipNestedTheme.LightScope
 * @extends Neo.container.Base
 */
class LightScope extends Container {
    static config = {
        /**
         * @member {String} className='Test.Playwright.Component.TooltipNestedTheme.LightScope'
         * @protected
         */
        className: 'Test.Playwright.Component.TooltipNestedTheme.LightScope',
        /**
         * @member {String} theme='neo-theme-neo-light'
         */
        theme: 'neo-theme-neo-light'
    }
}

LightScope = Neo.setupClass(LightScope);

/**
 * Two buttons with shared tooltips: one under the dark body theme (the first entry of `themes`),
 * one inside a light scope. The shared tooltip stamps the hovered target's theme class on itself,
 * so hovering the second must give a light tooltip inside a dark app.
 */
export const onStart = () => Neo.app({
    mainView: {
        module: Viewport,
        id    : 'tooltip-nested-theme-viewport',
        layout: {ntype: 'vbox', align: 'start'},
        style : {gap: '40px', padding: '40px'},
        items : [{
            module : Button,
            id     : 'tooltip-nested-theme-dark',
            text   : 'Dark target',
            tooltip: {text: 'Dark tooltip'}
        }, {
            module: LightScope,
            id    : 'tooltip-nested-theme-scope',
            layout: {ntype: 'vbox', align: 'start'},
            style : {padding: '20px'},
            items : [{
                module : Button,
                id     : 'tooltip-nested-theme-light',
                text   : 'Light target',
                tooltip: {text: 'Light tooltip'}
            }]
        }]
    },
    name: 'Test.Playwright.TooltipNestedTheme'
});

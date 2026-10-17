import Button    from '../../../../../src/button/Base.mjs';
import Component from '../../../../../src/component/Base.mjs';
import Container from '../../../../../src/container/Base.mjs';
import Viewport  from '../../../../../src/container/Viewport.mjs';

/**
 * @class Test.Playwright.Component.HideMergedSibling.Viewport
 * @extends Neo.container.Viewport
 * @summary Hides two buttons of one row in a single synchronous pass, the second also renamed, so its own update
 * merges into the row's cycle.
 */
class HideMergedSiblingViewport extends Viewport {
    static config = {
        className: 'Test.Playwright.Component.HideMergedSibling.Viewport',
        id       : 'hide-merged-sibling-viewport',
        layout   : {ntype: 'vbox', align: 'start'},
        /**
         * Setting it runs the pass once.
         * @member {Boolean} pass_=false
         * @reactive
         */
        pass_: false,
        items: [{
            module: Container,
            id    : 'hide-merged-sibling-row',
            layout: {ntype: 'hbox', align: 'center'},
            items : [
                {module: Component, id: 'hide-merged-sibling-label',  text: 'model'},
                {module: Button,    id: 'hide-merged-sibling-change', text: 'Change'},
                {module: Button,    id: 'hide-merged-sibling-adopt',  text: 'Adopt gpt-6-luna'}
            ]
        }]
    }

    /**
     * @param {Boolean} value
     * @param {Boolean} oldValue
     */
    async afterSetPass(value, oldValue) {
        if (!value) return;

        // One settled update leaves the row at its default depth, the state a live app is in
        await Neo.get('hide-merged-sibling-row').promiseUpdate();

        Neo.get('hide-merged-sibling-change').hidden = true;
        Neo.get('hide-merged-sibling-adopt').set({hidden: true, text: 'Adopt '})
    }
}

HideMergedSiblingViewport = Neo.setupClass(HideMergedSiblingViewport);

/** @summary Boots the harness viewport. */
export const onStart = () => Neo.app({
    mainView: HideMergedSiblingViewport,
    name    : 'Test.Playwright.HideMergedSibling'
});

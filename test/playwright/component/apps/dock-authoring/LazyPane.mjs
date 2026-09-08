import Pane from './Pane.mjs';

/**
 * @class Test.Playwright.Component.DockAuthoring.LazyPane
 * @extends Test.Playwright.Component.DockAuthoring.Pane
 * @summary Shared lazy module whose namespace registration witnesses first activation.
 */
class LazyPane extends Pane {
    /** @member {Number} sequence=0 @static */
    static sequence = 0

    static config = {
        className: 'Test.Playwright.Component.DockAuthoring.LazyPane',
        baseCls  : ['dock-authoring-lazy-pane']
    }
}

export default Neo.setupClass(LazyPane);

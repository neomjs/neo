import Controller  from '../../../src/controller/Component.mjs';
import TooltipBase from '../../../src/tooltip/Base.mjs';

/**
 * @summary Applies the delay fields to the board's tooltips: the window's shared one, which serves the toolbar hints and
 * the tickets, and the velocity button's own.
 * @class Neo.examples.tooltip.view.MainContainerController
 * @extends Neo.controller.Component
 */
class MainContainerController extends Controller {
    static config = {
        /**
         * @member {String} className='Neo.examples.tooltip.view.MainContainerController'
         * @protected
         */
        className: 'Neo.examples.tooltip.view.MainContainerController'
    }

    #openingCompanion = false

    /**
     * @summary The tooltips the delay fields tune
     * @returns {Neo.tooltip.Base[]}
     */
    getTooltips() {
        let {component} = this;

        return [TooltipBase.createSingleton(component.app, component.windowId), this.getReference('velocity').tooltip]
    }

    /**
     * @summary An empty field restores the default: the tooltip hides as the pointer or focus leaves its target.
     * @param {Object} data
     * @param {Number|null} data.value
     */
    onHideDelayChange({value}) {
        this.getTooltips().forEach(tooltip => {tooltip.hideDelay = Neo.isNumber(value) ? value : null})
    }

    /**
     * @summary Opens the same board in a second window, or focuses the existing companion without reloading it.
     * @returns {Promise<void>}
     */
    async onOpenSecondWindowClick() {
        if (this.#openingCompanion) return;

        const {component} = this,
              {windowId}  = component,
              windowName  = 'NeoTooltipCompanion';

        this.#openingCompanion = true;

        try {
            const closed = await Neo.Main.getByPath({
                path: ['Neo', 'Main', 'openWindows', windowName, 'win', 'closed'], windowId
            });

            if (this.isDestroyed) return;

            if (closed === false) {
                await Neo.Main.windowFocus({windowId, windowName});
                return
            }

            const url = new URL(Neo.windowConfigs[windowId].url.href);
            url.searchParams.set('companion', '1');
            url.searchParams.set('theme', component.getTheme());

            await Neo.Main.windowOpen({url: url.href, windowFeatures: 'popup=yes,width=640,height=620', windowId, windowName})
        } finally {
            this.#openingCompanion = false
        }
    }

    /**
     * @param {Object} data
     * @param {Number|null} data.value
     */
    onShowDelayChange({value}) {
        this.getTooltips().forEach(tooltip => {tooltip.showDelay = Neo.isNumber(value) ? value : 0})
    }
}

export default Neo.setupClass(MainContainerController);

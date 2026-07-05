import BaseViewport from '../../../../../src/container/Viewport.mjs';

/**
 * @class AgentOSWidget.view.Viewport
 * @extends Neo.container.Viewport
 *
 * The harness's multi-window popup host: a bare render target the dashboard's popup primitive
 * (`popupUrl` → this childapp) loads when a docked panel gets promoted into its own browser window.
 * The childapp joins the parent SharedWorker session, so instances and their state never move —
 * windows are render targets. Deliberately empty: detached panels (and Neural Link
 * `create_component` inserts targeting this window) arrive at runtime; nothing is declared here.
 */
class Viewport extends BaseViewport {
    static config = {
        /**
         * @member {String} className='AgentOSWidget.view.Viewport'
         * @protected
         */
        className: 'AgentOSWidget.view.Viewport',
        /**
         * @member {String[]} additionalThemeFiles=['AgentOS.view.Viewport']
         */
        additionalThemeFiles: ['AgentOS.view.Viewport'],
        /**
         * @member {String[]} cls=['agent-os-viewport']
         * @reactive
         */
        cls: ['agent-os-viewport']
    }
}

export default Neo.setupClass(Viewport);

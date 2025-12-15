import BaseViewport from '../../../../../src/container/Viewport.mjs';

/**
 * @class AgentOSStrategy.view.Viewport
 * @extends Neo.container.Viewport
 */
class Viewport extends BaseViewport {
    static config = {
        /**
         * @member {String} className='AgentOSStrategy.view.Viewport'
         * @protected
         */
        className: 'AgentOSStrategy.view.Viewport',
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

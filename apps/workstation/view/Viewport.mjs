import BaseViewport from '../../../src/container/Viewport.mjs';
import Workspace    from './Workspace.mjs';

/**
 * @summary Standalone viewport for the living-data Workstation flagship.
 *
 * The viewport owns only the render root. Workstation owns the state provider, dock document,
 * stores, pane cache, and deterministic tour so the application remains independently bootable.
 *
 * @class Workstation.view.Viewport
 * @extends Neo.container.Viewport
 */
class Viewport extends BaseViewport {
    static config = {
        /**
         * @member {String} className='Workstation.view.Viewport'
         * @protected
         */
        className: 'Workstation.view.Viewport',
        /**
         * @member {String[]} cls=['workstation-viewport']
         */
        cls: ['workstation-viewport'],
        /**
         * @member {Object[]} items
         */
        items: [{
            module: Workspace,
            flex  : 1
        }],
        /**
         * @member {Object} layout
         */
        layout: {ntype: 'vbox', align: 'stretch'}
    }
}

export default Neo.setupClass(Viewport);

import BaseViewport            from '../../../../../src/container/Viewport.mjs';
import MissionControlWorkspace from './MissionControlWorkspace.mjs';

/**
 * @summary Viewport of the Mission Control childapp: the Fleet Manager under its own tour host.
 *
 * This is NOT a dock demo, which is why it stayed behind when the demos left for `examples/`.
 * `MissionControlWorkspace` composes the PRODUCTION `FleetCockpit` and its real dock document and
 * drives FM's own walkthrough over them, so it belongs to the product it tours. Relocating it
 * beside the demos would have made an `examples/` app import the application — the dependency this
 * relocation exists to remove, pointed the other way.
 *
 * One boot mode, so there is no URL branch left: the childapp mounts the tour host and nothing else.
 * The demo modes (`?demo=b`, the `?popout=` / `?workspaceId=` pop-out host) travelled with the
 * workspaces that own them.
 *
 * @class AgentOS.childapps.missioncontrol.view.Viewport
 * @extends Neo.container.Viewport
 */
class Viewport extends BaseViewport {
    static config = {
        /**
         * @member {String} className='AgentOS.childapps.missioncontrol.view.Viewport'
         * @protected
         */
        className: 'AgentOS.childapps.missioncontrol.view.Viewport',
        /**
         * @member {String[]} cls=['agentos-missioncontrol-viewport']
         */
        cls: ['agentos-missioncontrol-viewport'],
        /**
         * @member {Object} items
         */
        items: [{
            module: MissionControlWorkspace,
            flex  : 1
        }],
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'}
    }
}

export default Neo.setupClass(Viewport);

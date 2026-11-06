import BaseViewport       from '../../../src/container/Viewport.mjs';
import WorkspaceContainer from './WorkspaceContainer.mjs';

/**
 * @summary Boots one workspace, or an empty render target for a retained dashboard host.
 * @class Email.view.Viewport
 * @extends Neo.container.Viewport
 */
class Viewport extends BaseViewport {
    static config = {
        /** @member {String} className='Email.view.Viewport' */
        className: 'Email.view.Viewport',
        /** @member {Object} layout={ntype:'fit'} */
        layout: {ntype: 'fit'}
    }

    /**
     * @summary Popup documents must not create another inbox or duplicate draft fields.
     */
    async onConstructed() {
        super.onConstructed();

        const url = await Neo.Main.getByPath({path: 'document.URL', windowId: this.windowId});

        if (this.isDestroyed) {
            return
        }

        if (new URL(url).searchParams.has('dashboardId')) {
            this.addCls('email-popup')
        } else {
            this.add({module: WorkspaceContainer})
        }
    }
}

export default Neo.setupClass(Viewport);

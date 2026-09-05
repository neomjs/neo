import Provider from '../../../state/Provider.mjs';

/**
 * @summary The dock workspace's header-state provider: the engine-owned home of committed item truth,
 * each header's active item, pane contracts, flights and capabilities, which the projected header
 * actions bind to.
 * @description One instance per workspace, owned by it and separate from the workspace's own
 * `stateProvider`: a consumer's provider chain above and on the workspace stays what it was, and the
 * panes below never see this provider. Each projected tab header owns a child of it, so an action's
 * `bind` resolves header truth here first and the consumer's data beyond it — this provider's own
 * parent is the closest provider the WORKSPACE resolves, not the one its parent component would, which
 * is what a component's own provider derives and what an owned, non-component provider must not.
 * {@link Neo.dashboard.dock.projection.HeaderActionPolicy} publishes into it and hands the projection
 * the formatters that read it.
 * @class Neo.dashboard.dock.projection.HeaderStateProvider
 * @extends Neo.state.Provider
 */
class HeaderStateProvider extends Provider {
    static config = {
        /**
         * @member {String} className='Neo.dashboard.dock.projection.HeaderStateProvider'
         * @protected
         */
        className: 'Neo.dashboard.dock.projection.HeaderStateProvider'
    }

    /**
     * The explicit parent when one was set; otherwise the closest provider the owning workspace
     * resolves for itself — its own `stateProvider` or an ancestor's — so a header's bindings reach
     * the consumer's data through the engine's.
     * @returns {Neo.state.Provider|null}
     */
    getParent() {
        return this._parent || this.component?.getStateProvider?.() || null
    }
}

export default Neo.setupClass(HeaderStateProvider);

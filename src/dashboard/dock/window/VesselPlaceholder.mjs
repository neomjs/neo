import Component from '../../../component/Base.mjs';

/**
 * @class Neo.dashboard.dock.window.VesselPlaceholder
 * @extends Neo.component.Base
 *
 * @summary Holds a pane's slot while that pane moves to another window.
 *
 * {@link Neo.dashboard.dock.window.VesselEmbodiment} removes the live pane from its source parent
 * and inserts this component at the same index, so the surrounding layout keeps its shape for the
 * duration of the cross-window settlement instead of collapsing and re-expanding.
 *
 * The visible surface is the framework load mask, driven by {@link Neo.component.Base#isLoading}.
 * That mask paints `background-color: inherit` and `color: inherit` **by design** — it takes its
 * ground and ink from whatever hosts it. This class exists to BE that host: an inline
 * `Neo.create({module: Component, cls: [...]})` has no `className`, and therefore no path a theme
 * sheet can be discovered at, so the mask had nothing to inherit and resolved to the user-agent
 * default — a black panel with white text under every theme. Registering the class gives the
 * surface a themable home; `VesselPlaceholder.scss` and its per-theme values supply the two
 * properties the mask reads.
 */
class VesselPlaceholder extends Component {
    static config = {
        /**
         * @member {String} className='Neo.dashboard.dock.window.VesselPlaceholder'
         * @protected
         */
        className: 'Neo.dashboard.dock.window.VesselPlaceholder',
        /**
         * @member {String} ntype='dock-vessel-placeholder'
         * @protected
         */
        ntype: 'dock-vessel-placeholder',
        /**
         * @member {String[]} baseCls=['neo-dashboard-dock-vessel-placeholder']
         * @protected
         */
        baseCls: ['neo-dashboard-dock-vessel-placeholder'],
        /**
         * The status text the load mask renders while the pane settles in its target window.
         * A config rather than a literal so a consumer can localise or re-word the wait without
         * subclassing. Declared WITHOUT the trailing underscore: `isLoading` is already reactive on
         * {@link Neo.component.Base}, so this overrides the inherited default rather than
         * redefining the config — the framework rejects the underscored form outright.
         * @member {Boolean|String} isLoading='Moving pane to another window…'
         */
        isLoading: 'Moving pane to another window…',
        /**
         * Announced to assistive tech: the slot is reporting a transient state, not offering a
         * control. Preserved from the inline component this class replaces.
         * @member {String} role='status'
         */
        role: 'status'
    }
}

export default Neo.setupClass(VesselPlaceholder);

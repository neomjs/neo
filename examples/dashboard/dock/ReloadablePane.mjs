import Component from '../../../src/component/Base.mjs';

/**
 * @summary The example's `dockReload()` contract carrier: reload means counting — the pane owns
 * its meaning, and the visible counter is the gesture receipt a viewer (and the whitebox e2e)
 * reads without tooling.
 * @class Neo.examples.dashboard.dock.ReloadablePane
 * @extends Neo.component.Base
 */
class ReloadablePane extends Component {
    static config = {
        /**
         * @member {String} className='Neo.examples.dashboard.dock.ReloadablePane'
         * @protected
         */
        className: 'Neo.examples.dashboard.dock.ReloadablePane',
        /**
         * @member {String} html='Strategy'
         */
        html: 'Strategy'
    }

    /**
     * How often the engine's reload action asked this pane to refresh itself.
     * @member {Number} reloadCount=0
     */
    reloadCount = 0

    /**
     * The reload delegation contract: this pane's reload meaning is a visible refresh counter.
     * @returns {void}
     */
    dockReload() {
        this.reloadCount++;
        this.html = `Strategy · reloaded ${this.reloadCount}×`
    }
}

export default Neo.setupClass(ReloadablePane);

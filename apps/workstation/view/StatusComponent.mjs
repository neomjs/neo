import Component from '../../../src/component/Base.mjs';

/**
 * @summary The runtime readout borrows both stores through the inherited root provider.
 * @class Workstation.view.StatusComponent
 * @extends Neo.component.Base
 */
class StatusComponent extends Component {
    static config = {
        /** @member {String} className='Workstation.view.StatusComponent' */
        className: 'Workstation.view.StatusComponent',
        /** @member {String[]} cls */
        cls: ['workstation-statusbar'],
        /** @member {String} flex='none' */
        flex: 'none',
        /** @member {String} reference='status-bar' */
        reference: 'status-bar',
        /** @member {Object} bind Store count configs drive the readout directly. */
        bind: {
            html() {
                const feed = this.getStore('feed'), scale = this.getStore('scale');
                return `<span>20 dock items</span><span>${new Intl.NumberFormat().format(scale.count)} scale rows</span><span>${feed.count}/${feed.maxRecords} feed rows</span><span>${feed.batchSize * 1000 / feed.intervalMs} events/sec</span>`
            }
        }
    }
}

export default Neo.setupClass(StatusComponent);


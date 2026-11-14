import Component from '../../../src/component/Base.mjs';

/**
 * @summary The runtime readout states the facts of the arrangement on screen, from the stores it borrows
 * through the inherited root provider: the operations room's scale and feed, or the planning desk's team,
 * work items and plan.
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
        /** @member {Object} bind The committed perspective and the store count configs drive the readout directly. */
        bind: {
            html(data) {
                if (data.dock.perspective.active === 'planning') {
                    return `<span>${this.getStore('people').count} people</span><span>${this.getStore('workItems').count} work items</span><span>${this.getStore('planTasks').count} plan tasks</span>`
                }

                const feed = this.getStore('feed'), scale = this.getStore('scale');
                return `<span>20 dock items</span><span>${new Intl.NumberFormat().format(scale.count)} scale rows</span><span>${feed.count}/${feed.maxRecords} feed rows</span><span>${feed.batchSize * 1000 / feed.intervalMs} events/sec</span>`
            }
        }
    }
}

export default Neo.setupClass(StatusComponent);


import Panel         from '../../../src/container/Panel.mjs';
import GridContainer from '../../../src/grid/Container.mjs';
import Interventions from '../store/Interventions.mjs';

/**
 * @class AgentOS.view.InterventionPanel
 * @extends Neo.container.Panel
 */
class InterventionPanel extends Panel {
    static config = {
        /**
         * @member {String} className='AgentOS.view.InterventionPanel'
         * @protected
         */
        className: 'AgentOS.view.InterventionPanel',
        /**
         * @member {String} ntype='intervention-panel'
         * @protected
         */
        ntype: 'intervention-panel',
        /**
         * @member {String[]} cls=['agent-panel-intervention']
         */
        cls: ['agent-panel-intervention'],
        /**
         * @member {Object} layout={ntype: 'fit'}
         */
        layout: {ntype: 'fit'},
        /**
         * @member {Object[]} headers
         */
        headers: [{
            dock: 'top',
            cls : ['neo-draggable'],
            text: 'Intervention'
        }],
        /**
         * @member {Object[]} items
         */
        items: [{
            module : GridContainer,
            store  : Interventions,
            columns: [{
                dataField: 'timestamp',
                text     : 'Time',
                width    : 100,
                renderer : ({value}) => {
                    if (!value) return '';
                    return `[${new Intl.DateTimeFormat('default', {
                        hour  : '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                        hour12: false
                    }).format(value)}]`;
                }
            }, {
                dataField: 'message',
                text     : 'Message',
                flex     : 1
            }, {
                dataField: 'priority',
                text     : 'Priority',
                width    : 100,
                renderer : ({value}) => {
                    return {
                        cls : ['agent-priority', `agent-priority-${value}`],
                        text: value
                    };
                }
            }]
        }]
    }
}

export default Neo.setupClass(InterventionPanel);

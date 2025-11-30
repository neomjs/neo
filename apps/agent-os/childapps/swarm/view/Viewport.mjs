import BaseViewport from '../../../../../src/container/Viewport.mjs';

/**
 * @class AgentOS.swarm.view.Viewport
 * @extends Neo.container.Viewport
 */
class Viewport extends BaseViewport {
    static config = {
        className: 'AgentOS.swarm.view.Viewport',
        layout   : {ntype: 'vbox', align: 'stretch'},
        items    : [{
            ntype: 'container',
            flex : 2,
            cls  : ['neo-swarm-grid'],
            style: {
                backgroundColor: '#1e1e1e',
                color          : '#d4d4d4',
                margin         : '10px',
                padding        : '20px',
                borderRadius   : '4px'
            },
            html: '<h2>Swarm Visualization</h2><p>Live agent graph will render here.</p>'
        }, {
            ntype: 'container',
            flex : 1,
            cls  : ['neo-intervention-panel'],
            style: {
                backgroundColor: '#2d2d2d',
                color          : '#e57373',
                margin         : '0 10px 10px 10px',
                padding        : '20px',
                borderRadius   : '4px',
                border         : '1px solid #b71c1c'
            },
            html: '<h2>Intervention Required</h2><p>Derailment logs and recovery chat will appear here.</p>'
        }]
    }
}

export default Neo.setupClass(Viewport);

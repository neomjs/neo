import Component from '../../../src/component/Base.mjs';

/**
 * Target-owned narrative data for Workstation's lightweight resident panes. These are presentation
 * facts only: stores and dock state remain owned by their existing authorities.
 * @type {Object}
 */
const paneStories = Object.freeze({
    activity : {detail: '12 residents reporting', icon: 'fa-wave-square', kicker: 'SYSTEM PULSE',      metric: 'LIVE'},
    alerts   : {detail: '2 require attention',    icon: 'fa-bell',        kicker: 'PRIORITY SIGNALS', metric: '07'},
    audit    : {detail: 'all gates evidenced',    icon: 'fa-shield-alt',  kicker: 'EVIDENCE CHAIN',   metric: '100%'},
    builds   : {detail: '8 parallel checks',      icon: 'fa-cubes',       kicker: 'BUILD FABRIC',     metric: '8/8'},
    commits  : {detail: '5 branches converging',  icon: 'fa-code-branch', kicker: 'CHANGE STREAM',    metric: '+42'},
    console  : {detail: 'semantic ops ready',     icon: 'fa-terminal',    kicker: 'COMMAND PLANE',    metric: 'ARMED'},
    deploys  : {detail: '3 regions synchronized', icon: 'fa-rocket',      kicker: 'FLIGHT DECK',      metric: '03'},
    files    : {detail: 'workspace graph indexed',icon: 'fa-folder-tree', kicker: 'SOURCE SURFACE',   metric: '25K'},
    graph    : {detail: 'dependency edges awake', icon: 'fa-project-diagram', kicker: 'DEPENDENCY GRAPH',  metric: '20K+'},
    inspector: {detail: 'selection follows focus',icon: 'fa-crosshairs',  kicker: 'CONTEXT LENS',     metric: 'LOCK'},
    logs     : {detail: 'zero fatal events',      icon: 'fa-align-left',  kicker: 'STRUCTURED LOGS',  metric: '0 ERR'},
    memory   : {detail: 'pressure stays bounded', icon: 'fa-brain',       kicker: 'MEMORY TELEMETRY',      metric: 'SYNC'},
    metrics  : {detail: 'system envelope stable', icon: 'fa-chart-line',  kicker: 'LIVE METRICS',     metric: '99.9'},
    queues   : {detail: '18 lanes in motion',     icon: 'fa-stream',      kicker: 'TASK PRESSURE',    metric: '18'},
    runtime  : {detail: 'all residents responsive', icon: 'fa-heartbeat', kicker: 'RUNTIME HEALTH',  metric: 'GREEN'},
    security : {detail: 'continuous policy scan', icon: 'fa-lock',        kicker: 'TRUST ENVELOPE',  metric: 'CLEAR'},
    topology : {detail: '20 panes · one identity',icon: 'fa-sitemap',     kicker: 'WORKSPACE SHAPE',  metric: '20'},
    traces   : {detail: '4 active continuations', icon: 'fa-route',       kicker: 'TRACE FABRIC',     metric: '04'}
});


/**
 * @summary Presentation for one lightweight resident; data and docking remain with their owners.
 * @class Workstation.view.ResidentComponent
 * @extends Neo.component.Base
 */
class ResidentComponent extends Component {
    static config = {
        /** @member {String} className='Workstation.view.ResidentComponent' */
        className: 'Workstation.view.ResidentComponent',
        /** @member {String|null} itemId=null The stable dock item represented by this view. */
        itemId: null,
        /** @member {String|null} title=null The catalog's presentation title. */
        title: null
    }

    /**
     * @summary Builds the resident's established markup from its own presentation configuration.
     * @param {Object} config
     */
    construct(config) {
        const {itemId, title} = config,
              story           = paneStories[itemId] || {
                  detail: 'resident operational',
                  icon  : 'fa-circle-nodes',
                  kicker: 'LIVE MODULE',
                  metric: 'READY'
              };

        super.construct({
            ...config,
            cls : ['workstation-pane', 'workstation-placeholder', `workstation-pane-${itemId}`],
            html: `<div class="workstation-resident-card">
                <div class="workstation-resident-kicker"><span></span>${story.kicker}</div>
                <i class="fa ${story.icon} workstation-resident-icon"></i>
                <div class="workstation-resident-metric">${story.metric}</div>
                <div class="workstation-resident-title">${title ?? itemId}</div>
                <div class="workstation-resident-footer">
                    <span>${story.detail}</span><strong>LIVE</strong>
                </div>
                <div class="workstation-resident-wave"><i></i><i></i><i></i><i></i><i></i><i></i></div>
            </div>`
        })
    }
}

export default Neo.setupClass(ResidentComponent);


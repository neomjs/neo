import AgentGrid         from './AgentGrid.mjs';
import DeskStateProvider from './DeskStateProvider.mjs';
import DockMainContainer from '../dock/MainContainer.mjs';
import FeedList          from './FeedList.mjs';
import InspectorPane     from './InspectorPane.mjs';
import MetricsPane       from './MetricsPane.mjs';
import PlanPane          from './PlanPane.mjs';
import ThemeSwitcher     from '../../../src/button/ThemeSwitcher.mjs';

const stateCell = ({value}) => `<span class="neo-example-desk-state neo-example-desk-state-${value}">${value}</span>`;

/**
 * @summary A pane's config: the desk's pane classes, one of them naming the item, so a spec finds a pane by its id.
 * @param {String} id
 * @param {String} title
 * @param {Object} config
 * @returns {Object}
 */
function pane(id, title, config) {
    return {...config, cls: ['neo-example-desk-pane', `neo-example-desk-pane-${id}`, ...config.cls || []], header: {text: title}}
}

/**
 * @summary The dock example's layouts, perspectives and saving, filled with the panes of one operations desk.
 *
 * `examples/dashboard/dock` stays the engine's bare consumer: no theme of its own, no app tokens, a word per pane, so
 * its specs measure what the dock does unstyled. This example inherits all of it and changes only what a visitor
 * sees: ten panes over the stores of {@link Neo.examples.dashboard.desk.DeskStateProvider}, the dark neo theme and
 * the palette the other dock examples share. A selection crosses panes and survives every drag and perspective
 * switch, because it lives in the provider, not in a pane.
 * @class Neo.examples.dashboard.desk.MainContainer
 * @extends Neo.examples.dashboard.dock.MainContainer
 */
class MainContainer extends DockMainContainer {
    static config = {
        /**
         * @member {String} className='Neo.examples.dashboard.desk.MainContainer'
         * @protected
         */
        className: 'Neo.examples.dashboard.desk.MainContainer',
        /**
         * The example-owned palette the other dock examples share, beside the workspace's own dock tokens
         * @member {String[]} additionalThemeFiles=['Neo.examples.dashboard.Palette','Neo.dashboard.Container']
         */
        additionalThemeFiles: ['Neo.examples.dashboard.Palette', 'Neo.dashboard.Container'],
        /**
         * @member {String[]} cls=['neo-example-desk']
         */
        cls: ['neo-example-desk'],
        /**
         * The same ten pane ids as the dock example, each a view of the desk
         * @member {Object} panes
         */
        panes: {
            strategy: pane('strategy', 'Strategy', {module: PlanPane}),
            swarm   : pane('swarm', 'Swarm', {
                module : AgentGrid,
                columns: [
                    {dataField: 'name',  text: 'Agent', width: 110},
                    {dataField: 'state', text: 'State', width: 120, renderer: stateCell},
                    {dataField: 'task',  text: 'Task',  flex : 1, minWidth: 180}
                ]
            }),
            terminal : pane('terminal', 'Terminal', {
                module       : FeedList,
                bind         : {store: 'stores.events'},
                cls          : ['neo-example-desk-terminal'],
                itemFormatter: ({agent, id, kind}) => `<span class="neo-example-desk-prompt">$</span> neo ${kind.replace(' ', '-')} --agent ${agent.toLowerCase()} --run ${1040 + id}`
            }),
            logs     : pane('logs', 'Logs', {
                module       : FeedList,
                bind         : {store: 'stores.events'},
                itemFormatter: ({agent, kind, time}) => `<time>${time}</time> <b>${agent}</b> ${kind}`
            }),
            inspector: pane('inspector', 'Inspector', {module: InspectorPane}),
            metrics  : pane('metrics', 'Metrics', {module: MetricsPane}),
            timeline : pane('timeline', 'Timeline', {
                module       : FeedList,
                bind         : {store: 'stores.events'},
                itemFormatter: ({text, time}) => `<time>${time}</time> ${text}`
            }),
            agents   : pane('agents', 'Agents', {
                module : AgentGrid,
                columns: [
                    {dataField: 'name',   text: 'Agent',  width: 110},
                    {dataField: 'role',   text: 'Role',   width: 110},
                    {dataField: 'tokens', text: 'Tokens', width: 100, renderer: ({value}) => value.toLocaleString('en-US')},
                    {dataField: 'merged', text: 'Merged', flex : 1}
                ]
            }),
            alerts   : pane('alerts', 'Alerts', {
                module       : FeedList,
                bind         : {store: 'stores.alerts'},
                itemFormatter: ({severity, text}) => `<span class="neo-example-desk-severity neo-example-desk-severity-${severity}">${severity}</span> ${text}`
            }),
            history  : pane('history', 'History', {
                module       : FeedList,
                bind         : {store: 'stores.runs'},
                itemFormatter: ({agent, minutes, result, task}) => `<b>${agent}</b> ${task} <span class="neo-example-desk-result-${result}">${result}</span> <time>${minutes} min</time>`
            })
        },
        /**
         * The desk's data and its selected agent, beside the `dock` keys the workspace publishes into it
         * @member {Object} stateProvider={module: DeskStateProvider}
         */
        stateProvider: {module: DeskStateProvider}
    }

    /**
     * The desk saves its snapshots apart from the dock example's
     * @member {String} layoutCollectionStorageKey='neo.examples.dashboard.desk.layoutCollection'
     */
    layoutCollectionStorageKey = 'neo.examples.dashboard.desk.layoutCollection'

    /**
     * The dock example's toolbar, with one line that says what to try
     * @returns {Object}
     */
    createPerspectiveToolbar() {
        let toolbar = super.createPerspectiveToolbar();

        toolbar.items.push({
            ntype: 'component',
            cls  : ['neo-example-desk-hint'],
            flex : 1,
            text : 'Pick an agent in Swarm · drag any tab into another zone · switch perspectives'
        }, {
            module: ThemeSwitcher,
            flex  : 'none'
        });

        return toolbar
    }
}

export default Neo.setupClass(MainContainer);

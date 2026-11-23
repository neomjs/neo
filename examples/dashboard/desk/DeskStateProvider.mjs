import StateProvider from '../../../src/state/Provider.mjs';
import Store         from '../../../src/data/Store.mjs';

const
    names  = ['Atlas', 'Beacon', 'Cedar', 'Delta', 'Ember', 'Flint', 'Garnet', 'Harbor', 'Iris', 'Juniper', 'Kestrel', 'Lumen'],
    roles  = ['Planner', 'Builder', 'Builder', 'Reviewer', 'Builder', 'Tester'],
    states = ['working', 'working', 'reviewing', 'working', 'idle', 'blocked'],
    tasks  = [
        'Build the export dialog', 'Review the search box', 'Test the login form', 'Plan the onboarding tour',
        'Build the settings page', 'Fix the date picker', 'Review the price grid', 'Measure the start time',
        'Build the share menu', 'Test the file upload', 'Review the dock tabs', 'Plan the release notes'
    ],
    kinds  = ['claimed', 'pushed', 'review', 'checks passed', 'merged', 'checks failed'];

/**
 * @summary Twelve agents, the same on every load: each field is a function of the agent's index.
 * @returns {Object[]}
 */
function createAgents() {
    return names.map((name, index) => ({
        id    : name.toLowerCase(),
        merged: (index * 5 + 2) % 7,
        name,
        role  : roles[index % roles.length],
        state : states[index % states.length],
        task  : tasks[index],
        tokens: 18000 + (index * 7919) % 46000
    }))
}

/**
 * @summary Thirty events of one working day, from 09:00 in steps of 17 minutes, each by one of the agents.
 * @returns {Object[]}
 */
function createEvents() {
    return Array.from({length: 30}, (_, index) => {
        let minutes = 9 * 60 + index * 17,
            agent   = names[index * 5 % names.length],
            kind    = kinds[index % kinds.length];

        return {
            id  : index + 1,
            agent,
            kind,
            text: `${agent} ${kind} · ${tasks[index * 7 % tasks.length].toLowerCase()}`,
            time: `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
        }
    }).reverse()
}

/**
 * @summary The day's finished runs: what each agent shipped or gave up, and how long it took.
 * @returns {Object[]}
 */
function createRuns() {
    return Array.from({length: 12}, (_, index) => ({
        id     : index + 1,
        agent  : names[(index * 7 + 3) % names.length],
        minutes: 12 + (index * 13) % 75,
        result : index % 5 === 4 ? 'failed' : index % 3 === 2 ? 'closed' : 'merged',
        task   : tasks[(index * 5 + 1) % tasks.length]
    }))
}

/**
 * @summary The open alerts, most severe first.
 * @returns {Object[]}
 */
function createAlerts() {
    return [
        {id: 1, severity: 'critical', text: 'Flint is blocked: the date picker spec fails on every run'},
        {id: 2, severity: 'warning',  text: 'Three reviews wait longer than an hour'},
        {id: 3, severity: 'warning',  text: 'Garnet used 80% of today\'s token budget'},
        {id: 4, severity: 'info',     text: 'Release notes are due at 17:00'}
    ]
}

/**
 * @summary The operations desk the dock example arranges: one data set behind all ten panes.
 *
 * The workspace publishes its own header state under `dock` into whichever provider the consumer configures, so this
 * provider holds the desk beside it. `agentId` is the selected agent: every pane that selects writes it, and the
 * Inspector reads it, so a selection crosses panes and outlives any rearrangement of them.
 * @class Neo.examples.dashboard.desk.DeskStateProvider
 * @extends Neo.state.Provider
 */
class DeskStateProvider extends StateProvider {
    static config = {
        /**
         * @member {String} className='Neo.examples.dashboard.desk.DeskStateProvider'
         * @protected
         */
        className: 'Neo.examples.dashboard.desk.DeskStateProvider',
        /**
         * The first frame opens on a selected agent, so the Inspector never starts empty
         * @member {Object} data={agentId: 'cedar'}
         */
        data: {
            agentId: 'cedar'
        },
        /**
         * @member {Object} stores
         */
        stores: {
            agents: {
                module     : Store,
                data       : createAgents(),
                keyProperty: 'id',
                model      : {
                    fields: [
                        {name: 'id'},
                        {name: 'merged', type: 'Integer'},
                        {name: 'name'},
                        {name: 'role'},
                        {name: 'state'},
                        {name: 'task'},
                        {name: 'tokens', type: 'Integer'}
                    ]
                }
            },
            alerts: {
                module     : Store,
                data       : createAlerts(),
                keyProperty: 'id',
                model      : {fields: [{name: 'id', type: 'Integer'}, {name: 'severity'}, {name: 'text'}]}
            },
            events: {
                module     : Store,
                data       : createEvents(),
                keyProperty: 'id',
                model      : {
                    fields: [
                        {name: 'agent'},
                        {name: 'id', type: 'Integer'},
                        {name: 'kind'},
                        {name: 'text'},
                        {name: 'time'}
                    ]
                }
            },
            runs: {
                module     : Store,
                data       : createRuns(),
                keyProperty: 'id',
                model      : {
                    fields: [
                        {name: 'agent'},
                        {name: 'id', type: 'Integer'},
                        {name: 'minutes', type: 'Integer'},
                        {name: 'result'},
                        {name: 'task'}
                    ]
                }
            }
        }
    }
}

export default Neo.setupClass(DeskStateProvider);

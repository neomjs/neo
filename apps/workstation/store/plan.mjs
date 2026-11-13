/**
 * @module Workstation.store.plan
 * @summary The plan the planning arrangement is seeded with: one team, its work items and its release plan.
 *
 * Plain tables, no class: the stores turn the rows into records. Every date is a whole-day offset from one
 * plan day, so the same day always yields the same plan, and the plan stays around today on any boot. The
 * work items are what the team does this fortnight; the release plan is the project they serve, one level
 * up, so no task is listed twice.
 *
 * The release plan is tight: each task starts where its latest predecessor ends. The Gantt chart's cascade
 * keeps successors at exactly that start, so a seeded slack would collapse at the first edit.
 */

/**
 * @summary Midnight UTC of the day that holds `now`: the day every offset in this module counts from.
 * @param {Date} [now=new Date()]
 * @returns {Date}
 */
export function planDay(now=new Date()) {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

/**
 * The team. Each person is one row of the schedule.
 * @type {Object[]}
 */
export const people = [
    {id: 'maya',  name: 'Maya Chen',    role: 'Product lead'},
    {id: 'jonas', name: 'Jonas Berg',   role: 'Designer'},
    {id: 'priya', name: 'Priya Nair',   role: 'Frontend'},
    {id: 'tom',   name: 'Tom Okafor',   role: 'Backend'},
    {id: 'lena',  name: 'Lena Fischer', role: 'Quality'},
    {id: 'sam',   name: 'Sam Rivera',   role: 'Marketing'}
];

/**
 * The work items, in board order. `start` and `days` are whole days from the plan day.
 * @type {Object[]}
 */
export const workItemRows = [
    {id: 'wi-1',  title: 'Interview five customers',     person: 'maya',  status: 'done',        start: -7, days: 3, progress: 100},
    {id: 'wi-2',  title: 'Write the release brief',      person: 'maya',  status: 'done',        start: -4, days: 2, progress: 100},
    {id: 'wi-3',  title: 'Sketch the booking flow',      person: 'jonas', status: 'done',        start: -6, days: 3, progress: 100},
    {id: 'wi-4',  title: 'Design the account page',      person: 'jonas', status: 'review',      start: -3, days: 4, progress: 90},
    {id: 'wi-5',  title: 'Build the booking screens',    person: 'priya', status: 'in-progress', start: -2, days: 5, progress: 45},
    {id: 'wi-6',  title: 'Build the account page',       person: 'priya', status: 'ready',       start: 3,  days: 4, progress: 0},
    {id: 'wi-7',  title: 'Add the availability API',     person: 'tom',   status: 'in-progress', start: -4, days: 5, progress: 60},
    {id: 'wi-8',  title: 'Fix the double-booking bug',   person: 'tom',   status: 'review',      start: -1, days: 2, progress: 80},
    {id: 'wi-9',  title: 'Migrate customer accounts',    person: 'tom',   status: 'ready',       start: 2,  days: 4, progress: 0},
    {id: 'wi-10', title: 'Write the test plan',          person: 'lena',  status: 'review',      start: -3, days: 3, progress: 85},
    {id: 'wi-11', title: 'Test bookings on phones',      person: 'lena',  status: 'backlog',     start: 5,  days: 3, progress: 0},
    {id: 'wi-12', title: 'Draft the launch email',       person: 'sam',   status: 'ready',       start: 2,  days: 3, progress: 0},
    {id: 'wi-13', title: 'Record the walkthrough video', person: 'sam',   status: 'backlog',     start: 6,  days: 3, progress: 0},
    {id: 'wi-14', title: 'Plan the launch webinar',      person: 'maya',  status: 'backlog',     start: 4,  days: 3, progress: 0},
    {id: 'wi-15', title: 'Review the beta feedback',     person: 'maya',  status: 'in-progress', start: -1, days: 3, progress: 30}
];

/**
 * The release plan: four phases and their tasks. A milestone has no `days`.
 * @type {Object[]}
 */
export const releaseTaskRows = [
    {id: 'discovery',      title: 'Discovery',                parent: null,        start: -12, days: 4},
    {id: 'research',       title: 'Customer research',        parent: 'discovery', start: -12, days: 4},
    {id: 'brief',          title: 'Release brief signed off', parent: 'discovery', start: -8,  milestone: true},
    {id: 'design',         title: 'Design',                   parent: null,        start: -8,  days: 9},
    {id: 'flow-design',    title: 'Booking flow design',      parent: 'design',    start: -8,  days: 4},
    {id: 'account-design', title: 'Account page design',      parent: 'design',    start: -4,  days: 5},
    {id: 'build',          title: 'Build',                    parent: null,        start: -8,  days: 13},
    {id: 'service',        title: 'Booking service',          parent: 'build',     start: -8,  days: 7},
    {id: 'screens',        title: 'Booking screens',          parent: 'build',     start: -4,  days: 7},
    {id: 'migration',      title: 'Account migration',        parent: 'build',     start: 1,   days: 4},
    {id: 'launch',         title: 'Launch',                   parent: null,        start: 5,   days: 7},
    {id: 'beta-test',      title: 'Beta on phones',           parent: 'launch',    start: 5,   days: 4},
    {id: 'fixes',          title: 'Fix beta findings',        parent: 'launch',    start: 9,   days: 3},
    {id: 'campaign',       title: 'Launch campaign',          parent: 'launch',    start: 5,   days: 6},
    {id: 'launch-day',     title: 'Launch day',               parent: 'launch',    start: 12,  milestone: true}
];

/**
 * The finish-to-start links of the release plan, as `[predecessor, successor]`.
 * @type {String[][]}
 */
export const releaseLinkRows = [
    ['research',       'brief'],
    ['brief',          'flow-design'],
    ['brief',          'service'],
    ['flow-design',    'account-design'],
    ['flow-design',    'screens'],
    ['account-design', 'migration'],
    ['service',        'beta-test'],
    ['screens',        'beta-test'],
    ['migration',      'beta-test'],
    ['migration',      'campaign'],
    ['beta-test',      'fixes'],
    ['fixes',          'launch-day'],
    ['campaign',       'launch-day']
];

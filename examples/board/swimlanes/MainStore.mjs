import CardModel from './CardModel.mjs';
import Store     from '../../../src/data/Store.mjs';

// [team, status, title, assignee, tag, progress]: a product team's quarter, the same 40 cards on every load
const cards = [
    ['Design',   'backlog',     'Illustrations for the empty states',     null,     'ux'],
    ['Design',   'backlog',     'Motion spec for the side drawer',        null,     'ux'],
    ['Design',   'ready',       'Icon set for the settings page',         'Robin',  'ux'],
    ['Design',   'ready',       'Audit the colour contrast',              'Avery',  'a11y'],
    ['Design',   'in-progress', 'Redesign the onboarding flow',           'Avery',  'ux',          60],
    ['Design',   'in-progress', 'A dark theme for the charts',            'Robin',  'ux',          35],
    ['Design',   'review',      'Usability test of the checkout',         'Avery',  'research',    90],
    ['Design',   'done',        'Design tokens for the forms',            'Robin',  'ux',          100],
    ['Design',   'done',        'Logo lockups for the app stores',        'Avery',  'brand',       100],
    ['Web',      'backlog',     'Infinite scroll for the activity feed',  null,     'frontend'],
    ['Web',      'backlog',     'Cookie consent, second version',         null,     'frontend'],
    ['Web',      'ready',       'Fix the date picker in Safari',          'Casey',  'bug'],
    ['Web',      'ready',       'Server rendering for the pricing page',  'Blake',  'frontend'],
    ['Web',      'in-progress', 'Lazy-load the dashboard widgets',        'Blake',  'performance', 45],
    ['Web',      'in-progress', 'Keyboard shortcuts for the editor',      'Casey',  'frontend',    70],
    ['Web',      'in-progress', 'Accessible tabs on the account page',    'Casey',  'a11y',        20],
    ['Web',      'review',      'Move the forms to the new validator',    'Blake',  'frontend',    85],
    ['Web',      'done',        'Cut the bundle by a fifth',              'Blake',  'performance', 100],
    ['Web',      'done',        'An offline banner',                      'Casey',  'frontend',    100],
    ['Mobile',   'backlog',     'A widget for today\'s tasks',            null,     'mobile'],
    ['Mobile',   'ready',       'Deep links into a project',              'Emery',  'mobile'],
    ['Mobile',   'ready',       'Tablet layout for the inbox',            'Devon',  'mobile'],
    ['Mobile',   'in-progress', 'Biometric login on Android',             'Devon',  'security',    50],
    ['Mobile',   'in-progress', 'Drafts that work offline',               'Emery',  'mobile',      30],
    ['Mobile',   'review',      'Crash on rotation in the camera view',   'Devon',  'bug',         95],
    ['Mobile',   'review',      'A share sheet for reports',              'Emery',  'mobile',      80],
    ['Mobile',   'done',        'Push notification settings',             'Emery',  'mobile',      100],
    ['Mobile',   'done',        'A faster cold start',                    'Devon',  'performance', 100],
    ['Platform', 'backlog',     'Retire the v1 endpoints',                null,     'backend'],
    ['Platform', 'backlog',     'A cost report per team',                 null,     'backend'],
    ['Platform', 'ready',       'Tracing across services',                'Harper', 'backend'],
    ['Platform', 'in-progress', 'Rate limits for the public API',         'Finley', 'backend',     55],
    ['Platform', 'in-progress', 'Upgrade the queue workers',              'Harper', 'backend',     25],
    ['Platform', 'review',      'A feature flag service',                 'Finley', 'backend',     75],
    ['Platform', 'done',        'Rotate the database credentials',        'Finley', 'security',    100],
    ['Platform', 'done',        'A nightly restore test of the backups',  'Harper', 'backend',     100],
    [null,       'backlog',     'Triage the support inbox',               null,     'support'],
    [null,       'backlog',     'Spike: live collaboration',              null,     'research'],
    [null,       'ready',       'Update the security policy',             null,     'security'],
    [null,       'ready',       'Notes from the customer interviews',     null,     'research']
];

/**
 * @summary The team board's 40 cards: four teams and four cards no team has taken yet.
 * @description Each team's cards spread over the five columns, so every swimlane shows several. `order` is left
 * unset: the board numbers each column when it loads.
 * @class Neo.examples.board.swimlanes.MainStore
 * @extends Neo.data.Store
 */
class MainStore extends Store {
    static config = {
        /**
         * @member {String} className='Neo.examples.board.swimlanes.MainStore'
         * @protected
         */
        className: 'Neo.examples.board.swimlanes.MainStore',
        /**
         * @member {String} keyProperty='id'
         */
        keyProperty: 'id',
        /**
         * @member {Neo.data.Model} model=CardModel
         */
        model: CardModel
    }

    /**
     * @summary Seeds the cards once, unless records were passed in.
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        if (!me.items?.length) {
            me.add(cards.map(([team, status, title, assignee, tag, progress], index) => ({
                id       : index + 1,
                assignees: assignee ? [assignee] : [],
                progress,
                status,
                tags     : [tag],
                team,
                title
            })))
        }
    }
}

export default Neo.setupClass(MainStore);

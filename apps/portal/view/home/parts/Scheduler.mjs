import FeatureSection from '../FeatureSection.mjs';

/**
 * @summary The home's second component proof: a resource scheduler, new in Engine 14, beside the code that builds it.
 * @class Portal.view.home.parts.Scheduler
 * @extends Portal.view.home.FeatureSection
 */
class Scheduler extends FeatureSection {
    static config = {
        /**
         * @member {String} className='Portal.view.home.parts.Scheduler'
         * @protected
         */
        className: 'Portal.view.home.parts.Scheduler',
        /**
         * @member {String[]} cls=['portal-home-parts-scheduler']
         * @reactive
         */
        cls: ['portal-home-parts-scheduler'],
        /**
         * @member {String} headline='Scheduler'
         * @reactive
         */
        headline: 'Scheduler',
        /**
         * @member {String} learnMoreRoute='#/learn/guides/datahandling/Scheduler'
         * @reactive
         */
        learnMoreRoute: '#/learn/guides/datahandling/Scheduler',
        /**
         * @member {Object[]} links
         * @reactive
         */
        links: [
            {route: '#/examples/grid-table', text: 'Grids'},
            {route: '#/examples/forms',      text: 'Forms'},
            {route: '#/examples/gantt',      text: 'Gantt'},
            {route: '#/examples/board',      text: 'Task Board'},
            {route: '#/examples/calendar',   text: 'Calendar'},
            {route: '#/examples/dashboard',  text: 'Docking'}
        ],
        /**
         * @member {String} livePreviewCode
         */
        livePreviewCode: [
            "import Scheduler from '../scheduler/Container.mjs';",
            "",
            "const rooms = ['Recording Studio', 'Mixing Suite', 'Mastering',",
            "               'Rehearsal Room', 'Vocal Booth', 'Live Room', 'Edit Bay',",
            "               'Podcast Studio'].map((name, i) => ({id: i + 1, name}));",
            "",
            "const at = hour => `2026-11-23T${String(hour).padStart(2, '0')}:00:00Z`;",
            "",
            "// [room, from, to, title]",
            "const bookings = [",
            "    [1,  8, 12, 'Quartet Recording'], [1, 14, 18, 'Film Score'],",
            "    [2,  9, 13, 'Score Mix'],         [2, 15, 19, 'Album Mix'],",
            "    [3, 10, 14, 'Vinyl Master'],      [3, 15, 19, 'Remaster'],",
            "    [4,  8, 11, 'String Rehearsal'],  [4, 13, 17, 'Big Band'],",
            "    [5,  9, 12, 'Voice Over'],        [5, 14, 17, 'Audiobook'],",
            "    [6, 11, 16, 'Live Session'],      [7,  8, 11, 'Dialogue Edit'],",
            "    [7, 12, 18, 'Trailer Cut'],       [8, 10, 13, 'Interview']",
            "].map(([resourceId, from, to, title], i) => ({",
            "    id: i + 1, resourceId, title, startDate: at(from), endDate: at(to)",
            "}));",
            "",
            "class MainView extends Scheduler {",
            "    static config = {",
            "        className      : 'Portal.view.HomeScheduler',",
            "        eventStore     : {data: bookings},",
            "        resourceColumns: [{dataField: 'name', text: 'Room', width: 150}],",
            "        rowHeight      : 64,",
            "        store          : {data: rooms, model: {",
            "            fields: [{name: 'id'}, {name: 'name'}]}},",
            "        timeAxis       : {start: at(7), end: at(20), timeZone: 'UTC',",
            "                          tickUnit: 'hour', pxPerMinute: 0.7}",
            "    }",
            "}",
            "MainView = Neo.setupClass(MainView);"
        ].join('\n'),
        /**
         * @member {String} paragraph
         */
        paragraph: [
            'Rooms are records, bookings are records, and an edit is a record change. Drag a booking to move it, ',
            'pull an edge to resize it, double-click to edit it. The code next to it is the whole scheduler; ',
            'change its time axis and watch it follow.'
        ].join(''),
        /**
         * @member {Boolean} sideBySide=true
         */
        sideBySide: true,
        /**
         * @member {String} subHeadline='New in Engine 14'
         * @reactive
         */
        subHeadline: 'New in Engine 14',
        /**
         * @member {String} textContainerPosition='top'
         * @reactive
         */
        textContainerPosition: 'top'
    }
}

export default Neo.setupClass(Scheduler);

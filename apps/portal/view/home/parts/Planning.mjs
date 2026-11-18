import FeatureSection from '../FeatureSection.mjs';

/**
 * @summary The home's planning proof, new in Engine 14: one release plan as a Gantt chart over a task board,
 * both on one store, beside the code that builds them. A card moved to another column recolours its bar, and a
 * moved bar takes its successors along.
 * @class Portal.view.home.parts.Planning
 * @extends Portal.view.home.FeatureSection
 */
class Planning extends FeatureSection {
    static config = {
        /**
         * @member {String} className='Portal.view.home.parts.Planning'
         * @protected
         */
        className: 'Portal.view.home.parts.Planning',
        /**
         * @member {String[]} cls=['portal-home-parts-planning']
         * @reactive
         */
        cls: ['portal-home-parts-planning'],
        /**
         * @member {String} headline='Gantt & Task Board'
         * @reactive
         */
        headline: 'Gantt & Task Board',
        /**
         * @member {String} learnMoreRoute='#/learn/guides/datahandling/Gantt'
         * @reactive
         */
        learnMoreRoute: '#/learn/guides/datahandling/Gantt',
        /**
         * @member {Object[]} links
         * @reactive
         */
        links: [
            {route: '#/examples/gantt',      text: 'More Gantt charts'},
            {route: '#/examples/board',      text: 'Task Boards'},
            {route: '#/examples/grid-table', text: 'Grids'},
            {route: '#/examples/forms',      text: 'Forms'},
            {route: '#/examples/scheduler',  text: 'Scheduler'},
            {route: '#/examples/calendar',   text: 'Calendar'},
            {route: '#/examples/dashboard',  text: 'Docking'}
        ],
        /**
         * @member {String} livePreviewCode
         */
        livePreviewCode: [
            "import Board     from '../board/Container.mjs';",
            "import Container from '../container/Base.mjs';",
            "import Gantt     from '../gantt/Container.mjs';",
            "import TaskModel from '../gantt/TaskModel.mjs';",
            "import TaskStore from '../gantt/TaskStore.mjs';",
            "",
            "const colors = {'To do': '#9ab', Doing: '#48f', Review: '#fa0', Done: '#2c6'};",
            "const day    = n => `2026-11-${String(n).padStart(2, '0')}`;",
            "let phase; // rows: [title, from, to, status, % done, who] · no status: a phase",
            "const tasks = [",
            "    ['Design',         2,  9],",
            "    ['Wireframes',     2,  4, 'Done',   100, 'Ana Ruiz'],",
            "    ['Visual design',  4,  6, 'Done',   100, 'Ben Okoro'],",
            "    ['Prototype',      5,  9, 'Review',  90, 'Ana Ruiz'],",
            "    ['Build',          9, 19],",
            "    ['Data layer',     9, 12, 'Doing',   60, 'Cy Tran'],",
            "    ['Grid views',    10, 13, 'Doing',   40, 'Dee Marsh'],",
            "    ['Scheduling',    12, 16, 'To do',    0, 'Ben Okoro'],",
            "    ['Launch',        17, 21],",
            "    ['Load test',     17, 19, 'To do',    0, 'Cy Tran'],",
            "    ['Go live',       19, 21, 'To do',    0, 'Ana Ruiz']",
            "].map(([title, from, to, status, progress, assignees], i) => ({",
            "    id: `${i}`, title, status, progress, assignees, startDate: day(from), endDate: day(to),",
            "    isLeaf: !!status, collapsed: false, parentId: status ? phase : (phase = `${i}`, null)",
            "}));",
            "const links = [[1, 2], [2, 3], [3, 5], [3, 6], [5, 7], [6, 7], [7, 9], [9, 10]]",
            "    .map(([fromId, toId], id) => ({id, fromId, toId}));",
            "const fields = ['status', 'progress', 'order', 'assignees'].map(name => ({name}));",
            "",
            "class MainView extends Container {",
            "    static config = {",
            "        className    : 'Portal.view.HomePlanning',",
            "        layout       : {ntype: 'vbox', align: 'stretch'},",
            "        stateProvider: {stores: {plan: {module: TaskStore, data: tasks,",
            "                                        model: {module: TaskModel, fields}}}},",
            "        items: [{",
            "            module: Gantt, bind: {store: 'stores.plan'}, dependencyStore: {data: links},",
            "            height: 366, rowHeight: 26, percentDoneField: 'progress',",
            "            barRenderer: ({bar}, {vdom}) => {vdom.style.background = colors[bar.status]},",
            "            taskColumns: [{type: 'tree', dataField: 'title', text: 'Task', width: 160}],",
            "            timeAxis   : {start: day(2), end: day(22), tickUnit: 'day', pxPerMinute: .018}",
            "        }, {",
            "            module : Board, bind: {store: 'stores.plan'}, flex: 1,",
            "            columns: Object.entries(colors).map(([status, color]) => ({status, color}))",
            "        }]",
            "    }",
            "}",
            "MainView = Neo.setupClass(MainView);"
        ].join('\n'),
        /**
         * @member {String} paragraph
         */
        paragraph: [
            'One store holds the plan; the Gantt chart and the board both show it. Drag a card to Done and its bar ',
            'turns green; move a bar and its successors follow. The code next to it is all of it; change it and ',
            'both views follow.'
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

export default Neo.setupClass(Planning);

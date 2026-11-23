import FeatureSection from '../FeatureSection.mjs';

/**
 * @summary The home's planning proof, new in version 14: one release plan as a Gantt chart over a task board,
 * both on one store, built by the snippet behind its Source tab. The selected card's bar is highlighted, a card moved to
 * another column recolours its bar, and a moved bar takes its successors along.
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
         * @member {String} learnMoreText='The Gantt guide'
         * @reactive
         */
        learnMoreText: 'The Gantt guide',
        /**
         * @member {Object[]} links
         * @reactive
         */
        links: [
            {route: '#/examples/gantt',      text: 'More Gantt charts'},
            {route: '#/examples/board',      text: 'Task Boards'},
            {route: '#/examples/grid',       text: 'Grids'},
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
            "].map(([title, from, to, status, progress, assignees], i) => ({id: `${i}`, title, status,",
            "    progress, assignees, startDate: day(from), endDate: day(to), isLeaf: !!status,",
            "    collapsed: false, parentId: status ? phase : (phase = `${i}`, null)}));",
            "const links = [[1, 2], [2, 3], [3, 5], [3, 6], [5, 7], [6, 7], [7, 9], [9, 10]]",
            "    .map(([fromId, toId], id) => ({id, fromId, toId}));",
            "const fields = ['status', 'progress', 'order', 'assignees'].map(name => ({name}));",
            "const plan   = {module: TaskStore, data: tasks, model: {module: TaskModel, fields}};",
            "",
            "class MainView extends Container {",
            "    static config = {",
            "        className: 'Portal.view.HomePlanning', stateProvider: {stores: {plan}},",
            "        layout: {ntype: 'vbox', align: 'stretch'}, items: [{",
            "            module: Gantt, bind: {store: 'stores.plan'}, dependencyStore: {data: links},",
            "            height: 366, rowHeight: 26, percentDoneField: 'progress',",
            "            barRenderer: ({bar}, {vdom}) => { // its status colour; the tree names the task",
            "                vdom.style.background = colors[bar.status]; return ''},",
            "            taskColumns: [{type: 'tree', dataField: 'title', text: 'Task', width: 160}],",
            "            timeAxis   : {start: day(2), end: day(22), tickUnit: 'day', pxPerMinute: .025},",
            "            timelineColumnConfig: {highlightedRecordIds: ['3']} // the selected card's bar",
            "        }, {",
            "            module: Board, bind: {store: 'stores.plan'}, flex: 1,",
            "            columns: Object.entries(colors).map(([status, color]) => ({status, color})),",
            "            selectionModel: {items: ['3']}, listeners: {selectionChange({selection}) {",
            "                this.parent.items[0].timelineColumn.highlightedRecordIds = selection}}",
            "        }]",
            "    }",
            "}",
            "export default Neo.setupClass(MainView);"
        ].join('\n'),
        /**
         * @member {String} paragraph
         */
        paragraph: [
            'New in version 14, MIT-licensed. One store holds the plan, and the Gantt chart and the board both ',
            'show it: drag a card to Done and its bar turns green, move a bar and its successors follow. Change ',
            'the code and both follow.'
        ].join(''),
        /**
         * @member {String} subHeadline='One Store · 48 Lines of Code'
         * @reactive
         */
        subHeadline: 'One Store · 48 Lines of Code'
    }
}

export default Neo.setupClass(Planning);

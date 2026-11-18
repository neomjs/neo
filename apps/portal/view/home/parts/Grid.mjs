import FeatureSection from '../FeatureSection.mjs';

/**
 * @summary The home's first component proof: a data grid on 50,000 records beside the code that builds it.
 * @class Portal.view.home.parts.Grid
 * @extends Portal.view.home.FeatureSection
 */
class Grid extends FeatureSection {
    static config = {
        /**
         * @member {String} className='Portal.view.home.parts.Grid'
         * @protected
         */
        className: 'Portal.view.home.parts.Grid',
        /**
         * @member {String[]} cls=['portal-home-parts-grid']
         * @reactive
         */
        cls: ['portal-home-parts-grid'],
        /**
         * @member {String} headline='Data Grid'
         * @reactive
         */
        headline: 'Data Grid',
        /**
         * @member {String} learnMoreRoute='#/learn/guides/datahandling/Grids'
         * @reactive
         */
        learnMoreRoute: '#/learn/guides/datahandling/Grids',
        /**
         * @member {Object[]} links
         * @reactive
         */
        links: [
            {route: '#/examples/grid-table', text: 'More grids'},
            {route: '#/examples/forms',      text: 'Forms'},
            {route: '#/examples/scheduler',  text: 'Scheduler'},
            {route: '#/examples/gantt',      text: 'Gantt'},
            {route: '#/examples/board',      text: 'Task Board'},
            {route: '#/examples/calendar',   text: 'Calendar'},
            {route: '#/examples/dashboard',  text: 'Docking'}
        ],
        /**
         * @member {String} livePreviewCode
         */
        livePreviewCode: [
            "import GridContainer from '../grid/Container.mjs';",
            "",
            "const data = Array.from({length: 50000}, (_, i) => ({",
            "    id     : i + 1,",
            "    account: `Account ${i + 1}`,",
            "    region : ['EMEA', 'Americas', 'APAC'][i % 3],",
            "    sales  : 100000 + Math.round(Math.random() * 900000),",
            "    quota  : Math.round(Math.random() * 100)",
            "}));",
            "",
            "const columns = [",
            "    {type: 'index', dataField: 'id', text: '#', width: 60},",
            "    {dataField: 'account', text: 'Account', width: 180},",
            "    {dataField: 'region', text: 'Region', width: 120},",
            "    {type: 'currency', dataField: 'sales', text: 'Sales', width: 140},",
            "    {type: 'progress', dataField: 'quota', text: 'Quota', width: 190}",
            "];",
            "",
            "class MainView extends GridContainer {",
            "    static config = {",
            "        className: 'Portal.view.HomeGrid',",
            "        columns,",
            "        store    : {",
            "            data,",
            "            model: {fields: columns.map(c => ({name: c.dataField}))}",
            "        }",
            "    }",
            "}",
            "MainView = Neo.setupClass(MainView);"
        ].join('\n'),
        /**
         * @member {String} paragraph
         */
        paragraph: [
            'The code next to it is the whole grid: 50,000 records, currency and progress cells, a sort on every ',
            'header. It runs in a worker, so scrolling never waits for the page. Change the code and the grid ',
            'follows, or move it into its own window.'
        ].join(''),
        /**
         * @member {Boolean} sideBySide=true
         */
        sideBySide: true,
        /**
         * @member {String} subHeadline='50,000 Rows · 29 Lines'
         * @reactive
         */
        subHeadline: '50,000 Rows · 29 Lines',
        /**
         * @member {String} textContainerPosition='top'
         * @reactive
         */
        textContainerPosition: 'top'
    }
}

export default Neo.setupClass(Grid);

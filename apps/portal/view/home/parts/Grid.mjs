import FeatureSection from '../FeatureSection.mjs';

/**
 * @summary The home's grid proof: 300 records under a live feed, beside the code that builds the grid and the
 * feed. Prices tick, changes turn green or red, and each row draws its own trend.
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
            "const pick  = (list, i) => list[i % list.length];",
            "const head  = ['Nova', 'Lumi', 'Astra', 'Verta', 'Kine', 'Orbi', 'Soli', 'Tera'],",
            "      tail  = ['tek', 'cor', 'dyne', 'gen', 'lux', 'nix', 'wave'],",
            "      trade = ['Energy', 'Robotics', 'Logistics', 'Biotech', 'Aerospace'];",
            "// A random walk: every step moves the price by up to 2.5 %",
            "const walk  = (price, steps) =>",
            "    Array.from({length: steps}, () => price *= 1 + (Math.random() - .5) / 20);",
            "",
            "const data = Array.from({length: 300}, (_, id) => {",
            "    const trend = walk(20 + Math.random() * 480, 24), price = trend.at(-1), [open] = trend;",
            "    return {id, name: `${pick(head, id)}${pick(tail, id)} ${pick(trade, id)}`,",
            "            price, trend, open, change: price - open, demand: Math.random() * 100}",
            "});",
            "// One tick of the feed: a new price, the trend moved on, the change since the open",
            "const tick = record => {",
            "    const [price] = walk(record.price, 1), trend = [...record.trend.slice(1), price];",
            "    record.set({price, trend, change: price - record.open})",
            "};",
            "const money = {type: 'animatedCurrency', compareField: 'change', width: 110};",
            "",
            "class MainView extends GridContainer {",
            "    static config = {",
            "        className: 'Portal.view.HomeGrid',",
            "        columns  : [",
            "            {dataField: 'name', text: 'Company', width: 190, locked: 'start'},",
            "            {...money, dataField: 'price', text: 'Price'},",
            "            {...money, dataField: 'change', text: 'Change'},",
            "            {type: 'sparkline', dataField: 'trend', text: 'Trend', width: 150},",
            "            {type: 'progress', dataField: 'demand', text: 'Demand', width: 126}",
            "        ],",
            "        store: {data, model: {fields: Object.keys(data[0]).map(name => ({name}))}}",
            "    }",
            "    async onConstructed() {",
            "        super.onConstructed();",
            "        const {store} = this;",
            "        for (;;) {",
            "            await this.timeout(100);",
            "            for (let n = 0; n < 20; n++) tick(store.getAt(Math.random() * store.count | 0))",
            "        }",
            "    }",
            "}",
            "MainView = Neo.setupClass(MainView);"
        ].join('\n'),
        /**
         * @member {String} paragraph
         */
        paragraph: [
            'A feed changes twenty of 300 records every tenth of a second, and the grid follows: prices tick, ',
            'changes turn green or red, each row draws its trend. It runs in a worker, so scrolling never waits ',
            'for the feed. Change the code and the grid follows, or move it into its own window.'
        ].join(''),
        /**
         * @member {Boolean} sideBySide=true
         */
        sideBySide: true,
        /**
         * @member {String} subHeadline='Live Data · 44 Lines'
         * @reactive
         */
        subHeadline: 'Live Data · 44 Lines',
        /**
         * @member {String} textContainerPosition='top'
         * @reactive
         */
        textContainerPosition: 'top'
    }
}

export default Neo.setupClass(Grid);

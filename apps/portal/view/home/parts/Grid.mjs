import FeatureSection from '../FeatureSection.mjs';

/**
 * @summary The home's grid proof: 300 records under a live feed; the snippet behind its Source tab builds the grid
 * and the feed. Prices tick, a change is green or red by its sign, trends and demand bars glide on each update, and
 * the footer shows the rate the feed measured.
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
         * @member {String} learnMoreRoute='/learn/guides/datahandling/Grids'
         * @reactive
         */
        learnMoreRoute: '/learn/guides/datahandling/Grids',
        /**
         * @member {String} learnMoreText='The grid guide'
         * @reactive
         */
        learnMoreText: 'The grid guide',
        /**
         * @member {Object[]} links
         * @reactive
         */
        links: [
            {route: '/examples/grid',       text: 'More grids'},
            {route: '/examples/forms',      text: 'Forms'},
            {route: '/examples/scheduler',  text: 'Scheduler'},
            {route: '/examples/gantt',      text: 'Gantt'},
            {route: '/examples/board',      text: 'Task Board'},
            {route: '/examples/calendar',   text: 'Calendar'},
            {route: '/examples/dashboard',  text: 'Docking'}
        ],
        /**
         * @member {String} livePreviewCode
         */
        livePreviewCode: [
            "import GridContainer from '../grid/Container.mjs';",
            "const pick  = (list, i) => list[i % list.length];",
            "const head  = ['Nova', 'Lumi', 'Astra', 'Verta', 'Kine', 'Orbi', 'Soli', 'Tera'],",
            "      tail  = ['tek', 'cor', 'dyne', 'gen', 'lux', 'nix', 'wave'],",
            "      trade = ['Energy', 'Robotics', 'Logistics', 'Biotech', 'Aerospace'];",
            "// A random walk: every step moves the price by up to 2.5 %",
            "const walk  = (p, n) => Array.from({length: n}, () => p *= 1 + (Math.random() - .5) / 20);",
            "const data  = Array.from({length: 300}, (_, id) => {",
            "    const trend = walk(20 + Math.random() * 480, 24), price = trend.at(-1), [open] = trend;",
            "    return {id, name: `${pick(head, id)}${pick(tail, id)} ${pick(trade, id)}`,",
            "            price, trend, open, change: price - open, demand: 15 + Math.random() * 70}",
            "});",
            "// One tick of the feed: price, trend, change since the open, and live demand",
            "const tick = record => {",
            "    const [price] = walk(record.price, 1), trend = [...record.trend.slice(1), price],",
            "          demand  = Math.min(98, Math.max(8, record.demand + (Math.random() - .5) * 36));",
            "    record.set({price, trend, change: price - record.open, demand})",
            "};",
            "const money  = {type: 'animatedCurrency', compareField: 'change', width: 130};",
            "// A gain is green and a loss is red, also while nothing moves",
            "const signed = {type: 'currency', width: 130, renderer: ({column: {formatter}, value}) =>",
            "    ({text: formatter.format(value), style: {color: value < 0 ? '#e54' : '#294'}})};",
            "",
            "class MainView extends GridContainer {",
            "    static config = {",
            "        className: 'Portal.view.HomeGrid',",
            "        columns  : [",
            "            {dataField: 'name', text: 'Company', width: 190, locked: 'start'},",
            "            {...money, dataField: 'price', text: 'Price'},",
            "            {...signed, dataField: 'change', text: 'Change'},",
            "            {type: 'sparkline', dataField: 'trend', text: 'Trend', width: 230},",
            "            {type: 'progress', dataField: 'demand', text: 'Demand', flex: 1, minWidth: 180}",
            "        ],",
            "        footerToolbar: {items: [{ntype: 'label', text: `${data.length} rows`}]},",
            "        store: {data, model: {fields: Object.keys(data[0]).map(name => ({name}))}}",
            "    }",
            "    async onConstructed() {",
            "        super.onConstructed();",
            "        const {store} = this, [rate] = this.footerToolbar.items, since = Date.now();",
            "        for (let done = 0; ; done += 20) {",
            "            await this.timeout(100);",
            "            const perSecond = done * 1000 / (Date.now() - since) | 0; // the feed's count",
            "            rate.text = `${store.count} rows · ${perSecond} updates/s`;",
            "            for (let n = 0; n < 20; n++) tick(store.getAt(Math.random() * store.count | 0))",
            "        }",
            "    }",
            "}",
            "export default Neo.setupClass(MainView);"
        ].join('\n'),
        /**
         * @member {String} paragraph
         */
        paragraph: [
            'A feed changes twenty records at a time, and the grid follows: prices tick, ',
            'changes turn green or red, trends and demand bars glide. It runs in a worker, so scrolling never waits ',
            'for the feed. Change the code, or move the grid into its own window.'
        ].join(''),
        /**
         * @member {String} subHeadline='Live Data · 48 Lines of Code'
         * @reactive
         */
        subHeadline: 'Live Data · 48 Lines of Code',
        /**
         * @member {String} textContainerPosition='end'
         * @reactive
         */
        textContainerPosition: 'end'
    }
}

export default Neo.setupClass(Grid);

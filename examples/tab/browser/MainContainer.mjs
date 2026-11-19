import MainContainerController from './MainContainerController.mjs';
import TabContainer            from '../../../src/tab/Container.mjs';
import TabOverflow             from '../../../src/tab/plugin/Overflow.mjs';
import Viewport                from '../../../src/container/Viewport.mjs';

/**
 * @summary Tabs as a browser keeps them: thirty pages in one strip, each closable, a "+" that opens one more, drag to
 * reorder, and an overflow menu for the tabs that no longer fit.
 *
 * Every behaviour is a `Neo.tab.Container` config: `closable` on a header, `headerActions` for the "+",
 * `activateInsertedTabs`, `dragResortable`, and the `Neo.tab.plugin.Overflow` plugin on the header toolbar. The
 * controller only answers the "+" with a new tab.
 * @class Neo.examples.tab.browser.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    /**
     * The pages the strip opens with: a title, the address the page would have, and one line of it
     * @member {Object[]} pages
     * @static
     */
    static pages = [
        ['Inbox (12)',           'mail.example.com/inbox',           'Twelve unread messages, two from the release crew.'],
        ['Calendar',             'calendar.example.com/week',        'Release review on Friday at 12:00, the cut on Monday.'],
        ['Pull request #214',    'git.example.com/web/pull/214',     'Two approvals, one change request on the header styles.'],
        ['CI run 8812',          'ci.example.com/runs/8812',         'Unit and component jobs green, the e2e shard still running.'],
        ['Docs · Tab container', 'docs.example.com/tab/container',   'dragResortable, closable headers and the overflow plugin.'],
        ['Sprint board',         'board.example.com/sprint/42',      'Five cards in review, two blocked on design.'],
        ['Design review',        'design.example.com/files/kpi',     'Three comments on the tile spacing.'],
        ['Error logs',           'logs.example.com/errors',          'One new error since the last deploy: a timeout in export.'],
        ['Metrics',              'metrics.example.com/web',          'p95 at 180 ms, within budget.'],
        ['Customer ticket 4512', 'support.example.com/t/4512',       'A refund for a double charge, waiting for finance.'],
        ['Roadmap',              'docs.example.com/roadmap',         'The next cut on its two-week rhythm.'],
        ['Release notes draft',  'docs.example.com/notes/draft',     'Seven highlights, one still without a screenshot.'],
        ['API reference',        'docs.example.com/api/store',       'Store, Model and Collection, with their events.'],
        ['Team chat',            'chat.example.com/team',            'A question about the theme tokens, unanswered.'],
        ['Expense report',       'finance.example.com/expenses',     'Two receipts missing for the October trip.'],
        ['Flight booking',       'travel.example.com/booking/ZRH',   'Gate B34, boarding at 07:15.'],
        ['Weather',              'weather.example.com/berlin',       'Light rain until noon, then clearing.'],
        ['Recipe',               'cook.example.com/risotto',         'Twenty minutes, stir often.'],
        ['Map · Office',         'maps.example.com/office',          'Fourteen minutes by bike.'],
        ['Video call',           'meet.example.com/standup',         'Stand-up in five minutes.'],
        ['Spreadsheet · Budget', 'sheets.example.com/budget-q4',     'Q4 at 92% of plan.'],
        ['Feature flag',         'flags.example.com/new-grid',       'Rolled out to 25% of accounts.'],
        ['Status page',          'status.example.com',               'All systems operational.'],
        ['Benchmark',            'bench.example.com/grid-100k',      '100,000 rows scrolled at 60 frames per second.'],
        ['Package registry',     'npm.example.com/package/neo.mjs',  'A new version is out.'],
        ['Security advisory',    'security.example.com/adv/77',      'No action needed for this project.'],
        ['Onboarding checklist', 'wiki.example.com/onboarding',      'Six of eight steps done.'],
        ['Meeting notes',        'notes.example.com/2026-11-19',     'Decisions: lock on Sunday, cut on Monday.'],
        ['Translation',          'translate.example.com/de',         'Twelve strings left for German.'],
        ['Playground',           'play.example.com/new',             'An empty editor, waiting for an idea.']
    ]

    /**
     * Returns one tab: a closable header and a small page that shows its title, its address and one line.
     * @param {String} title
     * @param {String} address
     * @param {String} text
     * @returns {Object}
     */
    static createPage(title, address, text) {
        return {
            cls   : ['neo-example-browser-page'],
            header: {closable: true, text: title},
            html  : `<h2>${title}</h2><p class="neo-example-browser-address">${address}</p><p>${text}</p>`
        }
    }

    static config = {
        /**
         * @member {String} className='Neo.examples.tab.browser.MainContainer'
         * @protected
         */
        className: 'Neo.examples.tab.browser.MainContainer',
        /**
         * @member {String[]} cls=['neo-example-browser']
         * @reactive
         */
        cls: ['neo-example-browser'],
        /**
         * @member {Neo.controller.Component} controller=MainContainerController
         * @reactive
         */
        controller: MainContainerController,
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         * @reactive
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Object[]} items
         */
        items: [{
            cls : ['neo-example-browser-claim'],
            flex: 'none',
            html: '<b>Thirty tabs in one strip.</b> Drag a tab to reorder it, close it with its ×, ' +
                  'open one more with +, and reach the tabs that do not fit through the overflow menu at the end of the strip.'
        }, {
            module              : TabContainer,
            activateInsertedTabs: true,
            dragResortable      : true,
            flex                : 1,
            headerActions       : [{action: 'add-tab', iconCls: 'fa fa-plus', showOnFocus: false, tooltip: 'Open a new tab'}],
            headerToolbar       : {plugins: [{module: TabOverflow}]},
            listeners           : {headerAction: 'onHeaderAction'},
            reference           : 'tabs',
            items               : this.pages.map(page => this.createPage(...page))
        }]
    }
}

export default Neo.setupClass(MainContainer);

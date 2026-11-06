import Component from './Base.mjs';
import NeoArray  from '../util/Array.mjs';

const todayDate    = new Date(),
      yearsPerPage = 10;

/**
 * @class Neo.component.MonthYearSelector
 * @extends Neo.component.Base
 * @summary Picks a month and a year from two WAI-ARIA listboxes, and reports the pair once it is confirmed.
 *
 * The months list holds all twelve months; the years list holds one page of ten years, with buttons to turn the
 * page. A click, Space or an arrow key moves the pending month or year, and an arrow key past either end of the
 * years list turns the page. OK, or Enter on an option, fires `select` with `{month, year}`; Cancel or Escape
 * fires `cancel`. Months and years outside `minValue` / `maxValue` are disabled.
 *
 * The keys it handles stop here, so they never reach the keys of a component it is embedded in.
 * `Neo.component.DateSelector` embeds one and opens it from its header label.
 */
class MonthYearSelector extends Component {
    static config = {
        /**
         * @member {String} className='Neo.component.MonthYearSelector'
         * @protected
         */
        className: 'Neo.component.MonthYearSelector',
        /**
         * @member {String} ntype='monthyearselector'
         * @protected
         */
        ntype: 'monthyearselector',
        /**
         * @member {String[]} baseCls=['neo-monthyearselector']
         * @protected
         */
        baseCls: ['neo-monthyearselector'],
        /**
         * @member {Object} keys
         */
        keys: {
            Down  : 'onKeyDownDown',
            Enter : 'onKeyDownEnter',
            Escape: 'onKeyDownEscape',
            Left  : 'onKeyDownLeft',
            Right : 'onKeyDownRight',
            Space : 'onKeyDownSpace',
            Up    : 'onKeyDownUp'
        },
        /**
         * The locale of the month names
         * @member {String} locale_=Neo.config.locale
         * @reactive
         */
        locale_: Neo.config.locale,
        /**
         * The latest selectable date, format: 'Y-m-d'
         * @member {String|null} maxValue_=null
         * @reactive
         */
        maxValue_: null,
        /**
         * The earliest selectable date, format: 'Y-m-d'
         * @member {String|null} minValue_=null
         * @reactive
         */
        minValue_: null,
        /**
         * The pending month, 0-11
         * @member {Number} month_=new Date().getMonth()
         * @reactive
         */
        month_: todayDate.getMonth(),
        /**
         * The pending year
         * @member {Number} year_=new Date().getFullYear()
         * @reactive
         */
        year_: todayDate.getFullYear(),
        /**
         * The first year of the visible page. `null` shows the decade holding `year`.
         * @member {Number|null} yearPageStart=null
         * @protected
         */
        yearPageStart: null,
        /**
         * @member {Object} _vdom
         */
        _vdom:
        {'aria-label': 'Month and year', role: 'group', cn: [
            {cls: ['neo-monthyearselector-lists'], cn: [
                {cls: ['neo-months'], 'aria-label': 'Month', role: 'listbox', cn: []},
                {cls: ['neo-years-region'], cn: [
                    {cls: ['neo-years-nav'], cn: [
                        {cls: ['neo-years-nav-button', 'neo-prev-years'], 'aria-label': 'Previous Years', role: 'button', tabIndex: 0},
                        {cls: ['neo-years-nav-button', 'neo-next-years'], 'aria-label': 'Next Years',     role: 'button', tabIndex: 0}
                    ]},
                    {cls: ['neo-years'], 'aria-label': 'Year', role: 'listbox', cn: []}
                ]}
            ]},
            {cls: ['neo-monthyearselector-footer'], cn: [
                {cls: ['neo-monthyearselector-button', 'neo-ok-button'],     role: 'button', tabIndex: 0, text: 'OK'},
                {cls: ['neo-monthyearselector-button', 'neo-cancel-button'], role: 'button', tabIndex: 0, text: 'Cancel'}
            ]}
        ]}
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        // Clicks stay inside, like keys: the date selector's own click handling must not see them
        me.addDomListeners({click: {bubble: false, fn: me.onClick, scope: me}});

        me.clampPair();
        me.updateLists(true)
    }

    /**
     * Triggered after the locale config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetLocale(value, oldValue) {
        oldValue !== undefined && this.updateLists()
    }

    /**
     * Triggered after the maxValue config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetMaxValue(value, oldValue) {
        oldValue !== undefined && this.applyBounds()
    }

    /**
     * Triggered after the minValue config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetMinValue(value, oldValue) {
        oldValue !== undefined && this.applyBounds()
    }

    /**
     * Triggered after the month config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetMonth(value, oldValue) {
        if (oldValue !== undefined) {
            this.clampPair();
            this.updateLists()
        }
    }

    /**
     * Triggered after the year config got changed
     * @summary Turns the page when the year leaves it, and moves a pair the bounds exclude to the nearest one they allow.
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetYear(value, oldValue) {
        if (oldValue !== undefined) {
            let me    = this,
                start = me.yearPageStart;

            if (start === null || value < start || value >= start + yearsPerPage) {
                me.yearPageStart = me.getPageStart(value)
            }

            me.clampPair();
            me.updateLists()
        }
    }

    /**
     * @summary Runs the control a click, Enter or Space hits. An option becomes the pending month or year, and Enter
     * on it selects; the page buttons turn the years page; OK selects and Cancel cancels.
     * @param {Object[]} path The event path, innermost node first
     * @param {Boolean} [confirm=false] true for Enter
     * @protected
     */
    activate(path, confirm=false) {
        let me = this,
            {cls=[], id} = path[0] || {};

        if (cls.includes('neo-disabled')) {
            return
        }

        if (cls.includes('neo-month')) {
            me.month = me.getIndexFromId(id, 'month');
            confirm ? me.select() : me.focusOption('month')
        } else if (cls.includes('neo-year')) {
            me.year = me.getIndexFromId(id, 'year');
            confirm ? me.select() : me.focusOption('year')
        } else if (cls.includes('neo-prev-years')) {
            me.pageYears(-1)
        } else if (cls.includes('neo-next-years')) {
            me.pageYears(1)
        } else if (cls.includes('neo-ok-button')) {
            me.select()
        } else if (cls.includes('neo-cancel-button')) {
            me.cancel()
        }
    }

    /**
     * @summary Re-applies changed bounds: an excluded pending pair moves inside them, and a focus inside the selector
     * follows the moved month.
     * @protected
     */
    applyBounds() {
        let me    = this,
            moved = me.clampPair();

        me.updateLists();

        moved && me.containsFocus && me.focusOption('month')
    }

    /**
     * Fires the cancel event
     */
    cancel() {
        this.fire('cancel', {component: this})
    }

    /**
     * @summary Moves a pending pair outside minValue / maxValue to the nearest month inside them, so OK only ever
     * confirms an allowed pair. The years page follows a year that changes.
     * @returns {Boolean} true if the pair moved
     * @protected
     */
    clampPair() {
        let me      = this,
            max     = me.parseBound(me.maxValue),
            min     = me.parseBound(me.minValue),
            value   = me.year * 12 + me.month,
            clamped = value,
            year;

        min && (clamped = Math.max(clamped, min.year * 12 + min.month));
        max && (clamped = Math.min(clamped, max.year * 12 + max.month));

        if (clamped === value) {
            return false
        }

        year      = Math.floor(clamped / 12);
        me._month = clamped - year * 12;

        if (year !== me.year) {
            me._year         = year;
            me.yearPageStart = me.getPageStart(year)
        }

        return true
    }

    /**
     * Focuses the pending month or year. A year off the visible page focuses the page's first enabled year.
     * @param {String} type 'month' or 'year'
     * @returns {Promise<void>}
     */
    async focusOption(type) {
        let me = this,
            id = type === 'month' ? me.getOptionId('month', me.month) : me.getYearsEl().cn.find(node => node.tabIndex === 0)?.id;

        await me.promiseUpdate();

        id && !me.isDestroyed && me.focus(id)
    }

    /**
     * @param {String} id
     * @param {String} type 'month' or 'year'
     * @returns {Number}
     * @protected
     */
    getIndexFromId(id, type) {
        return parseInt(id.substring(`${this.id}__${type}-`.length))
    }

    /**
     * @returns {Object}
     * @protected
     */
    getMonthsEl() {
        return this.vdom.cn[0].cn[0]
    }

    /**
     * @param {String} type  'month' or 'year'
     * @param {Number} value The month index or the year
     * @returns {String}
     */
    getOptionId(type, value) {
        return `${this.id}__${type}-${value}`
    }

    /**
     * @param {Number} year
     * @returns {Number} The first year of the decade holding `year`
     * @protected
     */
    getPageStart(year) {
        return Math.floor(year / yearsPerPage) * yearsPerPage
    }

    /**
     * @param {Object[]} path
     * @returns {String|null} 'month' or 'year' when the path runs through one of the two lists
     * @protected
     */
    getListType(path) {
        for (const node of path) {
            if (node.cls?.includes('neo-months')) return 'month';
            if (node.cls?.includes('neo-years'))  return 'year'
        }

        return null
    }

    /**
     * @returns {Object}
     * @protected
     */
    getYearsEl() {
        return this.vdom.cn[0].cn[1].cn[1]
    }

    /**
     * @returns {Object}
     * @protected
     */
    getYearsNavEl() {
        return this.vdom.cn[0].cn[1].cn[0]
    }

    /**
     * @param {Number} month
     * @param {Number} year
     * @returns {Boolean}
     */
    isMonthDisabled(month, year) {
        let max = this.parseBound(this.maxValue),
            min = this.parseBound(this.minValue);

        return this.isYearDisabled(year) ||
            !!min && year === min.year && month < min.month ||
            !!max && year === max.year && month > max.month
    }

    /**
     * @param {Number} year
     * @returns {Boolean}
     */
    isYearDisabled(year) {
        let max = this.parseBound(this.maxValue),
            min = this.parseBound(this.minValue);

        return !!min && year < min.year || !!max && year > max.year
    }

    /**
     * @param {Object} data
     * @protected
     */
    onClick(data) {
        this.activate(data.path)
    }

    /**
     * @param {Object} data
     */
    onKeyDownDown(data) {
        this.onNavKey(data, 2)
    }

    /**
     * @param {Object} data
     */
    onKeyDownEnter(data) {
        data.cancelBubble = true;
        this.activate(data.path, true)
    }

    /**
     * @param {Object} data
     */
    onKeyDownEscape(data) {
        data.cancelBubble = true;
        this.cancel()
    }

    /**
     * @param {Object} data
     */
    onKeyDownLeft(data) {
        this.onNavKey(data, -1)
    }

    /**
     * @param {Object} data
     */
    onKeyDownRight(data) {
        this.onNavKey(data, 1)
    }

    /**
     * @param {Object} data
     */
    onKeyDownSpace(data) {
        data.cancelBubble = true;
        this.activate(data.path)
    }

    /**
     * @param {Object} data
     */
    onKeyDownUp(data) {
        this.onNavKey(data, -2)
    }

    /**
     * @summary Moves by `step` from the focused option of the focused list, and makes the result the pending month or
     * year; both lists lay out two options per row. After a page turn the focused year is not the pending one, so the
     * move starts from the option, not the pending value. A move onto a disabled option, or past either end of the
     * months, stays put.
     * @param {Object} data
     * @param {Number} step
     * @protected
     */
    onNavKey(data, step) {
        let me     = this,
            type   = me.getListType(data.path),
            target = data.path[0],
            base, value;

        data.cancelBubble = true;

        if (type) {
            base = target?.cls?.includes(`neo-${type}`) ? me.getIndexFromId(target.id, type) : me[type]
        }

        if (type === 'month') {
            value = base + step;

            if (value >= 0 && value < 12 && !me.isMonthDisabled(value, me.year)) {
                me.month = value;
                me.focusOption('month')
            }
        } else if (type === 'year') {
            value = base + step;

            if (!me.isYearDisabled(value)) {
                me.year = value;
                me.focusOption('year')
            }
        }
    }

    /**
     * Turns the years page. The pending year stays as it is.
     * @param {Number} direction -1 or 1
     */
    pageYears(direction) {
        this.yearPageStart += direction * yearsPerPage;
        this.updateLists()
    }

    /**
     * @param {String|null} value format: 'Y-m-d'
     * @returns {Object|null} {month, year}
     * @protected
     */
    parseBound(value) {
        if (!value) {
            return null
        }

        let [year, month] = String(value).split('-').map(Number);

        return {month: month - 1, year}
    }

    /**
     * Fires the select event with the pending month and year
     */
    select() {
        let {month, year} = this;

        this.fire('select', {component: this, month, year})
    }

    /**
     * @summary Rebuilds both lists from the pending month and year, the visible years page and the min/max range.
     * The pending options carry `aria-selected` and the roving `tabIndex`; a page without the pending year
     * hands the `tabIndex` to its first enabled year.
     * @param {Boolean} [silent=false]
     * @protected
     */
    updateLists(silent=false) {
        let me            = this,
            {month, year} = me,
            longNames     = new Intl.DateTimeFormat(me.locale, {month: 'long'}),
            shortNames    = new Intl.DateTimeFormat(me.locale, {month: 'short'}),
            navEl         = me.getYearsNavEl(),
            start         = me.yearPageStart ??= me.getPageStart(year),
            years         = Array.from({length: yearsPerPage}, (_, index) => start + index),
            tabYear       = years.includes(year) ? year : years.find(value => !me.isYearDisabled(value));

        me.getMonthsEl().cn = Array.from({length: 12}, (_, index) => {
            let monthDate = new Date(2000, index, 1);

            return {
                ...me.createOption('month', index, me.isMonthDisabled(index, year), index === month, index === month),
                'aria-label': longNames.format(monthDate),
                text        : shortNames.format(monthDate)
            }
        });

        me.getYearsEl().cn = years.map(value => ({
            ...me.createOption('year', value, me.isYearDisabled(value), value === year, value === tabYear),
            text: String(value)
        }));

        // A page button that would only reach disabled years is disabled itself
        me.setDisabled(navEl.cn[0], me.isYearDisabled(start - 1));
        me.setDisabled(navEl.cn[1], me.isYearDisabled(start + yearsPerPage));

        !silent && me.update()
    }

    /**
     * @param {String}  type     'month' or 'year'
     * @param {Number}  value    The month index or the year
     * @param {Boolean} disabled
     * @param {Boolean} selected
     * @param {Boolean} tabbable true for the list's roving `tabIndex` holder
     * @returns {Object} The option's vdom
     * @protected
     */
    createOption(type, value, disabled, selected, tabbable) {
        let cls = ['neo-' + type];

        NeoArray.toggle(cls, 'neo-disabled', disabled);
        NeoArray.toggle(cls, 'neo-selected', selected);

        return {
            'aria-disabled': disabled || null,
            'aria-selected': selected,
            cls,
            id             : this.getOptionId(type, value),
            role           : 'option',
            tabIndex       : tabbable ? 0 : -1
        }
    }

    /**
     * @param {Object}  node
     * @param {Boolean} disabled
     * @protected
     */
    setDisabled(node, disabled) {
        NeoArray.toggle(node.cls, 'neo-disabled', disabled);

        node['aria-disabled'] = disabled || null;
        node.tabIndex         = disabled ? -1 : 0
    }
}

export default Neo.setupClass(MonthYearSelector);

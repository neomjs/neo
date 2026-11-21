import Column from '../../../src/board/Column.mjs';

const MIN_WIP_LIMIT = 1,
      MAX_WIP_LIMIT = 10;

/**
 * @summary Workshop board column adding an inline WIP-limit stepper beside each limited column's title and a
 * non-colour overloaded callout row whenever `count > wipLimit`.
 * @description Keeps {@link Neo.board.Column#updateHeader}'s three base header nodes (`title`, `count` badge reading
 * `count/limit`, and `collapse` button) intact at indices `0..2`, appending stable stepper and overload-banner VDOM
 * nodes inside a single `silentVdomUpdate` batch so every count or limit transition settles in one VDOM update with
 * zero node churn.
 * @class Neo.examples.board.wipLimits.WorkshopColumn
 * @extends Neo.board.Column
 */
class WorkshopColumn extends Column {
    static config = {
        /**
         * @member {String} className='Neo.examples.board.wipLimits.WorkshopColumn'
         * @protected
         */
        className: 'Neo.examples.board.wipLimits.WorkshopColumn',
        /**
         * @member {String} ntype='workshop-board-column'
         * @protected
         */
        ntype: 'workshop-board-column'
    }

    /**
     * Cached VDOM descriptor for the inline WIP stepper (`<column>__stepper`).
     * @member {Object|null} stepperNode=null
     */
    stepperNode = null
    /**
     * Cached VDOM descriptor for the non-colour overload banner (`<column>__over-banner`).
     * @member {Object|null} overBannerNode=null
     */
    overBannerNode = null

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        this.addDomListeners({
            click   : this.onStepperButtonClick,
            delegate: '.workshop-wip-step-btn',
            scope   : this
        })
    }

    /**
     * @summary Notifies the owning board when `wipLimit` changes at runtime so workshop summary chrome stays synced.
     * @param {Number|null} value
     * @param {Number|null} oldValue
     * @protected
     */
    afterSetWipLimit(value, oldValue) {
        super.afterSetWipLimit(value, oldValue);

        if (oldValue !== undefined) {
            this.board?.fire('columnWipLimitChange', {column: this, oldValue, value})
        }
    }

    /**
     * @summary Builds or returns the column's stable stepper VDOM subtree (`[ −  max N  + ]`).
     * @returns {Object}
     */
    ensureStepperNode() {
        const {id} = this;

        return this.stepperNode ||= {
            tag : 'div',
            id  : `${id}__stepper`,
            cls : ['workshop-wip-stepper'],
            role: 'group',
            cn  : [{
                tag : 'button',
                type: 'button',
                id  : `${id}__stepper-dec`,
                cls : ['workshop-wip-step-btn'],
                data: {delta: '-1'},
                text: '−'
            }, {
                tag : 'span',
                id  : `${id}__stepper-val`,
                cls : ['workshop-wip-step-value'],
                text: ''
            }, {
                tag : 'button',
                type: 'button',
                id  : `${id}__stepper-inc`,
                cls : ['workshop-wip-step-btn'],
                data: {delta: '1'},
                text: '+'
            }]
        }
    }

    /**
     * @summary Builds or returns the column's stable non-colour overload callout row (`▲ Over limit`).
     * @returns {Object}
     */
    ensureOverBannerNode() {
        const {id} = this;

        return this.overBannerNode ||= {
            tag: 'div',
            id : `${id}__over-banner`,
            cls: ['workshop-wip-over-banner'],
            cn : [{
                tag : 'span',
                id  : `${id}__over-glyph`,
                cls : ['workshop-wip-over-glyph'],
                text: '▲'
            }, {
                tag : 'span',
                id  : `${id}__over-text`,
                cls : ['workshop-wip-over-text'],
                text: ''
            }]
        }
    }

    /**
     * @summary Adjusts `wipLimit` by `-1` or `+1` within `[MIN_WIP_LIMIT, MAX_WIP_LIMIT]` when a stepper button is clicked.
     * @param {Object} data
     */
    onStepperButtonClick(data) {
        if (this.wipLimit == null) {
            return
        }

        const
            btn   = data?.path?.find(node => node.cls?.includes('workshop-wip-step-btn')),
            delta = Number(btn?.data?.delta || 0);

        if (!delta) {
            return
        }

        const next = Math.max(MIN_WIP_LIMIT, Math.min(MAX_WIP_LIMIT, this.wipLimit + delta));

        if (next !== this.wipLimit) {
            this.wipLimit = next
        }
    }

    /**
     * @summary Updates the column header in one coalesced VDOM pass, keeping `count/limit` on `.neo-board-column-count`
     * while appending the custom WIP stepper beside the title and the non-colour overload callout when exceeded.
     */
    updateHeader() {
        let me                         = this,
            {collapsed, count, header} = me,
            wipLimit                   = me.wipLimit,
            exceeded                   = me.isWipExceeded,
            label                      = me.title ?? me.status ?? '';

        if (!header) {
            return
        }

        header.silentVdomUpdate = true;
        super.updateHeader();
        header.silentVdomUpdate = false;

        const
            badgeCls = header.vdom.cn[1]?.cls,
            atLimit  = !exceeded && wipLimit != null && count === wipLimit;

        if (Array.isArray(badgeCls)) {
            const idx = badgeCls.indexOf('workshop-wip-at-limit');

            if (atLimit && idx === -1) {
                badgeCls.push('workshop-wip-at-limit')
            } else if (!atLimit && idx !== -1) {
                badgeCls.splice(idx, 1)
            }
        }

        if (wipLimit != null && !collapsed) {
            const stepper = me.ensureStepperNode();

            stepper['aria-label']          = `${label} work-in-progress limit`;
            stepper.cn[0]['aria-label']    = `Decrease ${label} limit`;
            stepper.cn[0].disabled         = wipLimit <= MIN_WIP_LIMIT;
            stepper.cn[1].text             = `limit ${wipLimit}`;
            stepper.cn[2]['aria-label']    = `Increase ${label} limit`;
            stepper.cn[2].disabled         = wipLimit >= MAX_WIP_LIMIT;

            header.vdom.cn.push(stepper)
        }

        if (exceeded && !collapsed) {
            const
                over   = count - wipLimit,
                banner = me.ensureOverBannerNode();

            banner.cn[1].text = `Over limit by ${over} — move a repair or raise limit`;
            header.vdom.cn.push(banner)
        }

        header.update()
    }
}

export default Neo.setupClass(WorkshopColumn);

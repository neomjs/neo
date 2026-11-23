import DateSelector from '../../../src/component/DateSelector.mjs';
import {occursOn}   from './occasions.mjs';

/**
 * @summary The native date selector with the team's occasions marked on their recurring calendar days.
 * @class Neo.examples.calendar.birthdays.BirthdayPicker
 * @extends Neo.component.DateSelector
 */
class BirthdayPicker extends DateSelector {
    static config = {
        className: 'Neo.examples.calendar.birthdays.BirthdayPicker',
        cls      : ['birthday-picker'],
        /** @member {Neo.data.Store|null} occasionStore_ The provider-owned occasion records. */
        occasionStore_: null
    }

    /** @summary Redraws marks when the shared roster changes. */
    afterSetOccasionStore(value, oldValue) {
        oldValue?.un({load: this.onOccasionsChange, mutate: this.onOccasionsChange,
            recordChange: this.onOccasionsChange, scope: this});
        value?.on({load: this.onOccasionsChange, mutate: this.onOccasionsChange,
            recordChange: this.onOccasionsChange, scope: this});
        if (this.isConstructed && this.currentDate && this.selectionModel) this.recreateDayViewContent()
    }

    /** @summary Rebuilds the current month using the source store's latest records. */
    onOccasionsChange() {
        if (this.isConstructed && this.currentDate && this.selectionModel) this.recreateDayViewContent()
    }

    /**
     * @summary Adds occasion names to the native grid while leaving native cells and their date text intact.
     * @param {Boolean} [silent=false] Whether the caller will publish the VDOM update.
     * @param {Object} [containerEl] The native transition's incoming month container.
     */
    createDayViewContent(silent=false, containerEl) {
        super.createDayViewContent(true, containerEl);

        const center  = containerEl || this.getCenterContentEl(),
              date    = this.currentDate,
              records = this.occasionStore?.items || [];

        for (const row of center.cn || []) {
            if (row.role !== 'row' || row.cls?.includes('neo-header-row')) continue;
            for (const cell of row.cn || []) {
                if (cell.role !== 'gridcell' || cell.cls?.includes('neo-disabled')) continue;
                const day     = Number(cell.cn?.[0]?.text),
                      matches = records.filter(record => occursOn(record, date.getFullYear(), date.getMonth() + 1, day));
                if (!matches.length) continue;
                const names = matches.map(record => String(record.name));
                cell.cls.push('birthday-marked');
                cell['aria-label'] = `${cell['aria-label']}: ${names.join(', ')}`;
                cell.cn.push({
                    id           : `${cell.id}__birthdays`, cls: ['birthday-cell-occasions'],
                    'aria-hidden': 'true', style: {pointerEvents: 'none'},
                    cn           : [
                        ...matches.slice(0, 2).map((record, index) => ({
                            id: `${cell.id}__birthday_${index}`, cls: ['birthday-cell-name'], cn: [
                                {id: `${cell.id}__birthday_${index}_dot`, cls: ['birthday-cell-dot'],
                                    data: {kind: record.kind || 'peer'}},
                                {id: `${cell.id}__birthday_${index}_text`, text: String(record.name)}
                            ]
                        })),
                        ...(names.length > 2 ? [{id: `${cell.id}__birthday_more`, cls: ['birthday-cell-more'],
                            text: `+${names.length - 2}`}] : [])
                    ]
                })
            }
        }

        if (!silent) this.update()
    }

    /** @summary Releases the borrowed store listener. */
    destroy(...args) {
        this.occasionStore?.un({load: this.onOccasionsChange, mutate: this.onOccasionsChange,
            recordChange: this.onOccasionsChange, scope: this});
        super.destroy(...args)
    }
}

export default Neo.setupClass(BirthdayPicker);

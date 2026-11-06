import Select     from '../../../../src/form/field/Select.mjs';
import StringUtil from '../../../../src/util/String.mjs';

/**
 * @summary Custom native options retain readable labels alongside decorative fruit icons.
 * @class Neo.examples.form.field.select.FruitSelect
 * @extends Neo.form.field.Select
 */
class FruitSelect extends Select {
    static config = {
        className: 'Neo.examples.form.field.select.FruitSelect',
        options  : [
            {id: 0, name: 'Lemon', icon: '🍋'},
            {id: '0', name: 'Strawberry', icon: '🍓'},
            {id: false, name: 'Apple', icon: '🍎'},
            {id: '', name: 'Grapes', icon: '🍇'}
        ]
    }

    /**
     * @summary Adds noninteractive decoration while preserving the escaped text fallback.
     * @param {Object} record
     * @param {Number} index
     * @returns {String}
     */
    createOptionContent(record, index) {
        return `<span aria-hidden="true">${StringUtil.escapeHtml(record.icon)}</span> <strong>${super.createOptionContent(record, index)}</strong>`
    }
}

export default Neo.setupClass(FruitSelect);

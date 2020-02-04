import {default as BaseContainer}    from '../container/Base.mjs';
import {default as BaseField}        from '../form/field/Base.mjs';
import {default as ComponentManager} from '../manager/Component.mjs';

/**
 * @class Neo.form.Container
 * @extends Neo.container.Base
 */
class Container extends BaseContainer {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.form.Container'
         * @private
         */
        className: 'Neo.form.Container',
        /**
         * @member {String} ntype='form-container'
         * @private
         */
        ntype: 'form-container',
        /**
         * @member {Array} cls=['neo-form-container'],
         * @private
         */
        cls: ['neo-form-container'],
        /**
         * @member {Object} _vdom={tag: 'form',cn: []}
         */
        _vdom: {
            tag: 'form',
            cn : []
        }
    }}

    /**
     *
     * @returns {Array} fields
     */
    getFields() {
        let children = ComponentManager.getChildren(this),
            fields   = [];

        children.forEach(item => {
            if (item instanceof BaseField) {
                fields.push(item);
            }
        });

        return fields;
    }

    /**
     *
     * @returns {Object} values
     */
    getValues() {
        let fields = this.getFields(),
            values = {};

        fields.forEach(item => {
            values[item.name || item.id] = item.value;
        });

        return values;
    }

    /**
     * Returns true in case no form field isValid() call returns false
     * @returns {Boolean}
     */
    isValid() {
        let fields = this.getFields(),
            i      = 0,
            len    = fields.length;

        for (; i < len; i++) {
            if (!fields[i].isValid()) {
                return false;
            }
        }

        return true;
    }
}

Neo.applyClassConfig(Container);

export {Container as default};
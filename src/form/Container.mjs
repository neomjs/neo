import BaseContainer    from '../container/Base.mjs';
import BaseField        from '../form/field/Base.mjs';
import ComponentManager from '../manager/Component.mjs';
import NeoArray         from '../util/Array.mjs';

/**
 * @class Neo.form.Container
 * @extends Neo.container.Base
 */
class Container extends BaseContainer {
    static config = {
        /**
         * @member {String} className='Neo.form.Container'
         * @protected
         */
        className: 'Neo.form.Container',
        /**
         * @member {String} ntype='form-container'
         * @protected
         */
        ntype: 'form-container',
        /**
         * @member {String[]} baseCls=['neo-form-container'],
         * @protected
         */
        baseCls: ['neo-form-container'],
        /**
         * @member {Object} vdom={tag: 'form',cn:[],onsubmit:'return false;'}
         */
        vdom:
        {tag: 'form', cn: [], onsubmit: 'return false;'}
    }

    /**
     * Helper function used by setValues() which wraps the leaves of a tree structure into a new property.
     * The logic assumes that field config values must not be objects (separation between the key & value realm).
     * @param {Object} values
     * @param {String} configName
     * @param {String[]} fieldPaths
     */
    static adjustTreeLeaves(values={}, configName, fieldPaths) {
        let assign,type;

        Object.entries(values).forEach(([key, value]) => {
            assign = true;
            type   = Neo.typeOf(value);

            if (type === 'Array') {
                assign = false;

                value.forEach(item => {
                    if (Neo.typeOf(item) === 'Object') {
                        this.adjustTreeLeaves(item, configName, fieldPaths)
                    }
                })
            } else if (type === 'Object') {
                assign = false;
                this.adjustTreeLeaves(value, configName, fieldPaths)
            }

            if (assign) {
                if (key === configName) {
                    values[key] = value
                } else {
                    values[key] = {[configName]: value}
                }
            }
        })
    }

    /**
     * @param {Neo.container.Base} parent
     * @param {Object[]} modules
     * @returns {Object[]}
     */
    findNotLoadedModules(parent=this, modules=[]) {
        parent.items.forEach(item => {
            if (Neo.typeOf(item.module) === 'Function' && !item.isLoading) {
                modules.push({item, parent})
            } else {
                item.items && this.findNotLoadedModules(item, modules)
            }
        });

        return modules
    }

    /**
     * Either pass a field name or id
     * @param {String} name
     * @returns {Promise<Neo.form.field.Base|null>} fields
     */
    async getField(name) {
        await this.loadModules();

        let fields = ComponentManager.getChildComponents(this),
            field;

        for (field of fields) {
            if (field instanceof BaseField) {
                if (field.name === name || field.id === name) {
                    return field
                }
            }
        }

        return null
    }

    /**
     * @param {Neo.form.field.Base} field
     * @returns {String}
     */
    getFieldPath(field) {
        let path = field.formGroup ? field.formGroup.split('.') : [];

        path.push(field.name || field.id);

        return path.join('.')
    }

    /**
     * @returns {Promise<Neo.form.field.Base[]>} fields
     */
    async getFields() {
        let fields = [];

        await this.loadModules();

        ComponentManager.getChildComponents(this).forEach(field => {
            field instanceof BaseField && fields.push(field)
        });

        return fields
    }

    /**
     * @returns {Promise<Object>}
     */
    async getValues() {
        let fields = await this.getFields(),
            Radio  = Neo.form.field.Radio,
            values = {},
            fieldName, key, ns, nsArray, value;

        fields.forEach(field => {
            value = field.getValue();

            if (field.name) {
                fieldName = field.name;

                if (field.formGroup) {
                    fieldName = field.formGroup + '.' + fieldName;
                }

                nsArray = fieldName.split('.');
                key     = nsArray.pop();
                ns      = Neo.nsWithArrays(nsArray, true, values);
            } else {
                key = field.id;
                ns  = values
            }

            // Ensuring that Radios will not return arrays
            if (Radio && field instanceof Radio) {
                // Only overwrite an existing value with a checked value
                if (Object.hasOwn(ns, key)) {
                    if (value !== field.uncheckedValue) {
                        ns[key] = value
                    }
                } else {
                    ns[key] = value
                }
            }
            /*
             * CheckBoxes need custom logic
             * => we only want to pass the uncheckedValue in case the field does not belong to a group
             * (multiple fields using the same name)
             */
            else if (Object.hasOwn(ns, key) && value !== undefined) {
                if (ns[key] === field.uncheckedValue) {
                    ns[key] = []
                } else if (!Array.isArray(ns[key])) {
                    ns[key] = [ns[key]]
                }

                value !== field.uncheckedValue && ns[key].unshift(value)
            } else if (value !== undefined) {
                ns[key] = value
            }
        });

        return values
    }

    /**
     * Returns true in case no form field isValid() call returns false
     * @returns {Promise<Boolean>}
     */
    async isValid() {
        let fields = await this.getFields(),
            i      = 0,
            len    = fields.length;

        for (; i < len; i++) {
            if (!fields[i].isValid()) {
                return false
            }
        }

        return true
    }

    /**
     * Loads all not loaded items inside card layouts
     * @returns {Promise<Neo.component.Base[]>}
     */
    async loadModules() {
        let me       = this,
            modules  = me.findNotLoadedModules(),
            promises = [];

        modules.forEach(module => {
            promises.push(module.parent.layout.loadModule(module.item));
        });

        modules = await Promise.all(promises);

        return modules
    }

    /**
     * Resets field values by field name or field id.
     * Fields not included with a value will get reset to null.
     * @param {Object} [values]
     */
    async reset(values={}) {
        let me     = this,
            fields = await me.getFields(),
            path, value;

        fields.forEach(field => {
            path  = me.getFieldPath(field);
            value = Neo.nsWithArrays(path, false, values);

            field.reset(path ? value : null)
        })
    }

    /**
     * Set field configs by field name or field id
     * @param {Object} configs={}
     * @param {Boolean} suspendEvents=false
     */
    async setConfigs(configs={}, suspendEvents=false) {
        let me     = this,
            fields = await me.getFields(),
            fieldConfigs, isCheckBox, isRadio, path, value;

        fields.forEach(field => {
            path         = me.getFieldPath(field);
            fieldConfigs = Neo.nsWithArrays(path, false, configs);

            if (fieldConfigs) {
                if (suspendEvents) {
                    field.suspendEvents = true
                }

                isCheckBox = Neo.form.field?.CheckBox && field instanceof Neo.form.field.CheckBox;
                isRadio    = Neo.form.field?.Radio    && field instanceof Neo.form.field.Radio;
                value      = fieldConfigs.value;

                if (isCheckBox || isRadio) {
                    /*
                     * we want to only change the checked state, in case a value is set.
                     * since fields of the same group might need it too, we are cloning the fieldConfigs
                     */
                    if (Object.hasOwn(fieldConfigs, 'value')) {
                        fieldConfigs = Neo.clone(fieldConfigs, true);

                        if (isRadio) {
                            fieldConfigs.checked = field.value === value
                        } else if (isCheckBox) {
                            if (Neo.typeOf(value) === 'Array') {
                                if (value.includes(field.value)) {
                                    fieldConfigs.checked = true
                                }
                            } else {
                                fieldConfigs.checked = field.value === value
                            }
                        }

                        delete fieldConfigs.value
                    }
                }

                field.set(fieldConfigs)

                if (suspendEvents) {
                    delete field.suspendEvents
                }
            }
        })
    }

    /**
     * Set field values by field name or field id
     * @param {Object} values={}
     * @param {Boolean} suspendEvents=false
     */
    async setValues(values={}, suspendEvents=false) {
        let fields     = await this.getFields(),
            fieldPaths = [];

        // Grouped CheckBoxes & Radios can have the same path
        // => using NeoArray to ensure they only get added once
        fields.map(field => NeoArray.add(fieldPaths, field.getPath()));

        Container.adjustTreeLeaves(values, 'value', fieldPaths);

        await this.setConfigs(values, suspendEvents)
    }

    /**
     * Updates the invalid state for all fields which have validate() implemented.
     * This can be useful for create-entity forms which show up "clean" until pressing a submit button.
     * @returns {Promise<Boolean>}
     */
    async validate() {
        let isValid = true,
            fields  = await this.getFields(),
            validField;

        fields.forEach(field => {
            validField = field.validate?.(false);

            if (!validField) {
                isValid = false
            }
        });

        return isValid
    }
}

Neo.applyClassConfig(Container);

export default Container;

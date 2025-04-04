import Base   from '../core/Base.mjs';
import Logger from '../util/Logger.mjs';
import Model  from './Model.mjs';

const
    dataSymbol         = Symbol.for('data'),
    isModifiedSymbol   = Symbol.for('isModified'),
    originalDataSymbol = Symbol.for('originalData');

let instance;

/**
 * @class Neo.data.RecordFactory
 * @extends Neo.core.Base
 * @singleton
 */
class RecordFactory extends Base {
    static config = {
        /**
         * @member {String} className='Neo.data.RecordFactory'
         * @protected
         */
        className: 'Neo.data.RecordFactory',
        /**
         * @member {String} recordNamespace='Neo.data.record'
         */
        recordNamespace: 'Neo.data.record',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Assigns model based default values to a data object
     * @param {Object}         data
     * @param {Neo.data.Model} model
     * @returns {Object}
     */
    assignDefaultValues(data, model) {
        model.fieldsMap.forEach((field, fieldName) => {
            if (Object.hasOwn(field, 'defaultValue')) {
                // We could always use Neo.assignToNs() => the check is just for improving the performance
                if (model.hasNestedFields) {
                    Neo.assignToNs(fieldName, field.defaultValue, data, false)
                } else if (data[fieldName] === undefined) {
                    data[fieldName] = field.defaultValue
                }
            }
        });

        return data
    }

    /**
     * @param {Object} data
     * @param {Object} data.field
     * @param {Neo.data.Model} data.model
     * @param {String} data.path=''
     * @param {Object} data.proto
     */
    createField({field, model, path='', proto}) {
        let fieldName = field.name,
            fieldPath = path === '' ? fieldName : `${path}.${fieldName}`,
            properties;

        if (field.fields) {
            field.fields.forEach(childField => {
                this.createField({field: childField, model, path: fieldPath, proto})
            })
        } else {
            properties = {
                [fieldPath]: {
                    configurable: true,
                    enumerable  : true,
                    get() {
                        if (model.hasNestedFields) {
                            return Neo.ns(fieldPath, false, this[dataSymbol])
                        }

                        return this[dataSymbol][fieldName]
                    },
                    set(value) {
                        instance.setRecordFields({
                            fields: {[fieldPath]: instance.parseRecordValue({record: this, field, value})},
                            model,
                            record: this
                        })
                    }
                }
            };

            Object.defineProperties(proto, properties)
        }
    }

    /**
     * @param {Neo.data.Model} model
     * @param {Object} config
     * @returns {Object}
     */
    createRecord(model, config) {
        let recordClass = Neo.ns(`${this.recordNamespace}.${model.className}.${model.id}`);

        if (!recordClass) {
            recordClass = this.createRecordClass(model)
        }

        return new recordClass(config)
    }

    /**
     * @param {Neo.data.Model} model
     * @param {Boolean} overwrite=false
     * @returns {Object}
     */
    createRecordClass(model, overwrite=false) {
        if (model instanceof Model) {
            let className = `${this.recordNamespace}.${model.className}.${model.id}`,
                ns        = Neo.ns(className),
                key, nsArray, cls;

            if (!ns || overwrite) {
                nsArray = className.split('.');
                key     = nsArray.pop();
                ns      = Neo.ns(nsArray, true);
                cls     = ns[key] = class Record {
                    // We do not want to minify the ctor class name in dist/production
                    static name = 'Record';

                    [dataSymbol] = {}

                    get isModified() {
                        let me = this;

                        if (model.trackModifiedFields) {
                            return !Neo.isEqual(me[dataSymbol], me[originalDataSymbol])
                        }

                        return me[isModifiedSymbol]
                    }

                    /**
                     * @param {Object} config
                     */
                    constructor(config) {
                        let me = this;

                        config = instance.assignDefaultValues(config, model);

                        if (model.trackModifiedFields) {
                            me[originalDataSymbol] = {};
                            me.setOriginal(config)
                        } else {
                            me[isModifiedSymbol] = false
                        }

                        me.setSilent(config); // We do not want to fire change events when constructing
                    }

                    /**
                     * @param {String} fieldName
                     * @returns {Boolean|null} null in case the model does not use trackModifiedFields, true in case a change was found
                     */
                    isModifiedField(fieldName) {
                        let me = this;

                        // Check if the field getter does exist
                        if (!Object.hasOwn(me.__proto__, fieldName)) {
                            Logger.logError('The record does not contain the field', fieldName, me)
                        }

                        if (model.trackModifiedFields) {
                            let dataScope, originalDataScope;

                            if (model.hasNestedFields && fieldName.includes('.')) {
                                let nsArray = fieldName.split('.');

                                fieldName         = nsArray.pop();
                                dataScope         = Neo.ns(nsArray, false, me[dataSymbol]);
                                originalDataScope = Neo.ns(nsArray, false, me[originalDataSymbol])
                            } else {
                                dataScope         = me[dataSymbol];
                                originalDataScope = me[originalDataSymbol]
                            }

                            return !Neo.isEqual(dataScope[fieldName], originalDataScope[fieldName])
                        }

                        return null
                    }

                    /**
                     * Bulk-update multiple record fields at once
                     * @param {Object} fields
                     */
                    reset(fields) {
                        this.setOriginal(fields);
                        this.set(fields)
                    }

                    /**
                     * Bulk-update multiple record fields at once
                     * @param {Object} fields
                     */
                    set(fields) {
                        instance.setRecordFields({fields, model, record: this})
                    }

                    /**
                     * If the model uses trackModifiedFields, we will store the original data
                     * for tracking the dirty state (changed fields)
                     * @param {Object} fields
                     * @protected
                     */
                    setOriginal(fields) {
                        instance.setRecordFields({fields, model, record: this, silent: true, useOriginalData: true})
                    }

                    /**
                     * Bulk-update multiple record fields at once without triggering a change event
                     * @param {Object} fields
                     */
                    setSilent(fields) {
                        instance.setRecordFields({fields, model, record: this, silent: true})
                    }

                    /**
                     * When using JSON.stringify(this), we want to get the raw data
                     * @returns {Object}
                     */
                    toJSON() {
                        return this[dataSymbol]
                    }
                };

                if (Array.isArray(model.fields)) {
                    model.fields.forEach(field => {
                        instance.createField({field, model, proto: cls.prototype})
                    })
                }

                Object.defineProperty(cls.prototype, 'isRecord', {value: true});
                Object.defineProperty(cls, 'isClass', {value: true});

                return ns[key]
            }

            return ns
        }
    }

    /**
     * Tests if a given object is an instance of a class created by this factory
     * @param {Object} record
     * @returns {Boolean}
     */
    isRecord(record) {
        return record?.isRecord || false
    }

    /**
     * Gets triggered after changing the value of a record field.
     * E.g. myRecord.foo = 'bar';
     * @param {Object} opts
     * @param {Object[]} opts.fields Each field object contains the keys: name, oldValue, value
     * @param {Neo.data.Model} opts.model The model instance of the changed record
     * @param {Object} opts.record
     */
    onRecordChange(opts) {
        Neo.get(opts.model.storeId)?.onRecordChange(opts)
    }

    /**
     * @param {Object}  data
     * @param {Object}  data.record
     * @param {Object}  data.field
     * @param {*}       [data.value=null]
     * @param {Object}  [data.recordConfig=null]
     * @param {Boolean} [data.useOriginalData=false]
     * @returns {*}
     */
    parseRecordValue({record, field, value=null, recordConfig=null, useOriginalData=false}) {
        if (field.calculate) {
            return field.calculate(record[useOriginalData ? originalDataSymbol : dataSymbol], field)
        }

        if (field.convert) {
            value = field.convert(value)
        }

        let fieldName = field.name,
            {mapping, maxLength, minLength, nullable} = field,
            oldValue  = recordConfig?.[fieldName] || record[fieldName],
            type      = field.type?.toLowerCase();

        // only trigger mappings for initial values
        // dynamic changes of a field will not pass the recordConfig
        if (mapping && recordConfig) {
            let ns  = mapping.split('.'),
                key = ns.pop();

            ns    = Neo.ns(ns, true, recordConfig);
            value = ns[key]
        }

        if (Object.hasOwn(field, 'maxLength')) {
            if (value?.toString().length > maxLength) {
                console.warn(`Setting record field: ${fieldName} value: ${value} conflicts with maxLength: ${maxLength}`);
                return oldValue
            }
        }

        if (Object.hasOwn(field, 'minLength')) {
            if (value?.toString().length < minLength) {
                console.warn(`Setting record field: ${fieldName} value: ${value} conflicts with minLength: ${minLength}`);
                return oldValue
            }
        }

        if (Object.hasOwn(field, 'nullable')) {
            if (nullable === false && value === null) {
                console.warn(`Setting record field: ${fieldName} value: ${value} conflicts with nullable: ${nullable}`);
                return oldValue
            }
        }

        if (type === 'date' && Neo.typeOf(value) !== 'Date') {
            return new Date(value)
        }

        else if (type === 'float' && value) {
            value = parseFloat(value)
        }

        else if (type === 'html' && value) {
            value = value + ''
        }

        else if ((type === 'int' || type === 'integer') && value) {
            value = parseInt(value)
        }

        else if (type === 'string' && value) {
            value = value + '';
            value =  value.replace(/(<([^>]+)>)/ig, '')
        }

        return value
    }

    /**
     * @param {Object}         data
     * @param {String}         data.fieldName
     * @param {Neo.data.Model} data.model
     * @param {Record}         data.record
     * @param {Boolean}        data.useOriginalData=false true will apply changes to the originalData symbol
     * @param {*}              data.value
     * @protected
     */
    setRecordData({fieldName, model, record, useOriginalData=false, value}) {
        if (useOriginalData && !model.trackModifiedFields) {
            return
        }

        let scope = useOriginalData ? originalDataSymbol : dataSymbol;

        if (model.hasNestedFields && fieldName.includes('.')) {
            let ns, nsArray;

            nsArray   = fieldName.split('.');
            fieldName = nsArray.pop();
            ns        = Neo.ns(nsArray, true, record[scope]);

            ns[fieldName] = value
        } else {
            record[scope][fieldName] = value
        }
    }

    /**
     * @param {Object}         data
     * @param {Object[]}       data.changedFields=[] Internal flag
     * @param {Object}         data.fields
     * @param {Neo.data.Model} data.model
     * @param {Object}         data.record
     * @param {Boolean}        data.silent=false
     * @param {Boolean}        data.useOriginalData=false true will apply changes to the originalData symbol
     */
    setRecordFields({changedFields=[], fields, model, record, silent=false, useOriginalData=false}) {
        let me = this,
            {calculatedFieldsMap, fieldsMap, trackModifiedFields} = model,
            fieldExists, hasChangedFields, oldValue;

        if (!trackModifiedFields && useOriginalData) {
            return
        }

        Object.entries(fields).forEach(([key, value]) => {
            fieldExists = fieldsMap.has(key);

            if (Neo.isObject(value) && !fieldExists) {
                Object.entries(value).forEach(([childKey, childValue]) => {
                    me.setRecordFields({
                        changedFields,
                        fields: {[`${key}.${childKey}`]: childValue},
                        model,
                        record,
                        silent: true,
                        useOriginalData
                    })
                })
            } else if (fieldExists) {
                oldValue = record[key];
                value    = me.parseRecordValue({record, field: model.getField(key), value});

                if (!Neo.isEqual(oldValue, value)) {
                    me.setRecordData({fieldName: key, model, record, useOriginalData, value});

                    if (!trackModifiedFields && !useOriginalData) {
                        record[isModifiedSymbol] = true
                    }

                    changedFields.push({name: key, oldValue, value})
                }
            }
        });

        hasChangedFields = Object.keys(changedFields).length > 0;

        if (hasChangedFields) {
            calculatedFieldsMap.forEach((value, key) => {
                oldValue = record[key];
                value    = me.parseRecordValue({record, field: model.getField(key), useOriginalData});

                if (!Neo.isEqual(oldValue, value)) {
                    me.setRecordData({fieldName: key, model, record, useOriginalData, value});

                    changedFields.push({name: key, oldValue, value})
                }
            })
        }

        if (!silent && !useOriginalData && hasChangedFields) {
            me.onRecordChange({fields: changedFields, model, record})
        }
    }
}

instance = Neo.setupClass(RecordFactory);

export default instance;

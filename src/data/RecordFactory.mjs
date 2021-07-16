import Base   from '../core/Base.mjs';
import Logger from '../core/Logger.mjs';
import Model  from './Model.mjs';

let instance;

/**
 * @class Neo.data.RecordFactory
 * @extends Neo.core.Base
 * @singleton
 */
class RecordFactory extends Base {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.data.RecordFactory'
         * @protected
         */
        className: 'Neo.data.RecordFactory',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true,
        /**
         * The internal record prefix for original field values.
         * Only used in case the model has trackModifiedFields set to true.
         * @member {String} ovPrefix='ov_'
         */
        ovPrefix: 'ov_',
        /**
         * @member {String} recordNamespace='Neo.data.record.'
         */
        recordNamespace: 'Neo.data.record.'
    }}

    /**
     *
     * @param {Neo.data.Model} model
     * @param {Object} config
     * @returns {Object}
     */
    createRecord(model, config) {
        let recordClass = Neo.ns(this.recordNamespace + model.className);

        if (!recordClass) {
            recordClass = this.createRecordClass(model);
        }

        return new recordClass(config);
    }

    /**
     *
     * @param {Neo.data.Model} model
     * @returns {Object}
     */
    createRecordClass(model) {
        if (model instanceof Model) {
            let className = this.recordNamespace + model.className,
                ns        = Neo.ns(className),
                key, nsArray;

            if (!ns) {
                nsArray = className.split('.');
                key     = nsArray.pop();
                ns      = Neo.ns(nsArray, true);
                ns[key] = class Record {
                    constructor(config) {
                        let me = this,
                            properties;

                        Object.defineProperties(me, {
                            _isModified: {
                                value   : false,
                                writable: true
                            }
                        });

                        if (Array.isArray(model.fields)) {
                            model.fields.forEach(field => {
                                let parsedValue = instance.parseRecordValue(field, config[field.name]),
                                    symbol      = Symbol.for(field.name);

                                properties = {
                                    [symbol]: {
                                        value   : parsedValue,
                                        writable: true
                                    },
                                    [field.name]: {
                                        configurable: true,
                                        enumerable  : true,
                                        get() {
                                            return this[symbol];
                                        },
                                        set(value) {
                                            let me       = this,
                                                oldValue = me[symbol];

                                            if (!Neo.isEqual(value, oldValue)) {
                                                value = instance.parseRecordValue(field, value);

                                                me[symbol] = value;

                                                me._isModified = true;
                                                me._isModified = instance.isModified(me, model.trackModifiedFields);

                                                instance.onRecordChange({
                                                    fields: [{name: field.name, oldValue, value}],
                                                    model,
                                                    record: me
                                                });
                                            }
                                        }
                                    }
                                };

                                // adding the original value of each field
                                if (model.trackModifiedFields) {
                                    properties[instance.ovPrefix + field.name] = {
                                        value: parsedValue
                                    }
                                }

                                Object.defineProperties(me, properties);
                            });
                        }
                    }

                    /**
                     * Bulk-update multiple record fields at once
                     * @param {Object} fields
                     */
                    set(fields) {
                        instance.setRecordFields(model, this, fields);
                    }
                };

                ns[key].isClass = true;

                return ns[key];
            }

            return ns;
        }
    }

    /**
     *
     * @param {Object} record
     * @param {Boolean} trackModifiedFields
     * @returns {Boolean} true in case a change was found
     */
    isModified(record, trackModifiedFields) {
        if (trackModifiedFields) {
            let fields = Object.keys(record),
                i      = 0,
                len    = fields.length,
                field;

            for (; i < len; i++) {
                field = fields[i];

                if (!Neo.isEqual(record[field], record[this.ovPrefix + field])) {
                    return true;
                }
            }

            return false;
        }

        return record._isModified;
    }

    /**
     *
     * @param {Object} record
     * @param {String} fieldName
     * @returns {Boolean|null} null in case the model does not use trackModifiedFields, true in case a change was found
     */
    isModifiedField(record, fieldName) {
        if (!record.hasOwnProperty(fieldName)) {
            Logger.logError('The record does not contain the field', fieldName, record);
        }

        let modifiedField = this.ovPrefix + fieldName;

        if (record.hasOwnProperty(modifiedField)) {
            return !Neo.isEqual(record[fieldName], record[modifiedField]);
        }

        return null;
    }

    /**
     * Tests if a given object is an instance of a class created by this factory
     * @param {Object} obj
     * @returns {Boolean}
     */
    isRecord(obj) {
        return obj?.constructor.name === 'Record';
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
        Neo.get(opts.model.storeId)?.onRecordChange(opts);
    }

    /**
     * todo: parse value for more field types
     * @param {Object} field
     * @param {*} value
     * @returns {*}
     */
    parseRecordValue(field, value) {
        const type = field?.type.toLowerCase();

        if (type === 'date') {
            return new Date(value);
        }

        return value;
    }

    /**
     *
     * @param {Neo.data.Model} model
     * @param {Object} record
     * @param {Object} fields
     */
    setRecordFields(model, record, fields) {
        let changedFields = [],
            oldValue;

        Object.entries(fields).forEach(([key, value]) => {
            oldValue = record[key];

            if (!Neo.isEqual(oldValue, value)) {
                record[Symbol.for(key)] = value; // silent update
                changedFields.push({name: key, oldValue, value});
            }
        });

        if (Object.keys(changedFields).length > 0) {
            Neo.get(model.storeId)?.onRecordChange({fields: changedFields, model, record});
        }
    }
}

Neo.applyClassConfig(RecordFactory);

instance = Neo.create(RecordFactory);

Neo.applyToGlobalNs(instance);

export default instance;

import Base from './Base.mjs';

/**
 * @class Neo.form.field.Hidden
 * @extends Neo.form.field.Base
 */
class Hidden extends Base {
    static config = {
        /**
         * @member {String} className='Neo.form.field.Hidden'
         * @protected
         */
        className: 'Neo.form.field.Hidden',
        /**
         * @member {String} ntype='hiddenfield'
         * @protected
         */
        ntype: 'hiddenfield',
        /**
         * @member {Boolean} hidden=true
         */
        hidden: true
    }
}

Neo.setupClass(Hidden);

export default Hidden;

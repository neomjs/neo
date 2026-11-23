import Component from '../../../../src/component/Base.mjs';

/**
 * @summary Step 5: the object the form submits, read from the whole form each time the step opens. After Create
 * account it confirms the account and shows what was submitted, until the next edit.
 * @class Form.view.pages.ReviewPage
 * @extends Neo.component.Base
 */
class ReviewPage extends Component {
    static config = {
        /**
         * @member {String} className='Form.view.pages.ReviewPage'
         * @protected
         */
        className: 'Form.view.pages.ReviewPage',
        /**
         * @member {String[]} cls=['form-page','form-review']
         * @reactive
         */
        cls: ['form-page', 'form-review'],
        /**
         * The form's submit values when the step opened
         * @member {Object|null} preview_=null
         * @reactive
         */
        preview_: null,
        /**
         * The values Create account submitted
         * @member {Object|null} submitted_=null
         * @reactive
         */
        submitted_: null,
        /**
         * @member {Object} vdom
         */
        vdom:
        {cn: [
            {cls: ['form-review-done'], removeDom: true, cn: [
                {tag: 'i', cls: ['fas', 'fa-circle-check']},
                {tag: 'span'}
            ]},
            {tag: 'p', cls: ['form-review-lead'], text: 'This is the object the form submits. Create account checks every step first.'},
            {tag: 'pre', cls: ['form-review-values']}
        ]}
    }

    /**
     * @summary Reads the whole form's values each time the step opens, so an edit on an earlier step shows here.
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetMounted(value, oldValue) {
        super.afterSetMounted(value, oldValue);

        let me = this;

        value && me.up('form-container')?.getSubmitValues().then(values => {
            me.isDestroyed || (me.preview = values)
        })
    }

    /**
     * @param {Object|null} value
     * @param {Object|null} oldValue
     * @protected
     */
    afterSetPreview(value, oldValue) {
        this.updateValues()
    }

    /**
     * @param {Object|null} value
     * @param {Object|null} oldValue
     * @protected
     */
    afterSetSubmitted(value, oldValue) {
        let me           = this,
            [done, lead] = me.vdom.cn,
            person       = value?.person;

        done.removeDom  = !value;
        done.cn[1].text = value ? `Account created for ${person.firstName} ${person.lastName}. The form submitted this object:` : '';
        lead.removeDom  = !!value;

        me.updateValues()
    }

    /**
     * @summary Shows the submitted values once there are some, else the values of the open form.
     */
    updateValues() {
        let me     = this,
            values = me.submitted || me.preview;

        me.vdom.cn[2].text = values ? JSON.stringify(values, null, 2) : '';
        me.update()
    }
}

export default Neo.setupClass(ReviewPage);

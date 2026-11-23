import Component from '../../../src/controller/Component.mjs';

/**
 * @summary Moves through the steps of the account form. Next validates the open step, Create account validates every
 * step and submits the whole form, and the step list moves freely.
 * @class Form.view.ViewportController
 * @extends Neo.controller.Component
 */
class ViewportController extends Component {
    static config = {
        /**
         * @member {String} className='Form.view.ViewportController'
         * @protected
         */
        className: 'Form.view.ViewportController'
    }

    /**
     * @param {Object} data
     */
    onBackButtonClick(data) {
        this.showStep(this.getStateProvider().data.activeIndex - 1)
    }

    /**
     * @summary Validates every step in order. The first invalid one opens and says what is wrong; with none, the
     * review step shows the submitted values. They go to the review step itself: a state provider would split the
     * object into one data path per leaf.
     * @param {Object} data
     */
    async onCreateAccountButtonClick(data) {
        let me    = this,
            form  = me.getReference('main-form'),
            count = me.getReference('pages-container').items.length,
            i     = 0;

        // the steps load on demand: validate the ones the visitor never opened, too
        await form.loadModules();

        for (; i < count; i++) {
            if (!await me.validateStep(i)) {
                return
            }
        }

        me.setState({stepMessage: null});
        me.getReference('review').submitted = await form.getSubmitValues()
    }

    /**
     * @summary An edit makes the last check stale: the edited step loses its valid mark until Next or Create account
     * checks it again, and the review step shows the open form instead of the object Create account submitted.
     * @param {Object} data
     * @param {Neo.form.field.Base} data.component The edited field
     */
    onFieldUserChange({component}) {
        let me     = this,
            index  = me.getReference('pages-container').items.indexOf(component.up('form-container')),
            record = index > -1 ? me.getStateProvider().getStore('sideNav').getAt(index) : null,
            review = me.getReference('review');

        if (record?.formState === 'valid') {
            record.formState = 'clean'
        }

        if (review?.submitted) {
            review.submitted = null
        }
    }

    /**
     * @param {Object} data
     */
    async onNextButtonClick(data) {
        let me            = this,
            {activeIndex} = me.getStateProvider().data;

        if (await me.validateStep(activeIndex)) {
            me.showStep(activeIndex + 1)
        }
    }

    /**
     * @summary Unfolds the step list above the form on a phone, or folds it away again.
     * @param {Object} data
     */
    onStepsButtonClick(data) {
        this.setState({stepsOpen: !this.getStateProvider().data.stepsOpen})
    }

    /**
     * @summary Opens a step, clears the message of the step before, and folds a phone's step list away.
     * @param {Number} index
     * @param {String|null} [stepMessage=null]
     */
    showStep(index, stepMessage=null) {
        let record = this.getStateProvider().getStore('sideNav').getAt(index);

        this.setState({activeIndex: index, activeTitle: record.name, stepMessage, stepsOpen: false})
    }

    /**
     * @summary Validates one step and marks it in the step list. An invalid step opens and names its invalid fields:
     * a checkbox or radio group by the label of its first item.
     * @param {Number} index
     * @returns {Promise<Boolean>}
     */
    async validateStep(index) {
        let me     = this,
            page   = me.getReference('pages-container').items[index],
            record = me.getStateProvider().getStore('sideNav').getAt(index),
            fields, labels;

        // the review step holds no field
        if (!page.validate) {
            return true
        }

        if (await page.validate()) {
            record.formState = 'valid';
            return true
        }

        fields = await page.getFields();
        labels = [...new Set(fields.filter(field => !field.isValid()).map(field => field.name))]
            .map(name => fields.find(field => field.name === name && field.labelText)?.labelText || name);

        record.formState = 'invalid';
        me.showStep(index, `Check ${labels.join(', ')}`);

        return false
    }
}

export default Neo.setupClass(ViewportController);

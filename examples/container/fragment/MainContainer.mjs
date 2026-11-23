import Button                from '../../../src/button/Base.mjs';
import CheckBox              from '../../../src/form/field/CheckBox.mjs';
import ConfigurationViewport from '../../ConfigurationViewport.mjs';
import FormContainer         from '../../../src/form/Container.mjs';
import Fragment              from '../../../src/container/Fragment.mjs';
import Panel                 from '../../../src/container/Panel.mjs';
import TextField             from '../../../src/form/field/Text.mjs';

/**
 * @summary A shipping form whose address fields are grouped by `Neo.container.Fragment`. The form lays its fields out
 * in a CSS grid, and the fragment's fields take their grid cells as the form's own children: beside the form, its DOM
 * lists them, read from the page. The inspector hides the group at once, or moves it to the top as one unit.
 * @class Neo.examples.container.fragment.MainContainer
 * @extends Neo.examples.ConfigurationViewport
 */
class MainContainer extends ConfigurationViewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.container.fragment.MainContainer'
         * @protected
         */
        className: 'Neo.examples.container.fragment.MainContainer',
        /**
         * @member {Boolean} autoMount=true
         */
        autoMount: true,
        /**
         * @member {String[]} cls=['examples-fragment']
         * @reactive
         */
        cls: ['examples-fragment'],
        /**
         * @member {String} componentName='Fragment'
         */
        componentName: 'Fragment',
        /**
         * @member {Number} configItemLabelWidth=160
         */
        configItemLabelWidth: 160,
        /**
         * @member {Number} configItemWidth=280
         */
        configItemWidth: 280,
        /**
         * @member {Object} layout={ntype:'hbox',align:'stretch'}
         * @reactive
         */
        layout: {ntype: 'hbox', align: 'stretch'}
    }

    /**
     * @returns {Object[]}
     */
    createConfigurationComponents() {
        let me = this;

        return [{
            module        : CheckBox,
            hideLabel     : true,
            hideValueLabel: false,
            listeners     : {change: me.onHiddenChange.bind(me)},
            valueLabel    : 'Hide the address'
        }, {
            module : Button,
            handler: me.onMoveClick.bind(me),
            style  : {marginTop: '10px'},
            text   : 'Move the address to the top'
        }]
    }

    /**
     * @summary Returns the shipping `Neo.form.Container` config grouping address fields inside a `Neo.container.Fragment`.
     * @returns {Object}
     */
    createExampleComponent() {
        const field = (labelText, name, value) => ({module: TextField, labelPosition: 'top', labelText, name, value});

        return {
            module: FormContainer,
            cls   : ['fragment-form'],
            layout: 'base',
            width : 460,

            items: [
                field('Name',  'name',  'Ana Silva'),
                field('Email', 'email', 'ana@example.com'),
                {
                    module   : Fragment,
                    reference: 'address',
                    items    : [
                        field('Street',   'street',   'Rua das Flores 12'),
                        field('City',     'city',     'Porto'),
                        field('Postcode', 'postcode', '4050-262'),
                        field('Country',  'country',  'Portugal')
                    ]
                },
                field('Phone', 'phone', '+351 912 345 678')
            ]
        }
    }

    /**
     * @summary The panel listing the form's DOM children.
     * @returns {Object[]}
     */
    createStageItems() {
        return [{
            module : Panel,
            cls    : ['fragment-dom'],
            headers: [{dock: 'top', items: [{ntype: 'label', text: 'The form\'s DOM'}]}],

            items: [{
                ntype    : 'component',
                cls      : ['fragment-dom-list'],
                reference: 'dom-list'
            }, {
                ntype: 'component',
                cls  : ['fragment-dom-note'],
                html : 'The fragment adds no element: the address fields are children of the form itself, between two comments that mark the group.'
            }]
        }]
    }

    /**
     * @summary Lists the form's DOM children once it is on the page.
     */
    onConstructed() {
        super.onConstructed();

        this.exampleComponent.on('mounted', () => this.refreshDom(), this, {once: true})
    }

    /**
     * @param {Object} data
     * @param {Boolean} data.value
     */
    async onHiddenChange({value}) {
        let fragment = this.getItem('address');

        fragment.hidden = value;
        await this.exampleComponent.promiseUpdate();
        await this.refreshDom()
    }

    /**
     * @summary Moves the whole fragment, its fields with it, to the top of the form.
     * @param {Object} data
     */
    async onMoveClick(data) {
        let form = this.exampleComponent;

        form.insert(0, this.getItem('address'));
        data.component.disabled = true;

        await form.promiseUpdate();
        await this.refreshDom()
    }

    /**
     * @summary Reads the form element's children from the page, in DOM order, and names each by its field.
     */
    async refreshDom() {
        let me       = this,
            form     = me.exampleComponent,
            fragment = me.getItem('address'),
            ids      = await Neo.main.DomAccess.getChildNodeIds({id: form.id, windowId: form.windowId}) || [];

        me.getItem('dom-list').html = ids.map(id => {
            let field      = Neo.getComponent(id) || Neo.getComponent(id.split('__')[0]),
                inFragment = field?.parentId === fragment.id;

            return `<div class="fragment-dom-row${inFragment ? ' in-fragment' : ''}">` +
                `<code>&lt;div&gt;</code> ${field?.labelText || id}${inFragment ? '<span>fragment</span>' : ''}</div>`
        }).join('')
    }
}

export default Neo.setupClass(MainContainer);

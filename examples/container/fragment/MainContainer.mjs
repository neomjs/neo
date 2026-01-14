import Button        from '../../../src/button/Base.mjs';
import FormContainer from '../../../src/form/Container.mjs';
import Fragment      from '../../../src/container/Fragment.mjs';
import TextField     from '../../../src/form/field/Text.mjs';

/**
 * @class Neo.examples.container.fragment.MainContainer
 * @extends Neo.form.Container
 */
class MainContainer extends FormContainer {
    static config = {
        className: 'Neo.examples.container.fragment.MainContainer',
        autoMount: true,
        layout   : {ntype: 'vbox', align: 'start'},
        style    : {padding: '20px'},

        items: [{
            module   : TextField,
            labelText: 'Field 1 (Outside)',
            name     : 'field1',
            reference: 'field1'
        }, {
            module   : TextField,
            labelText: 'Field 2 (Outside)',
            name     : 'field2'
        }, {
            module   : TextField,
            labelText: 'Field 3 (Outside)',
            name     : 'field3'
        }, {
            module   : Fragment,
            reference: 'myFragment',
            items    : [{
                module   : TextField,
                labelText: 'Fragment Field 1',
                name     : 'fragField1',
                reference: 'fragField1'
            }, {
                module   : TextField,
                labelText: 'Fragment Field 2',
                name     : 'fragField2'
            }, {
                module   : TextField,
                labelText: 'Fragment Field 3',
                name     : 'fragField3'
            }, {
                module   : TextField,
                labelText: 'Fragment Field 4',
                name     : 'fragField4'
            }]
        }, {
            module   : TextField,
            labelText: 'Field 4 (Outside)',
            name     : 'field4'
        }, {
            module   : TextField,
            labelText: 'Field 5 (Outside)',
            name     : 'field5'
        }, {
            ntype : 'container',
            layout: {ntype: 'hbox', gap: '10px'},
            style : {marginTop: '20px'},
            items : [{
                module : Button,
                text   : 'Toggle Fragment',
                handler: 'up.onToggleFragment'
            }, {
                module : Button,
                text   : 'Move Field 1 into Fragment',
                handler: 'up.onMoveIntoFragment'
            }, {
                module : Button,
                text   : 'Move Fragment Field 1 Out',
                handler: 'up.onMoveOutFragment'
            }]
        }]
    }

    /**
     * @param {Object} data
     */
    onToggleFragment(data) {
        const fragment = this.getReference('myFragment');
        fragment.hidden = !fragment.hidden;
    }

    /**
     * @param {Object} data
     */
    onMoveIntoFragment(data) {
        const
            field    = this.getReference('field1'),
            fragment = this.getReference('myFragment');

        fragment.insert(0, field);
        data.component.disabled = true;
    }

    /**
     * @param {Object} data
     */
    onMoveOutFragment(data) {
        const
            field = this.getReference('fragField1'),
            me    = this;

        me.insert(0, field);
        data.component.disabled = true;
    }
}

Neo.setupClass(MainContainer);

export default MainContainer;

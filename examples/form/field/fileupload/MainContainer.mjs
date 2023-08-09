import ConfigurationViewport from '../../../ConfigurationViewport.mjs';
import FileUploadField       from '../../../../src/form/field/FileUpload.mjs';
import NumberField           from '../../../../src/form/field/Number.mjs';

/**
 * @class Neo.examples.form.field.text.MainContainer
 * @extends Neo.examples.ConfigurationViewport
 */
class MainContainer extends ConfigurationViewport {
    static config = {
        className           : 'Neo.examples.form.field.text.MainContainer',
        autoMount           : true,
        configItemLabelWidth: 160,
        layout              : {ntype: 'hbox', align: 'stretch'}
    }

    createConfigurationComponents() {
        let me = this;

        return [{
            module   : NumberField,
            labelText: 'width',
            listeners: {change: me.onConfigChange.bind(me, 'width')},
            maxValue : 300,
            minValue : 50,
            stepSize : 5,
            style    : {marginTop: '10px'},
            value    : me.exampleComponent.width
        }];
    }

    createExampleComponent() {
        return Neo.create(FileUploadField, {
            id        : 'my-test',
            uploadUrl : 'file-upload-test',
            height    :  50,
            width     : 200,
            types     : {
                'image/png'       : 1,
                'application/pdf' : 1
            },
            maxSize   : '10mb'
        });
    }
}

Neo.applyClassConfig(MainContainer);

export default MainContainer;

import MainContainer from './MainContainer.mjs';

const onStart = () => Neo.app({
    appPath : 'examples/form/field/trigger/copyToClipboard',
    mainView: MainContainer,
    name    : 'Neo.examples.form.field.trigger.copyToClipboard'
});

export {onStart as onStart};
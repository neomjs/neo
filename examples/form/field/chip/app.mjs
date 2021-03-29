import MainContainer from './MainContainer.mjs';

const onStart = () => Neo.app({
    appPath : 'examples/form/field/chip/',
    mainView: MainContainer,
    name    : 'Neo.examples.form.field.chip'
});

export {onStart as onStart};
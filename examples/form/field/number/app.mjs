import MainContainer from './MainContainer.mjs';

const onStart = () => Neo.app({
    appPath : 'examples/form/field/number/',
    mainView: MainContainer,
    name    : 'Neo.examples.form.field.number'
});

export {onStart as onStart};
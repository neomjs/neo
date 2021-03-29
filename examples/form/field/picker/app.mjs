import MainContainer from './MainContainer.mjs';

const onStart = () => Neo.app({
    appPath : 'examples/form/field/picker/',
    mainView: MainContainer,
    name    : 'Neo.examples.form.field.picker'
});

export {onStart as onStart};
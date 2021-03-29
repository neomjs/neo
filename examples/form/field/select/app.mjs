import MainContainer from './MainContainer.mjs';

const onStart = () => Neo.app({
    appPath : 'examples/form/field/select/',
    mainView: MainContainer,
    name    : 'Neo.examples.form.field.select'
});

export {onStart as onStart};
import MainContainer from './MainContainer.mjs';

const onStart = () => Neo.app({
    appPath : 'examples/form/field/email/',
    mainView: MainContainer,
    name    : 'Neo.examples.form.field.email'
});

export {onStart as onStart};
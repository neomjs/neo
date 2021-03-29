import MainContainer from './MainContainer.mjs';

const onStart = () => Neo.app({
    appPath : 'examples/form/field/date/',
    mainView: MainContainer,
    name    : 'Neo.examples.form.field.date'
});

export {onStart as onStart};
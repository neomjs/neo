import MainContainer from './MainContainer.mjs';

const onStart = () => Neo.app({
    appPath : 'examples/form/field/time/',
    mainView: MainContainer,
    name    : 'Neo.examples.form.field.time'
});

export {onStart as onStart};
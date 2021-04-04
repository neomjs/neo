import MainContainer from './MainContainer.mjs';

const onStart = () => Neo.app({
    appPath : 'examples/form/field/url/',
    mainView: MainContainer,
    name    : 'Neo.examples.form.field.url'
});

export {onStart as onStart};
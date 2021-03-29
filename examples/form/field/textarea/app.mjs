import MainContainer from './MainContainer.mjs';

const onStart = () => Neo.app({
    appPath : 'examples/form/field/textarea/',
    mainView: MainContainer,
    name    : 'Neo.examples.form.field.textarea'
});

export {onStart as onStart};
// Important: You need to import all classes which you want to use inside tests here
// (excluding base classes (prototypes) of already imported classes)

import Button       from '../../src/button/Base.mjs';
import DateSelector from '../../src/component/DateSelector.mjs';
import SelectField  from '../../src/form/field/Select.mjs';

export const onStart = () => Neo.app({name: 'AppEmpty'})

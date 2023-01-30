# neo.mjs Coding Guidelines

Inside the neo repo the following coding guidelines are mandatory.
They ensure a high code quality and consistency.
We strongly recommend to also stick to them when creating your own workspaces and apps via `npx neo-app`.

## Content
1. import statements


## 1. import statements
```
import Container           from '../../../node_modules/neo.mjs/src/container/Base.mjs';
import EarthquakesTable    from './earthquakes/Table.mjs';
import GoogleMapsComponent from '../../../node_modules/neo.mjs/src/component/wrapper/GoogleMaps.mjs';
import Toast               from '../../../node_modules/neo.mjs/src/component/Toast.mjs';
import ViewController      from './MainViewController.mjs';
import ViewModel           from './MainViewModel.mjs';
```
* Use block formatting. This makes it easy to spot invalid paths.
* Use single quotes.
* Imports get sorted by module name. There are ongoing discussions if we should switch to a path based sorting.

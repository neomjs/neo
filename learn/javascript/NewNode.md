```javascript readonly
import Base from '../../../node_modules/neo.mjs/src/core/Base.mjs';

class Mammal extends Base {
    static config = {
        className: 'Simple.example.Mammal'
    }
}

const myMammal = Neo.create(Mammal);

Mammal = Neo.setupClass(Mammal); // Where Neo.mjs initializes the class config. 
export default Mammal;        // Makes the class available elsewhere.
```



```javascript live-preview
import Base from '../../../node_modules/neo.mjs/src/core/Base.mjs';

class Mammal extends Base {
    static config = {
        className: 'Simple.example.Mammal'
    }
}

const myMammal = Neo.create(Mammal);

Mammal = Neo.setupClass(Mammal); // Where Neo.mjs initializes the class config. 
export default Mammal;        // Makes the class available elsewhere.
```

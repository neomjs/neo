Neo.mjs uses standard modular JavaScript, so you're free to use other class 
features, like private members.
<pre><code class="javascript">
class Human extends Mammal {
    static config = {
        className: 'Simple.example.Human',
        name     : 'J. Doe',
        married  : false
    }

    static #privateStaticField = 'foo'

    #privateInstanceField = 'bar'

    #privateInstanceMethod() {
        console.log(`Psst. Don't tell anyone, but ${this.#privateInstanceField} and ${Human.#privateStaticField}`);
    }

    speak(tellSecret) {
        console.log(`Hello! My name is ${this.name}. I am ${this.married?'':'not'} married.`);
        if (tellSecret) this.#privateInstanceMethod();
    }

    yodel() {
        console.log('Yodelay hee hoo!');
    }
}

Neo.setupClass(Human);

const myPerson = Neo.create(Human, {
    name: 'Herbert'
});

myPerson.speak(true);
</code></pre>

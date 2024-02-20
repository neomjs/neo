To call a super-class method use the `super` keyword.

<pre class="neo" style="color:gray">
class Mammal extends Base {
    static config = {
        className: 'Simple.example.Mammal',

        name: 'Anonymous'
    }
    doSomething(){
        console.log(`${this.name} is doing something mammals do`)
    }
}
Neo.setupClass(Mammal);
</pre>
<pre class="neo" style="color:gray">
class Human extends Mammal {
    static config = {
        className: 'Simple.example.Human',
    }
    doSomething(){
        <span style="color:#b91010">super.doSomething();</span>
        console.log(`${this.name} is doing something humans do`)
    }
}

const myPerson = Neo.create(Human, {
    name: 'Herbert'
});
myPerson.doSomething();

Neo.setupClass(Mammal);
</pre>

Sometimes you aren't sure if a super class has a method. In that case use the
conditional chaining operator &mdash; `?.`

<pre class="neo" style="color:gray">
class Mammal extends Base {
    static config = {
        className: 'Simple.example.Mammal',

        name: 'Anonymous'
    }
    doSomething(){
        console.log(`${this.name} is doing something mammals do`)
    }
}
Neo.setupClass(Mammal);
</pre>
<pre class="neo" style="color:gray">
class Human extends Mammal {
    static config = {
        className: 'Simple.example.Human',
    }
    doSomething(){
        <span style="color:#b91010">super?.doSomething();</span>
        console.log(`${this.name} is doing something humans do`)
    }
}

const myPerson = Neo.create(Human, {
    name: 'Herbert'
});
myPerson.doSomething();

Neo.setupClass(Mammal);
</pre>

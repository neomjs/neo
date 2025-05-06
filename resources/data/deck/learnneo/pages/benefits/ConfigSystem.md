## Introduction

Modern JavaScript frameworks have revolutionized front-end development by providing declarative ways to build
user interfaces, primarily centered around enhancing HTML with custom syntax like JSX or Angular directives.
However, the complexity of applications extends far beyond the Document Object Model (DOM), encompassing crucial 
non-DOM entities such as data stores, state providers, routers, view controllers, selection models, and layouts.
While existing frameworks offer solutions for managing these aspects, they often lack a truly consistent, declarative,
and nested approach to their configuration, a gap that a class config system aims to fill.

As a bad example, I recently found this Angular code snippet (new public API draft) on LinkedIn:
<pre data-javascript>
// MyComponent with an attribute
<MyComponent myAttribute="someValue" />

// MyComponent with an input binding
<MyComponent [myInput]="mySignal()" />

// MyComponent is the host element
<MyComponent @MyDirective />

// Same as the selector: a[mat-button], anchor element is the host element
<MatButton:a></MatButton:a>

// Scoped inputs for MyDirective
<MyComponent @MyDirective(input1="someString" [input2]="mySignal()") />
</pre>

Now you might wonder why I think that this is not a good way to create apps.

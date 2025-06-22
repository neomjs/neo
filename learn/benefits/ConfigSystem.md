## Introduction

Modern JavaScript frameworks have revolutionized front-end development by providing declarative ways to build
user interfaces, primarily centered around enhancing HTML with custom syntax like JSX or Angular directives.
However, the complexity of applications extends far beyond the Document Object Model (DOM), encompassing crucial 
non-DOM entities such as data stores, state providers, routers, view controllers, selection models, and layouts.
While existing frameworks offer solutions for managing these aspects, they often lack a truly consistent, declarative,
and nested approach to their configuration, a gap that a class config system aims to fill.

## A bad example
I recently found this Angular code snippet (new public API draft) on LinkedIn:

<pre data-code-readonly>
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

Currently, the configuration and management of these non-DOM entities can feel somewhat disparate across different
frameworks. State management, for instance, might involve dedicated libraries (like Redux or Vuex), routing is
handled by router-specific configurations, and layouts might be defined through a mix of component composition and
potentially separate layout configurations. While these solutions are functional, they don't always present a
unified configuration tree that mirrors the nested, hierarchical structure often used for describing the UI.
The syntax and patterns for configuring a data store can be quite different from those used to define a route or
a view controller.

This is where the benefit of a class config system becomes apparent. The vision is a system that allows developers
to describe the desired state and relationships of all application components, regardless of whether they directly
interact with the DOM, using a consistent, declarative, and nested configuration structure.

Imagine defining your application's data stores, their initial states, and how they relate to each other, alongside
the routes of your application, the view controllers responsible for handling those routes, and the layouts they will
use – all within a unified configuration syntax. This nested structure would clearly illustrate the dependencies and
composition of the application's various parts, offering a holistic view that is often obscured when non-DOM elements
are configured in isolation using different mechanisms.

## Key advantages
A class config system, by treating all application entities as configurable classes within a unified hierarchy,
offers several key advantages:

* ***Consistency***: Provides a single, predictable way to configure any part of the application, reducing the cognitive load on developers who would otherwise need to learn and context-switch between different configuration paradigms for DOM and non-DOM elements.
* ***Declarative Clarity***: Enables developers to declare the desired state and relationships of their application's components in a clear and concise manner, rather than writing imperative code to set up and connect these entities. This improves readability and maintainability.
* ***Nested Structure***: Allows for the natural expression of hierarchical relationships between components, whether they are parent-child UI elements or a router managing various routes, each with associated view controllers and data requirements. This mirrors the often tree-like structure of applications.
* ***Improved Maintainability***: Changes to the application's structure or behavior can be made in a centralized and organized configuration, rather than spread across various imperative code snippets and disparate configuration files.
* ***Enhanced Tooling and Abstraction***: A unified system provides a solid foundation for building powerful development tools, such as visual editors or automatic documentation generators, that can understand and manipulate the entire application's structure. It also allows for higher levels of abstraction, potentially simplifying the definition of complex application patterns.
* ***Reactive Configuration***: Similar to how UI frameworks react to state changes and update the DOM, a reactive class config system can react to changes in the configuration itself (in a development context, for example) to facilitate hot module replacement or dynamic updates of non-DOM entities.

While existing frameworks have made significant strides in declarative UI development, the concept of extending this
declarative, nested configuration approach consistently to all aspects of an application, particularly the non-DOM realm,
represents a powerful next step. A class config system holds the promise of a more unified, maintainable, and
understandable way to build complex modern web applications.

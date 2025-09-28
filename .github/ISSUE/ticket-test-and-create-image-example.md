# Ticket: Test and Use the `createExample` Script to Build an `Image` Example

Parent epic: #7296
GH ticket id: #7305

**Assignee:**
**Labels:** `hacktoberfest`, `good first issue`, `enhancement`, `help wanted`

## Description

This ticket is a hands-on guide to creating a new component example by testing and using our built-in scaffolding tools. Your goal is to create a new, interactive example for `Neo.component.Image`.

This is a high-impact task that tests our developer tooling, creates a new example, and serves as a great learning experience.

### Part 1: Test the `createExample` Script

The framework includes a script to boilerplate new examples, but it needs to be tested.

1.  From the `neo` repository root, run the `createExample` script targeting `Neo.component.Image`. The command should be similar to this:
    ```bash
    node ./buildScripts/tools/createExample.mjs -c Neo.component.Image
    ```
2.  **Document your results:** Does the script run successfully? Does it create a new folder and files in `/examples/component/image/`? Please report any errors or confirm the exact command that worked.

### Part 2: Refine the Generated Example

Assuming the script works, it will generate a `MainContainer.mjs` file with boilerplate configurations.

1.  Open the newly created `examples/component/image/MainContainer.mjs`.
2.  In the `createExampleComponent()` method, set a default `src` for the `Image` instance (you can use any valid image URL).
3.  In the `createConfigurationComponents()` method, remove the boilerplate `height` and `width` fields and add a `TextField` that allows a user to change the `src` property of the `Image` component in real-time. You can look at other examples to see how the `onConfigChange` listener works.

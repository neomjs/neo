---
id: 4051
title: Keycloak integration
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2023-02-13T17:32:40Z'
updatedAt: '2023-03-04T10:38:12Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4051'
author: deniztoprak
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-03-04T10:38:12Z'
---
# Keycloak integration

**Is your feature request related to a problem? Please describe.**
I want to use keycloak Js adapter into my Neo project.

**Describe the solution you'd like**
Creating an add-on for keycloak seems to be the right way to use it. The add-on will have access to global context,  especially to `document` and `window` objects which are needed by the adapter. The app-worker will get a remote access to retrieve the bearer token and login/logout methods.

**Describe alternatives you've considered**
I've considered 2 alternatives:

- Importing the keycloak library into the app: This doesn't work since the keycloak needs web API. The app will run in the app-worker and it will have no access to the global context.
- Embedding keycloak using `<script>` element: This doesn't work either since the keycloak object is stored into `window` and not accessible from the app-worker.

**Additional context**
I'm thinking to configure the add-on over `neo-config.json`.


## Timeline

- 2023-02-13T17:32:40Z @deniztoprak added the `enhancement` label
### @Dinkh - 2023-02-14T15:56:45Z

Hi @deniztoprak,

can you provide me:
- the neo project you want to use with keycloak (if possible)
- the api commands you would like to use

That way I can create the part you are looking for:
- import the script
- give you access to various commands of keycloak

### @deniztoprak - 2023-03-04T10:38:12Z

- It's a client project which uses single sign-on with Keycloak.
- I wanted to use [Keycloak.js ](https://www.npmjs.com/package/keycloak-js) API. The official JS implementation of Keylcloak. It requires `windows` object to setup an iFrame which redirects users to the login page.

The integration would be possible over a Neo plugin but I opted for a custom solution which doesn't require Keycloak.js. I used a backend endpoint to redirect the users to the login page through HTML redirect (302). I think it's better to avoid a dedicated plugin here since it'd be a very specific use case to implement in the core library. Thank you anyway for your help, I'm closing this issue now.

- 2023-03-04T10:38:12Z @deniztoprak closed this issue


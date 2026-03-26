# Google OAuth 2.1 Demo

This hands-on guide demonstrates how to secure your Neo.mjs MCP servers (Knowledge Base or Memory Core) using Google OAuth 2.1. This allows you to restrict access to your AI tools using your organization's Google workspace.

## Prerequisites

1.  A Google Cloud Platform (GCP) project.
2.  The Neo.mjs project cloned and initialized.
3.  The MCP server deployed to a public URL (or using a tunnel like `ngrok` for local testing).

---

## Step 1: Configure Google Cloud Console

1.  Go to the [GCP APIs & Services > Credentials](https://console.cloud.google.com/apis/credentials) page.
2.  Click **Create Credentials** > **OAuth client ID**.
3.  Select **Web application** as the application type.
4.  **Authorized JavaScript origins:** Add the public URL of your MCP server (e.g., `https://mcp.yourdomain.com`).
5.  **Authorized redirect URIs:** Since the MCP server acts as a **Protected Resource**, it doesn't handle the user login redirect itself. However, your **MCP Client** (e.g., VS Code or a custom UI) will need a redirect URI.
6.  Click **Create** and note your **Client ID** and **Client Secret**.

---

## Step 2: Configure the MCP Server

Update your `.env` file or IaC environment variables.

### Using OIDC Discovery (Recommended)
Google provides a standard OIDC discovery endpoint. This is the easiest way to configure the server.

```env
TRANSPORT=sse
SSE_PORT=3000
HOST=mcp.yourdomain.com

# OIDC Discovery
AUTH_ISSUER_URL=https://accounts.google.com
OAUTH_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
OAUTH_CLIENT_SECRET=your-google-client-secret
```

### Protocol Awareness
Ensure `HOST` is set correctly. If your server is behind a load balancer with SSL termination, ensure `HOST` does not include the protocol unless you want to force one. The server will default to `https` for any host other than `localhost`.

---

## Step 3: Technical Nuances

### Token Introspection
Unlike Keycloak, Google does not strictly adhere to the RFC 7662 introspection spec for all token types in the same way. However, for **OpenID Connect**, the MCP SDK handles the validation of the Bearer token. 

### Audience (aud) Validation
Google ID Tokens include the `aud` field, which matches your `OAUTH_CLIENT_ID`. The Neo.mjs MCP server will validate that the incoming token's audience is authorized to access the resource.

> **Note:** In complex scenarios where the client and server use different GCP projects, you may need to configure additional audience mappings in your GCP project.

---

## Step 4: Testing with a Client

When connecting an MCP client (like VS Code) to your server:

1.  The client will hit `https://mcp.yourdomain.com/.well-known/oauth-protected-resource`.
2.  It will discover that the server requires authorization from `https://accounts.google.com`.
3.  The client will initiate the OAuth flow with Google.
4.  Once authorized, the client will send requests with the header:
    `Authorization: Bearer <google_access_token>`

---

## Troubleshooting

### 401 Unauthorized
Verify that the `OAUTH_CLIENT_ID` in your server config matches the one used by the client to obtain the token.

### OIDC Discovery Failure
If the server logs `Failed to fetch OIDC discovery document`, ensure the server has outbound internet access to reach `https://accounts.google.com/.well-known/openid-configuration`.

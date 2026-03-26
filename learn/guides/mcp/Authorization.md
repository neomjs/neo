# MCP Server Authorization Guide

This guide explains how to secure your Neo.mjs Model Context Protocol (MCP) servers using OIDC/OAuth 2.1. This is essential for cloud-native deployments and Infrastructure as Code (IaC) workflows.

## Overview

Neo.mjs MCP servers (Knowledge Base and Memory Core) include built-in support for the standard MCP authorization protocol. This protocol is based on OAuth 2.1 and utilizes Bearer Token authentication with token introspection.

### Core Features
- **OIDC/OAuth 2.1 Integration:** Out-of-the-box support for providers like Keycloak.
- **Protocol-Aware URLs:** Automatic detection of `http` vs `https` based on host and environment.
- **CORS Support:** Pre-configured for cross-origin browser clients.
- **IaC Friendly:** Fully configurable via environment variables.

---

## Configuration

To enable authorization on your MCP server, you must use the **SSE transport** and provide the following environment variables.

### Environment Variables

| Variable | Description | Example |
| :--- | :--- | :--- |
| `AUTH_ISSUER_URL` | The base URL of the OIDC provider (enables Discovery). | `https://accounts.google.com` |
| `AUTH_HOST` | The hostname of your OIDC provider (Keycloak fallback). | `keycloak.local` |
| `AUTH_PORT` | The port of your OIDC provider (Keycloak fallback). | `8080` |
| `AUTH_REALM` | The OIDC realm name (Keycloak fallback). | `master` |
| `OAUTH_CLIENT_ID` | The OAuth 2.1 client ID for the server. | `neo-mcp-server` |
| `OAUTH_CLIENT_SECRET` | The OAuth 2.1 client secret. | `your-secret-here` |
| `HOST` | The public hostname of the MCP server. | `mcp.neomjs.com` |

### Protocol-Aware URL Resolution
The server intelligently resolves URLs:
- If the host is `localhost` or `127.0.0.1`, it defaults to `http`.
- For all other hosts, it defaults to `https`.
- If the host string already includes a protocol (e.g., `https://myhost`), that protocol is preserved.

---

## Hands-on Examples

- **Keycloak:** See the [Local Keycloak Setup](#example-local-keycloak-setup) below.
- **Google OAuth:** Follow the [Google OAuth 2.1 Demo](GoogleAuthDemo.md) guide.

---

## Example: Local Keycloak Setup

1. **Start Keycloak:** Ensure Keycloak is running at `localhost:8080`.
2. **Create Realm:** Use the `master` realm or create a new one.
3. **Create Client:**
   - Client ID: `mcp-server`
   - Client Type: `OpenID Connect`
   - Authentication: `Service accounts roles` (if using machine-to-machine) or `Standard flow` for user-based.
4. **Configure .env:**
   ```env
   # MCP Server Config
   TRANSPORT=sse
   SSE_PORT=3000

   # Auth Config
   AUTH_HOST=localhost
   AUTH_PORT=8080
   AUTH_REALM=master
   OAUTH_CLIENT_ID=mcp-server
   OAUTH_CLIENT_SECRET=your-secret
   ```

---

## Technical Details

### Token Introspection
The server validates incoming `Authorization: Bearer <token>` headers by calling the provider's introspection endpoint:
`{issuer}/protocol/openid-connect/token/introspect`

### Audience (aud) Validation
To prevent token passthrough attacks, the server verifies that the token's audience matches its own public URL (`HOST` + `SSE_PORT`).

### CORS Support
The SSE transport includes CORS middleware by default:
- **Origin:** `*`
- **Exposed Headers:** `Mcp-Session-Id` (required for session tracking in browser clients).

---

## Troubleshooting

### Audience Mismatch
**Error:** `None of the provided audiences are allowed. Expected ... got: ...`
**Fix:** Ensure your OAuth client is configured to include the MCP server's public URL in its audience list.

### Inactive Token
**Error:** `Inactive token`
**Fix:** Verify that the token has not expired and that the client credentials provided to the MCP server have permission to introspect tokens.

---

## Advanced: Custom Configuration Files

While environment variables are preferred for IaC, you can also provide a custom configuration file (JSON or `.mjs`) to the server using the `-c` or `--config` flag. This is particularly useful for setting up a custom `authMiddleware` or overriding specific server defaults.

```bash
# Start with a custom configuration file
node ./ai/mcp/server/knowledge-base/mcp-server.mjs --config ./path/to/my-config.mjs
```

### Example: Custom Middleware
If you need complex or proprietary authorization logic, you can provide a custom `authMiddleware` function in your configuration file. **Note:** Providing a custom middleware will take precedence over the built-in OIDC/OAuth logic.

```javascript
// my-config.mjs
export default {
    // Custom Express middleware
    authMiddleware: (req, res, next) => {
        const apiKey = req.headers['x-api-key'];
        
        // ALWAYS use environment variables for secrets
        if (apiKey && apiKey === process.env.MY_CUSTOM_API_KEY) {
            next();
        } else {
            res.status(401).json({ error: 'Unauthorized' });
        }
    }
}
```

---

## Roadmap: Neural Link Security
Securing the **Neural Link** is a higher-complexity task due to its role as a physical bridge to the browser environment. A dedicated security model involving local token exchange and signed requests is currently under design. See issue #9559 for details.

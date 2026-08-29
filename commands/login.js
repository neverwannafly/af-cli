const http = require('http');
const { spawn } = require('child_process');
const { createHash, randomBytes } = require('crypto');
const { configPath, readConfig, updateConfig } = require('../lib/config');
const output = require('../lib/output');

const CALLBACK_HOST = '127.0.0.1';
const CLIENT_NAME = 'API Frenzy CLI';
const OAUTH_SCOPE = 'read write';

function normalizeBaseUrl(url) {
  return url.replace(/\/+$/, '');
}

function base64Url(buffer) {
  return Buffer.from(buffer)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function makePkcePair() {
  const verifier = base64Url(randomBytes(32));
  const challenge = base64Url(createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Server returned non-JSON response: ${text.slice(0, 200)}`);
  }
}

async function fetchMetadata(baseUrl) {
  const response = await fetch(`${baseUrl}/.well-known/oauth-authorization-server`);
  if (!response.ok) {
    return {
      authorization_endpoint: `${baseUrl}/oauth2/authorize`,
      token_endpoint: `${baseUrl}/api/oauth2/token`,
      registration_endpoint: `${baseUrl}/api/oauth2/register`,
    };
  }

  return readJsonResponse(response);
}

async function registerClient(registrationEndpoint, redirectUri) {
  const response = await fetch(registrationEndpoint, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_name: CLIENT_NAME,
      redirect_uris: [redirectUri],
    }),
  });

  const payload = await readJsonResponse(response);
  if (!response.ok) {
    throw new Error(payload?.error || `OAuth client registration failed: ${response.status}`);
  }

  if (!payload?.client_id) {
    throw new Error('OAuth registration response did not include client_id');
  }

  return payload.client_id;
}

function createCallbackServer(expectedState) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url || '/', `http://${CALLBACK_HOST}`);

      if (url.pathname !== '/callback') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
        return;
      }

      const error = url.searchParams.get('error');
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');

      if (error) {
        res.writeHead(400, {
          'Content-Type': 'text/html; charset=utf-8',
          Connection: 'close',
        });
        res.end('<h1>API Frenzy CLI login failed</h1><p>You can close this window.</p>');
        server.emit('oauth-result', { error: new Error(`OAuth authorization failed: ${error}`) });
        return;
      }

      if (!code || state !== expectedState) {
        res.writeHead(400, {
          'Content-Type': 'text/html; charset=utf-8',
          Connection: 'close',
        });
        res.end('<h1>API Frenzy CLI login failed</h1><p>Invalid OAuth callback.</p>');
        server.emit('oauth-result', { error: new Error('Invalid OAuth callback') });
        return;
      }

      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        Connection: 'close',
      });
      res.end('<h1>API Frenzy CLI login complete</h1><p>You can close this window and return to your terminal.</p>');
      server.emit('oauth-result', { code });
    });

    server.once('error', reject);
    server.listen(0, CALLBACK_HOST, () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Failed to bind OAuth callback server'));
        return;
      }

      resolve({
        server,
        redirectUri: `http://${CALLBACK_HOST}:${address.port}/callback`,
      });
    });
  });
}

function waitForCallback(server, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Timed out waiting for OAuth callback'));
    }, timeoutMs);

    server.once('oauth-result', (result) => {
      clearTimeout(timeout);
      if (result.error) reject(result.error);
      else resolve(result.code);
    });
  });
}

function openBrowser(url) {
  const commands = {
    darwin: ['open', [url]],
    win32: ['cmd', ['/c', 'start', '', url]],
    linux: ['xdg-open', [url]],
  };
  const command = commands[process.platform];
  if (!command) return false;

  try {
    const child = spawn(command[0], command[1], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    return true;
  } catch {
    return false;
  }
}

async function exchangeCode(tokenEndpoint, { code, clientId, redirectUri, verifier }) {
  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    }),
  });

  const payload = await readJsonResponse(response);
  if (!response.ok) {
    throw new Error(payload?.error || `OAuth token exchange failed: ${response.status}`);
  }

  if (!payload?.access_token) {
    throw new Error('OAuth token response did not include access_token');
  }

  return `${payload.token_type || 'Bearer'} ${payload.access_token}`;
}

async function fetchUsername(baseUrl, sessionToken) {
  try {
    const response = await fetch(`${baseUrl}/api/oauth2/me`, {
      headers: { Authorization: sessionToken },
    });

    if (!response.ok) return null;

    const payload = await readJsonResponse(response);
    return payload?.data?.attributes?.username || payload?.username || null;
  } catch {
    // Login succeeded already; a best-effort greeting must not make it fail.
    return null;
  }
}

function closeCallbackServer(server) {
  server.close();
  // `server.close()` waits for keep-alive sockets. Explicitly close them so a
  // completed browser callback never keeps the CLI process alive.
  server.closeAllConnections?.();
}

async function oauthLogin({ apiBaseUrl, timeout }) {
  const config = readConfig();
  const baseUrl = normalizeBaseUrl(apiBaseUrl || config.apiBaseUrl);
  const metadata = await fetchMetadata(baseUrl);
  const state = base64Url(randomBytes(24));
  const { verifier, challenge } = makePkcePair();
  const { server, redirectUri } = await createCallbackServer(state);

  try {
    const clientId = await registerClient(metadata.registration_endpoint, redirectUri);
    const authorizeUrl = new URL(metadata.authorization_endpoint);
    authorizeUrl.searchParams.set('response_type', 'code');
    authorizeUrl.searchParams.set('client_id', clientId);
    authorizeUrl.searchParams.set('redirect_uri', redirectUri);
    authorizeUrl.searchParams.set('scope', OAUTH_SCOPE);
    authorizeUrl.searchParams.set('code_challenge', challenge);
    authorizeUrl.searchParams.set('code_challenge_method', 'S256');
    authorizeUrl.searchParams.set('state', state);

    output.note('Opening browser for API Frenzy OAuth login...');
    if (!openBrowser(authorizeUrl.toString())) {
      output.note('Open this URL in your browser:');
      output.note(authorizeUrl.toString());
    }

    const code = await waitForCallback(server, timeout);
    const sessionToken = await exchangeCode(metadata.token_endpoint, {
      code,
      clientId,
      redirectUri,
      verifier,
    });
    
    let finalToken = sessionToken;
    try {
      const os = require('os');
      const tokenResponse = await fetch(`${baseUrl}/api/tokens`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: sessionToken,
        },
        body: JSON.stringify({ 
          name: `CLI Login on ${os.hostname()}`,
          scopes: ['*:*']
        }),
      });
      if (tokenResponse.ok) {
        const tokenPayload = await readJsonResponse(tokenResponse);
        if (tokenPayload?.secret) {
          finalToken = tokenPayload.secret;
        }
      }
    } catch (e) {
      // Ignore error and fallback to standard OAuth token if API token generation fails
    }

    updateConfig({
      apiBaseUrl: baseUrl,
      sessionToken: finalToken,
    });

    return { baseUrl, username: await fetchUsername(baseUrl, sessionToken) };
  } finally {
    closeCallbackServer(server);
  }
}

function loginCommand(program) {
  program
    .command('login')
    .description('Log in to API Frenzy with OAuth 2.0 PKCE')
    .option('--api-base-url <url>', 'API Frenzy API base URL')
    .option('--timeout-ms <ms>', 'OAuth callback timeout in milliseconds', '300000')
    .action(async (options) => {
      const { baseUrl, username } = await oauthLogin({
        apiBaseUrl: options.apiBaseUrl,
        timeout: Number.parseInt(options.timeoutMs, 10) || 300000,
      });
      output.emit({ authenticated: true, username, api_url: baseUrl, config: configPath() });
    });
}

module.exports = { loginCommand, oauthLogin, fetchUsername };

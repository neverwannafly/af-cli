const { readConfig } = require('./config');

function normalizeBaseUrl(baseUrl) {
  return baseUrl.replace(/\/+$/, '');
}

function authHeaders(sessionToken) {
  const token = sessionToken && sessionToken.trim();

  if (!token) {
    return {};
  }

  return {
    'X-Session-Token': token,
    Authorization: token.startsWith('Bearer ') ? token : `Bearer ${token}`,
  };
}

async function readJsonResponse(response) {
  const body = await response.text();

  if (!body) {
    return null;
  }

  try {
    return JSON.parse(body);
  } catch (error) {
    throw new Error(`API returned non-JSON response: ${body.slice(0, 200)}`);
  }
}

function apiErrorMessage(response, payload) {
  if (payload && typeof payload === 'object') {
    if (payload.error) return payload.error;
    if (payload.message) return payload.message;
    if (Array.isArray(payload.errors)) return payload.errors.join(', ');
  }

  return `${response.status} ${response.statusText}`;
}

class ApiClient {
  constructor(options = {}) {
    const config = readConfig();

    this.baseUrl = normalizeBaseUrl(options.apiBaseUrl || config.apiBaseUrl);
    this.sessionToken = options.sessionToken || config.sessionToken;
  }

  hasSessionToken() {
    return Boolean(this.sessionToken);
  }

  async createTunnel({ name, localPort, visibility }) {
    const response = await fetch(`${this.baseUrl}/api/tunnels`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(this.sessionToken),
      },
      body: JSON.stringify({
        tunnel: {
          name,
          local_port: localPort,
          visibility,
        },
      }),
    });

    const payload = await readJsonResponse(response);

    if (!response.ok) {
      throw new Error(`Failed to create tunnel: ${apiErrorMessage(response, payload)}`);
    }

    if (payload && payload.data && payload.data.attributes) {
      return {
        id: payload.data.id,
        ...payload.data.attributes,
      };
    }

    return payload && payload.data ? payload.data : payload;
  }

  async disconnectTunnel(slug) {
    if (!slug || !this.hasSessionToken()) {
      return;
    }

    const response = await fetch(`${this.baseUrl}/api/tunnels/${encodeURIComponent(slug)}/disconnect`, {
      method: 'POST',
      headers: authHeaders(this.sessionToken),
    });

    if (!response.ok) {
      const payload = await readJsonResponse(response);
      throw new Error(`Failed to disconnect tunnel: ${apiErrorMessage(response, payload)}`);
    }
  }
}

module.exports = {
  ApiClient,
  authHeaders,
};

const { readConfig } = require('./config');
const { AfError } = require('./errors');

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

  async request(method, path, options = {}) {
    if (!this.hasSessionToken() && options.auth !== false) {
      throw new AfError('No token found. Run af-cli login or set AF_TOKEN.', { code: 'unauthorized' });
    }
    const url = new URL(`${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`);
    for (const [key, value] of Object.entries(options.query || {})) {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
    }
    let response;
    try {
      response = await fetch(url, {
        method,
        headers: {
          Accept: options.accept || 'application/json',
          ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(options.auth === false ? {} : authHeaders(this.sessionToken)),
        },
        ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
        ...(options.signal ? { signal: options.signal } : {}),
      });
    } catch (error) {
      throw new AfError(`Unable to reach API Frenzy at ${this.baseUrl}: ${error.message}`, {
        code: 'upstream_unavailable', cause: error,
      });
    }
    const payload = await readJsonResponse(response);
    if (!response.ok) throw AfError.fromResponse(response.status, payload);
    return payload;
  }

  get(path, query) { return this.request('GET', path, { query }); }
  post(path, body) { return this.request('POST', path, { body }); }

  deployImage(executionArgs) {
    return this.post('/api/pipelines/execute', {
      pipeline_slug: 'deploy-custom-dockerfile',
      execution_args: { image_tag: 'latest', ...executionArgs },
    });
  }

  deployGithub(body) { return this.post('/api/github/deploy', body); }
  getExecution(id) { return this.get(`/api/pipelines/executions/${encodeURIComponent(id)}`); }
  getStageLogs(id, query) { return this.get(`/api/pipelines/executions/${encodeURIComponent(id)}/stage_logs`, query); }
  getDeployment(slug) { return this.get(`/api/deployments/${encodeURIComponent(slug)}`); }
  getDeploymentExecutions(slug) { return this.get(`/api/deployments/${encodeURIComponent(slug)}/pipeline_executions`); }
  getVerification(slug, id) { return this.get(`/api/deployments/${encodeURIComponent(slug)}/verification`, id ? { verification_id: id } : {}); }
  getLogSnapshot(slug, query) { return this.get(`/api/deployments/${encodeURIComponent(slug)}/log_snapshot`, query); }
  listReleases(slug, query) { return this.get(`/api/deployments/${encodeURIComponent(slug)}/releases`, query); }
  rollback(slug, releaseSequence) { return this.post(`/api/deployments/${encodeURIComponent(slug)}/rollback`, { release_sequence: releaseSequence }); }

  async createTunnel({ name, localPort, visibility, kind }) {
    const tunnel = {
      name,
      ...(kind ? { kind } : {}),
      ...(localPort ? { local_port: localPort } : {}),
      ...(visibility ? { visibility } : {}),
    };
    const response = await fetch(`${this.baseUrl}/api/tunnels`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(this.sessionToken),
      },
      body: JSON.stringify({ tunnel }),
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

  async createPrivateConnectionTicket(deployment) {
    const response = await fetch(`${this.baseUrl}/api/deployments/${encodeURIComponent(deployment)}/private_connection_ticket`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders(this.sessionToken) }, body: JSON.stringify({}),
    });
    const payload = await readJsonResponse(response);
    if (!response.ok) throw new Error(`Failed to create private connection: ${apiErrorMessage(response, payload)}`);
    return payload && payload.data ? payload.data : payload;
  }

}

module.exports = {
  ApiClient,
  authHeaders,
};

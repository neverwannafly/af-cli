function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });
}

function jsonApi(id, attributes) {
  return { data: { id: String(id), type: 'record', attributes } };
}

global.fetch = async (input, options = {}) => {
  const url = new URL(String(input));
  const path = `${url.pathname}${url.search}`;
  if (path === '/api/deployments/demo') return json(jsonApi(9, { name: 'demo', slug: 'demo', status: 'provisioned' }));
  if (path === '/api/deployments/demo/pipeline_executions' && process.env.AF_FAKE_ACTIVE === '1') {
    return json({ data: [jsonApi(10, { status: 'running', pipeline_slug: 'deploy-custom-dockerfile' }).data] });
  }
  if (path === '/api/deployments/demo/verification') return json({ id: 30, requested_release_id: 20, pipeline_execution_id: 10, state: 'converged', assertions: { release_released: true } });
  if (path.startsWith('/api/deployments/demo/log_snapshot')) return json({ deployment_slug: 'demo', pods: [], has_more: false });
  if (path.startsWith('/api/deployments/demo/releases')) return json({ data: [jsonApi(20, { sequence: 2, status: 'released' }).data] });
  if (path === '/api/deployments/demo/rollback' && options.method === 'POST') {
    return json({ deployment: jsonApi(9, { slug: 'demo' }), release: jsonApi(20, { sequence: 3, status: 'applying' }), secrets_source: 'current' }, 202);
  }
  if (path === '/api/health_check') return json({ success: true });
  if (path === '/api/oauth2/me') return json({ username: 'tester' });
  if (path === '/api/billing/quota') return json({ data: { unlimited: false, entitlements: {}, usage: {} } });
  if (path === '/api/github/installations') return json({ data: [] });
  if (path === '/api/deployments') return json({ data: [jsonApi(9, { name: 'demo', slug: 'demo' }).data] });
  if (path === '/api/pipelines/execute' && options.method === 'POST') {
    const body = JSON.parse(options.body);
    if (body.execution_args.source_image !== 'nginx:alpine') return json({ error: 'wrong image payload' }, 422);
    return json(jsonApi(10, { status: 'pending', pipeline_slug: 'deploy-custom-dockerfile' }), 201);
  }
  if (path === '/api/pipelines/executions/10') return json(jsonApi(10, {
    status: 'success', pipeline_slug: 'deploy-custom-dockerfile',
    stages: [{ name: 'deploy-image', status: 'success', response: { result: { deployment_slug: 'demo' } } }],
  }));
  return json({ error: 'not found', code: 'not_found' }, 404);
};

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });
}

global.fetch = async (input, options = {}) => {
  const url = new URL(String(input));
  if (url.pathname === '/api/deployments/demo/pipeline_executions') return json({ error: 'not found', code: 'not_found' }, 404);
  if (url.pathname === '/api/pipelines/execute' && options.method === 'POST') {
    return json({ data: { id: '10', attributes: { status: 'pending', pipeline_slug: 'deploy-custom-dockerfile' } } }, 201);
  }
  if (url.pathname === '/api/pipelines/executions/10') {
    return json({ data: { id: '10', attributes: { status: 'running', current_stage: 'deploy-image', pipeline_slug: 'deploy-custom-dockerfile' } } });
  }
  return json({ error: 'not found', code: 'not_found' }, 404);
};

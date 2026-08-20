const { ApiClient } = require('../lib/api-client');
const output = require('../lib/output');
const { AfError } = require('../lib/errors');
const { unwrapOne, unwrapMany, positiveInteger, durationMs, collect, envMap, validateName, delay } = require('../lib/command-utils');

const TERMINAL_EXECUTIONS = new Set(['success', 'failed', 'canceled', 'permanently_failed']);
const TERMINAL_VERIFICATIONS = new Set(['converged', 'failed']);

function validateDeployOptions(options, command) {
  validateName(options.name);
  const git = Boolean(options.repo || options.repoId);
  const explicitlySet = (name) => command?.getOptionValueSource?.(name) === 'cli';
  if (Boolean(options.image) === git) throw new AfError('Provide exactly one source: --image or --repo/--repo-id', { code: 'validation_failed' });
  if (options.repo && options.repoId) throw new AfError('Provide at most one of --repo or --repo-id', { code: 'validation_failed' });
  if (git && !options.installationId) throw new AfError('--installation-id is required for a GitHub deploy', { code: 'validation_failed' });
  if (options.group && options.groupId) throw new AfError('Provide at most one of --group or --group-id', { code: 'validation_failed' });
  if (!['dockerfile', 'static', 'node'].includes(options.buildType)) throw new AfError('Invalid --build-type', { code: 'validation_failed' });
  if (!['public_access', 'private_access'].includes(options.visibility)) throw new AfError('Invalid --visibility', { code: 'validation_failed' });
  if (options.startCommand && options.buildType !== 'node') throw new AfError('--start-command is valid only for --build-type node', { code: 'validation_failed' });
  if (options.port && options.buildType !== 'node') throw new AfError('--port is valid only for --build-type node', { code: 'validation_failed' });
  if (options.image) {
    const gitOnly = ['installationId', 'branch', 'buildType', 'dockerfilePath', 'buildContext', 'buildCommand', 'startCommand', 'port', 'rootDir'];
    const invalid = gitOnly.find(explicitlySet);
    if (invalid) throw new AfError(`--${invalid.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)} is valid only for a GitHub deploy`, { code: 'validation_failed' });
  }
  if (git && options.buildType === 'dockerfile') {
    const invalid = ['buildCommand', 'startCommand', 'port', 'rootDir'].find(explicitlySet);
    if (invalid) throw new AfError(`--${invalid.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)} is not valid for --build-type dockerfile`, { code: 'validation_failed' });
  }
  if (git && options.buildType !== 'dockerfile') {
    const invalid = ['dockerfilePath', 'buildContext'].find(explicitlySet);
    if (invalid) throw new AfError(`--${invalid.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)} is valid only for --build-type dockerfile`, { code: 'validation_failed' });
  }
  return options;
}

function commonArgs(options) {
  const envVars = envMap(options.env, options.envFile);
  const ports = options.port ? [positiveInteger(options.port, '--port')] : undefined;
  const args = {
    deployment_name: options.name,
    visibility: options.visibility,
    deployment_group_id: options.groupId ? positiveInteger(options.groupId, '--group-id') : undefined,
    deployment_group_name: options.group,
    ports,
    env_vars: Object.keys(envVars).length ? envVars : undefined,
    secret_ids: options.secretId.map((id) => positiveInteger(id, '--secret-id')),
    replicas: options.replicas ? positiveInteger(options.replicas, '--replicas') : undefined,
    cpu_request: options.cpuRequest,
    cpu_limit: options.cpuLimit,
    memory_request: options.memoryRequest,
    memory_limit: options.memoryLimit,
    storage_enabled: Boolean(options.storageSize || options.storageMountPath) || undefined,
    storage_size: options.storageSize,
    storage_mount_path: options.storageMountPath,
  };
  return Object.fromEntries(Object.entries(args).filter(([, value]) => value !== undefined && (!Array.isArray(value) || value.length)));
}

async function waitForVerification(client, slug, timeoutAt, expected = {}, pollMs = 1000) {
  let verification;
  while (Date.now() < timeoutAt) {
    let candidate;
    try {
      candidate = await client.getVerification(slug, verification?.id);
    } catch (error) {
      if (error.code !== 'not_found') throw error;
    }
    const matchesExecution = expected.pipelineExecutionId === undefined ||
      String(candidate?.pipeline_execution_id) === String(expected.pipelineExecutionId);
    const matchesRelease = expected.releaseId === undefined ||
      String(candidate?.requested_release_id) === String(expected.releaseId);
    if (candidate && matchesExecution && matchesRelease) verification = candidate;
    if (verification && TERMINAL_VERIFICATIONS.has(verification.state)) return verification;
    if (verification) output.note(`Verification: ${verification.state} (${verification.pending_reason || 'waiting'})`);
    else if (candidate) output.note('Verification: waiting for the release created by this execution');
    await delay(pollMs);
  }
  throw new AfError('Timed out waiting for deployment verification', {
    code: 'timeout', details: { verification: verification || 'inconclusive' },
  });
}

function deploymentSlugFromExecution(execution) {
  for (const stage of execution.stages || []) {
    const response = stage.response || {};
    const slug = response.deployment_slug || response.result?.deployment_slug || response.data?.deployment_slug;
    if (slug) return slug;
  }
  return null;
}

async function waitForDeploy(client, executionId, timeout) {
  const timeoutAt = Date.now() + durationMs(timeout);
  let execution;
  while (Date.now() < timeoutAt) {
    execution = unwrapOne(await client.getExecution(executionId));
    output.note(`Pipeline ${execution.id}: ${execution.status}${execution.current_stage ? ` (${execution.current_stage})` : ''}`);
    if (TERMINAL_EXECUTIONS.has(execution.status)) break;
    await delay(1000);
  }
  if (!execution || !TERMINAL_EXECUTIONS.has(execution.status)) {
    throw new AfError('Timed out waiting for pipeline execution', { code: 'timeout', details: { execution } });
  }
  if (execution.status !== 'success') {
    const failure = await client.getStageLogs(executionId);
    throw new AfError('Build/deploy pipeline failed', { code: 'build_failed', details: { execution, failure } });
  }
  const slug = deploymentSlugFromExecution(execution);
  if (!slug) {
    throw new AfError('Pipeline succeeded without returning a deployment identity; verification is inconclusive', {
      code: 'deployment_verification_failed', details: { execution },
    });
  }
  const verification = await waitForVerification(client, slug, timeoutAt, { pipelineExecutionId: executionId });
  if (verification.state !== 'converged') {
    throw new AfError(verification.detail?.message || 'Deployment verification failed', {
      code: 'deployment_verification_failed', details: verification,
    });
  }
  return { execution, verification, slug };
}

function deployCommand(program) {
  program.command('deploy')
    .description('Deploy an image or GitHub repository')
    .requiredOption('--name <name>', 'Deployment name')
    .option('--image <ref>', 'Existing public image reference')
    .option('--repo <owner/repo>', 'GitHub repository')
    .option('--repo-id <id>', 'GitHub repository id')
    .option('--installation-id <id>', 'GitHub App installation id')
    .option('--branch <branch>', 'Git branch')
    .option('--build-type <type>', 'dockerfile, static, or node', 'dockerfile')
    .option('--dockerfile-path <path>', 'Dockerfile path', 'Dockerfile')
    .option('--build-context <path>', 'Docker build context', '.')
    .option('--build-command <command>')
    .option('--start-command <command>')
    .option('--port <port>')
    .option('--root-dir <path>')
    .option('--env <KEY=VALUE>', 'Plain environment variable', collect, [])
    .option('--env-file <path>', 'Read plain KEY=VALUE entries')
    .option('--secret-id <id>', 'Secret id to attach', collect, [])
    .option('--visibility <visibility>', 'public_access or private_access', 'public_access')
    .option('--group <name>')
    .option('--group-id <id>')
    .option('--replicas <count>')
    .option('--cpu-request <quantity>').option('--cpu-limit <quantity>')
    .option('--memory-request <quantity>').option('--memory-limit <quantity>')
    .option('--storage-size <quantity>').option('--storage-mount-path <path>')
    .option('--wait', 'Wait for server-side deployment verification')
    .option('--timeout <duration>', 'Wait deadline', '10m')
    .action(async (options, command) => {
      validateDeployOptions(options, command);
      const client = new ApiClient();
      const common = commonArgs(options);
      let payload;
      let source;
      let attached = false;
      if (options.wait) {
        try {
          const executions = unwrapMany(await client.getDeploymentExecutions(options.name));
          const active = executions.find((item) => !TERMINAL_EXECUTIONS.has(item.status));
          if (active) {
            payload = active;
            attached = true;
            output.note(`Attached to in-flight pipeline ${active.id} for ${options.name}`);
          }
        } catch (error) {
          if (error.code !== 'not_found') throw error;
        }
      }
      if (options.image) {
        if (!payload) payload = await client.deployImage({ source_image: options.image, ...common });
        source = { kind: 'image', image: options.image };
      } else {
        const github = {
          installation_id: positiveInteger(options.installationId, '--installation-id'),
          repo_id: options.repoId ? positiveInteger(options.repoId, '--repo-id') : undefined,
          repo_full_name: options.repo,
          branch: options.branch,
          build_type: options.buildType,
          dockerfile_path: options.dockerfilePath,
          build_context: options.buildContext,
          build_command: options.buildCommand,
          start_command: options.startCommand,
          port: options.port ? positiveInteger(options.port, '--port') : undefined,
          root_dir: options.rootDir,
          ...common,
        };
        if (!payload) payload = await client.deployGithub(Object.fromEntries(Object.entries(github).filter(([, value]) => value !== undefined)));
        source = { kind: 'github', repo: options.repo || null, repo_id: options.repoId || null, branch: options.branch || null, build_type: options.buildType };
      }
      const accepted = unwrapOne(payload);
      let execution = accepted;
      let verification = null;
      let slug = null;
      if (options.wait) ({ execution, verification, slug } = await waitForDeploy(client, accepted.id, options.timeout));
      output.emit({ attached, deployment: { name: options.name, slug, visibility: options.visibility }, execution, source, verification });
    });
}

module.exports = { deployCommand, validateDeployOptions, commonArgs, waitForDeploy, waitForVerification, deploymentSlugFromExecution };

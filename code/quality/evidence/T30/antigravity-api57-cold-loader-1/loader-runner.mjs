import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = path.resolve('.');
const evidenceDir = path.resolve(root, 'quality/evidence/T30/antigravity-api57-cold-loader-1');
const nodeImage = 'node:24.21.0-bookworm-slim@sha256:51b1100cc2a83d370c6a60952e3f2989c8a43159d0e38586e090f3b3326efefd';

const docker = (args, timeout = 30000) =>
  execFileSync('docker', args, { cwd: root, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], timeout });
const inspect = id => JSON.parse(docker(['inspect', id]))[0];
const network = () => JSON.parse(docker(['network', 'inspect', 'fg-local_default']))[0];

const EXPECTED_STAGES = ['pg', 'livekit_sdk', 'livekit_protocol', 'ws', 'lease_store', 'signaling_gateway'];

function validateResult(data, expectedMode) {
  assert(data && typeof data === 'object', 'Result must be an object');
  assert.equal(data.mode, expectedMode, `Expected mode ${expectedMode}`);
  assert(typeof data.entryStartedAt === 'string' && /^\d{4}-\d{2}-\d{2}T[0-9:.]+Z$/.test(data.entryStartedAt), 'Valid ISO entryStartedAt required');
  assert(typeof data.entryMonotonicMs === 'number' && Number.isFinite(data.entryMonotonicMs) && data.entryMonotonicMs >= 0, 'Valid entryMonotonicMs required');
  assert.equal(data.preloadInstalled, expectedMode === 'with-preload', 'preloadInstalled state mismatch');
  assert.equal(data.allOk, true, 'allOk must be true');
  assert.equal(data.errorCode, null, 'errorCode must be null');
  assert(Array.isArray(data.stages), 'stages must be an array');
  assert.equal(data.stages.length, EXPECTED_STAGES.length, 'stages count mismatch');
  for (let i = 0; i < EXPECTED_STAGES.length; i++) {
    const s = data.stages[i];
    assert.equal(s.stage, EXPECTED_STAGES[i], `Stage name mismatch at index ${i}`);
    assert(typeof s.startedAt === 'string', 'stage startedAt required');
    assert(typeof s.durationMs === 'number' && Number.isFinite(s.durationMs) && s.durationMs >= 0, 'stage durationMs must be non-negative number');
    assert.equal(s.ok, true, `Stage ${s.stage} must be ok`);
    assert.equal(s.errorCode, null, `Stage ${s.stage} errorCode must be null`);
  }
  assert(typeof data.totalDurationMs === 'number' && Number.isFinite(data.totalDurationMs) && data.totalDurationMs >= 0, 'totalDurationMs must be non-negative number');
  return data;
}

export async function run() {
  const startedAt = new Date().toISOString();
  const proof = {
    startedAt,
    completedAt: null,
    status: 'INCOMPLETE',
    errorCodes: [],
    containerAId: null,
    containerBId: null,
    containerAExitCode: null,
    containerBExitCode: null,
    mainServicesUnchanged: false,
    existingNetworkUnchanged: false,
    ownedContainersRemoved: false,
    ownedPrivateRuntimeRemoved: false,
    rawMeasurement: null,
    preloadMeasurement: null,
    comparisonSummary: null,
    nativeAcceptance: false
  };

  let runDir;
  let containerAId, containerAName, ownerTagA;
  let containerBId, containerBName, ownerTagB;
  let preMain, preNetwork;

  try {
    // 1. Preflight checks
    docker(['image', 'inspect', nodeImage]);

    preMain = ['fg-local-postgres-1', 'fg-local-redis-1'].map(inspect);
    for (let i = 0; i < 2; i++) {
      const m = preMain[i];
      assert.equal(m.Name, '/' + ['fg-local-postgres-1', 'fg-local-redis-1'][i]);
      assert(/^[a-f0-9]{64}$/.test(m.Id));
      assert(m.State.Running && m.State.Health.Status === 'healthy');
    }

    preNetwork = network();
    assert.equal(preNetwork.Name, 'fg-local_default');
    assert(Object.hasOwn(preNetwork.Containers, preMain[0].Id));

    const childScript = path.resolve(evidenceDir, 'loader-child.cjs');
    const preloadScript = path.resolve(root, 'quality/evidence/T30/gateway-observer-preload-reviewed2.cjs');
    const appDir = path.resolve(root, 'apps/api/dist/modules/calls');
    const nodeModulesDir = path.resolve(root, 'node_modules');
    assert(fs.existsSync(childScript), 'loader-child.cjs missing');
    assert(fs.existsSync(preloadScript), 'gateway-observer-preload-reviewed2.cjs missing');
    assert(fs.existsSync(appDir), 'apps/api/dist/modules/calls missing');
    assert(fs.existsSync(nodeModulesDir), 'node_modules missing');

    // 2. Setup isolated private runtime scratch directory
    const runtimeRoot = fs.realpathSync('.runtime/t30');
    const id = randomUUID().replaceAll('-', '');
    runDir = path.resolve(runtimeRoot, 'cold-loader-' + id);
    assert.equal(path.dirname(runDir), runtimeRoot);
    assert(!fs.existsSync(runDir));
    fs.mkdirSync(runDir);
    assert.equal(fs.realpathSync(runDir), runDir);

    const outputDir = path.join(runDir, 'output');
    fs.mkdirSync(outputDir);

    const rawOutputFile = path.join(outputDir, 'result-raw.json');
    const preloadOutputFile = path.join(outputDir, 'result-preload.json');

    const mounts = [
      '--mount', `type=bind,source=${childScript},target=/gateway/loader-child.cjs,readonly`,
      '--mount', `type=bind,source=${preloadScript},target=/gateway/preload.cjs,readonly`,
      '--mount', `type=bind,source=${appDir},target=/gateway/app,readonly`,
      '--mount', `type=bind,source=${nodeModulesDir},target=/gateway/node_modules,readonly`,
      '--mount', `type=bind,source=${outputDir},target=/gateway/output`
    ];

    // 3. Cycle A: without-preload (measures baseline cold loading and module evaluation)
    containerAName = 'fg-t30-loader-a-' + id;
    ownerTagA = 't30-loader-a-' + id;
    containerAId = docker([
      'create',
      '--pull=never',
      '--name', containerAName,
      '--network', 'none',
      '--read-only',
      '--cap-drop', 'ALL',
      '--security-opt', 'no-new-privileges',
      '--user', 'node',
      '--label', 'fg-owner=' + ownerTagA,
      ...mounts,
      nodeImage,
      'node', '/gateway/loader-child.cjs', '/gateway/output/result-raw.json', 'without-preload'
    ]).trim();
    assert(/^[a-f0-9]{64}$/.test(containerAId));
    proof.containerAId = containerAId;

    const createdA = inspect(containerAId);
    assert.equal(createdA.Name, '/' + containerAName);
    assert.equal(createdA.Config.Labels['fg-owner'], ownerTagA);
    assert.equal(createdA.Config.User, 'node');
    assert(createdA.HostConfig.ReadonlyRootfs);

    try {
      docker(['start', '-a', containerAId], 60000);
    } catch {
      proof.errorCodes.push('CYCLE_A_COMMAND_FAILED');
    }

    const endedA = inspect(containerAId);
    proof.containerAExitCode = endedA.State.Running ? null : endedA.State.ExitCode;
    assert.equal(endedA.State.Running, false);

    if (endedA.State.ExitCode === 0 && fs.existsSync(rawOutputFile)) {
      const rawContent = JSON.parse(fs.readFileSync(rawOutputFile, 'utf8'));
      proof.rawMeasurement = validateResult(rawContent, 'without-preload');
    } else {
      proof.errorCodes.push('CYCLE_A_EXECUTION_FAILED');
    }

    // 4. Cycle B: with-preload (measures observer preload evaluation and cached impact)
    containerBName = 'fg-t30-loader-b-' + id;
    ownerTagB = 't30-loader-b-' + id;
    containerBId = docker([
      'create',
      '--pull=never',
      '--name', containerBName,
      '--network', 'none',
      '--read-only',
      '--cap-drop', 'ALL',
      '--security-opt', 'no-new-privileges',
      '--user', 'node',
      '--label', 'fg-owner=' + ownerTagB,
      ...mounts,
      nodeImage,
      'node', '-r', '/gateway/preload.cjs', '/gateway/loader-child.cjs', '/gateway/output/result-preload.json', 'with-preload'
    ]).trim();
    assert(/^[a-f0-9]{64}$/.test(containerBId));
    proof.containerBId = containerBId;

    const createdB = inspect(containerBId);
    assert.equal(createdB.Name, '/' + containerBName);
    assert.equal(createdB.Config.Labels['fg-owner'], ownerTagB);
    assert.equal(createdB.Config.User, 'node');
    assert(createdB.HostConfig.ReadonlyRootfs);

    try {
      docker(['start', '-a', containerBId], 60000);
    } catch {
      proof.errorCodes.push('CYCLE_B_COMMAND_FAILED');
    }

    const endedB = inspect(containerBId);
    proof.containerBExitCode = endedB.State.Running ? null : endedB.State.ExitCode;
    assert.equal(endedB.State.Running, false);

    if (endedB.State.ExitCode === 0 && fs.existsSync(preloadOutputFile)) {
      const preloadContent = JSON.parse(fs.readFileSync(preloadOutputFile, 'utf8'));
      proof.preloadMeasurement = validateResult(preloadContent, 'with-preload');
    } else {
      proof.errorCodes.push('CYCLE_B_EXECUTION_FAILED');
    }

    // 5. Comparison Summary
    if (proof.rawMeasurement && proof.preloadMeasurement) {
      const stageComparisons = EXPECTED_STAGES.map(name => {
        const stageRaw = proof.rawMeasurement.stages.find(s => s.stage === name);
        const stagePreload = proof.preloadMeasurement.stages.find(s => s.stage === name);
        return {
          stage: name,
          rawDurationMs: stageRaw ? stageRaw.durationMs : null,
          preloadDurationMs: stagePreload ? stagePreload.durationMs : null,
          deltaMs: (stageRaw && stagePreload) ? Math.round((stagePreload.durationMs - stageRaw.durationMs) * 100) / 100 : null
        };
      });

      proof.comparisonSummary = {
        entryMonotonicDeltaMs: Math.round((proof.preloadMeasurement.entryMonotonicMs - proof.rawMeasurement.entryMonotonicMs) * 100) / 100,
        rawTotalDurationMs: proof.rawMeasurement.totalDurationMs,
        preloadTotalDurationMs: proof.preloadMeasurement.totalDurationMs,
        totalStagesDeltaMs: Math.round((proof.preloadMeasurement.totalDurationMs - proof.rawMeasurement.totalDurationMs) * 100) / 100,
        stages: stageComparisons
      };
    }
  } catch {
    proof.errorCodes.push('PREFLIGHT_OR_EXECUTION_OR_SCHEMA_FAILED');
  } finally {
    // Exact container recovery and cleanup
    const containersToClean = [
      { id: containerAId, name: containerAName, tag: ownerTagA },
      { id: containerBId, name: containerBName, tag: ownerTagB }
    ];

    let allRemoved = true;
    for (const c of containersToClean) {
      let activeId = c.id;
      if (!activeId && c.name) {
        try {
          const own = inspect(c.name);
          if (own.Config.Labels['fg-owner'] === c.tag && /^[a-f0-9]{64}$/.test(own.Id)) {
            activeId = own.Id;
          }
        } catch {
          try {
            if (docker(['ps', '-a', '--filter', `name=^/${c.name}$`, '--format', '{{.ID}}']).trim()) {
              proof.errorCodes.push('OWNED_CREATE_RECOVERY_FAILED');
              allRemoved = false;
            }
          } catch {
            proof.errorCodes.push('OWNED_CREATE_RECOVERY_FAILED');
            allRemoved = false;
          }
        }
      }

      if (activeId) {
        try {
          const own = inspect(activeId);
          assert.equal(own.Name, '/' + c.name);
          assert.equal(own.Config.Labels['fg-owner'], c.tag);
          if (own.State.Running) {
            docker(['stop', '--time', '5', activeId]);
          }
          assert.equal(inspect(activeId).State.Running, false);
          docker(['rm', activeId]);
          assert.equal(docker(['ps', '-a', '--filter', 'id=' + activeId, '--format', '{{.ID}}']).trim(), '');
        } catch {
          proof.errorCodes.push('OWNED_CONTAINER_CLEANUP_FAILED');
          allRemoved = false;
        }
      }
    }
    proof.ownedContainersRemoved = allRemoved;

    if (preMain) {
      try {
        for (const before of preMain) {
          const after = inspect(before.Id);
          assert.equal(after.Id, before.Id);
          assert.deepEqual(after.Config, before.Config);
          assert.deepEqual(after.NetworkSettings.Networks, before.NetworkSettings.Networks);
          assert(after.State.Running && after.State.Health.Status === 'healthy');
        }
        proof.mainServicesUnchanged = true;
      } catch {
        proof.errorCodes.push('MAIN_SERVICE_VERIFICATION_FAILED');
      }
    }

    if (preNetwork) {
      try {
        const after = network();
        assert.equal(after.Id, preNetwork.Id);
        assert.deepEqual(after.Containers, preNetwork.Containers);
        proof.existingNetworkUnchanged = true;
      } catch {
        proof.errorCodes.push('EXISTING_NETWORK_VERIFICATION_FAILED');
      }
    }

    if (runDir && proof.ownedContainersRemoved) {
      try {
        const runtimeRoot = fs.realpathSync('.runtime/t30');
        const target = fs.realpathSync(runDir);
        assert.equal(path.dirname(target), runtimeRoot);
        assert(/^cold-loader-[a-f0-9]{32}$/.test(path.basename(target)));
        fs.rmSync(target, { recursive: true, force: true });
        assert(!fs.existsSync(target));
        proof.ownedPrivateRuntimeRemoved = true;
      } catch {
        proof.errorCodes.push('PRIVATE_RUNTIME_CLEANUP_FAILED');
      }
    } else {
      proof.ownedPrivateRuntimeRemoved = runDir === undefined;
    }
  }

  proof.completedAt = new Date().toISOString();
  proof.status = (
    proof.errorCodes.length === 0 &&
    proof.mainServicesUnchanged &&
    proof.existingNetworkUnchanged &&
    proof.ownedContainersRemoved &&
    proof.ownedPrivateRuntimeRemoved &&
    proof.rawMeasurement !== null &&
    proof.preloadMeasurement !== null
  ) ? 'COMPLETE' : 'INCOMPLETE';

  fs.writeFileSync(
    path.join(evidenceDir, 'cold-loader-results.json'),
    JSON.stringify(proof, null, 2) + '\n',
    { flag: 'w' }
  );

  console.log(JSON.stringify({
    status: proof.status,
    errorCodes: proof.errorCodes,
    comparisonSummary: proof.comparisonSummary,
    ownedContainersRemoved: proof.ownedContainersRemoved,
    ownedPrivateRuntimeRemoved: proof.ownedPrivateRuntimeRemoved,
    mainServicesUnchanged: proof.mainServicesUnchanged,
    nativeAcceptance: false
  }));

  return proof.status === 'COMPLETE' ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:)/, ''))) {
  process.exitCode = await run();
}

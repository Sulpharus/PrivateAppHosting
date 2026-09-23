import { serve } from '@hono/node-server';
import { createVerifier, supabaseGrantChecker } from '@mininode/gate';
import { cachedGrants } from './auth.ts';
import { loadConfig } from './config.ts';
import { dockerEngine } from './docker.ts';
import { createInstaller, r2Signer } from './install.ts';
import { proxmoxClient } from './proxmox.ts';
import { createScheduler } from './runtimes.ts';
import { createServer } from './server.ts';

const config = loadConfig();
const hypervisor = proxmoxClient({
  url: config.PROXMOX_URL,
  node: config.PROXMOX_NODE,
  token: config.PROXMOX_TOKEN,
  caFile: config.PROXMOX_CA_FILE,
});
const docker = dockerEngine(config.DOCKER_SOCKET);
const scheduler = createScheduler({ config, hypervisor, docker });

const sign =
  config.R2_ENDPOINT && config.R2_ACCESS_KEY_ID && config.R2_SECRET_ACCESS_KEY
    ? r2Signer({
        endpoint: config.R2_ENDPOINT,
        bucket: config.R2_BUCKET,
        accessKeyId: config.R2_ACCESS_KEY_ID,
        secretAccessKey: config.R2_SECRET_ACCESS_KEY,
      })
    : null;

const app = createServer({
  controlToken: config.CONTROL_TOKEN,
  scheduler,
  installer: createInstaller({
    hypervisor,
    docker,
    windowsVmid: config.WINDOWS_VMID,
    wineImage: config.WINE_IMAGE,
    dockerNetwork: config.DOCKER_NETWORK,
    sign,
  }),
  auth: {
    platformDomain: config.PLATFORM_DOMAIN,
    portalUrl: config.PORTAL_URL,
    verifier: createVerifier(config.SUPABASE_URL),
    checkGrant: cachedGrants(
      supabaseGrantChecker(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY),
    ),
  },
});

// Idle reaping also runs locally, so resources are freed even if the platform API is unreachable.
const reaper = setInterval(() => {
  scheduler
    .reap()
    .then((actions) => {
      if (actions.length) console.log(JSON.stringify({ event: 'reaped', actions }));
    })
    .catch((error: unknown) =>
      console.error(JSON.stringify({ event: 'reap_failed', error: String(error) })),
    );
}, 60_000);

const server = serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  console.log(JSON.stringify({ event: 'listening', port: info.port }));
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    clearInterval(reaper);
    server.close(() => process.exit(0));
  });
}

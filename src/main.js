import { loadConfig } from './config.js';
import { createLogger } from './log.js';
import { runCheck } from './monitor.js';

const args = new Set(process.argv.slice(2));
const once = args.has('--once');
const dryRun = args.has('--dry-run');
const config = loadConfig(process.env, { requireTelegram: !dryRun });
const logger = createLogger(config.logLevel);
let stopped = false;
let wakeSleep;

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    stopped = true;
    logger.info('Shutdown requested', { signal });
    wakeSleep?.();
  });
}

do {
  const startedAt = Date.now();
  try {
    await runCheck(config, { logger, dryRun });
  } catch (error) {
    logger.error('Datalix check failed', { error: error.message, stack: error.stack });
    if (once) process.exitCode = 1;
  }
  if (once || stopped) break;
  const elapsed = Date.now() - startedAt;
  const delay = Math.max(1_000, config.checkIntervalSeconds * 1_000 - elapsed);
  await new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      wakeSleep = undefined;
      resolve();
    };
    const timer = setTimeout(finish, delay);
    wakeSleep = finish;
  });
} while (!stopped);

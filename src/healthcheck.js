import { loadConfig } from './config.js';
import { readState } from './state.js';

try {
  const config = loadConfig(process.env, { requireTelegram: false });
  const state = await readState(config.stateFile);
  if (!state.lastSuccessfulCheckAt) throw new Error('monitor has not completed a check yet');
  const ageMs = Date.now() - Date.parse(state.lastSuccessfulCheckAt);
  const maximumAgeMs = Math.max(5 * 60_000, config.checkIntervalSeconds * 5_000);
  if (!Number.isFinite(ageMs) || ageMs > maximumAgeMs) {
    throw new Error(`last successful check is ${Math.round(ageMs / 1000)} seconds old`);
  }
  process.stdout.write('healthy\n');
} catch (error) {
  process.stderr.write(`unhealthy: ${error.message}\n`);
  process.exitCode = 1;
}

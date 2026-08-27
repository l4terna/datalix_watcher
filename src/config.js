import path from 'node:path';

function integer(env, name, fallback, { min, max }) {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer from ${min} to ${max}`);
  }
  return value;
}

function boolean(env, name, fallback) {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  throw new Error(`${name} must be true or false`);
}

export function loadConfig(env = process.env, { requireTelegram = true } = {}) {
  const telegramBotToken = env.TELEGRAM_BOT_TOKEN?.trim();
  const telegramChatId = env.TELEGRAM_CHAT_ID?.trim();
  if (requireTelegram && (!telegramBotToken || !telegramChatId)) {
    throw new Error('TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are required');
  }

  return {
    telegramBotToken,
    telegramChatId,
    checkIntervalSeconds: integer(env, 'CHECK_INTERVAL_SECONDS', 15, { min: 10, max: 3600 }),
    confirmationsRequired: integer(env, 'CONFIRMATIONS_REQUIRED', 1, { min: 1, max: 10 }),
    missingChecksBeforePrune: integer(env, 'MISSING_CHECKS_BEFORE_PRUNE', 12, { min: 2, max: 1440 }),
    discoveryIntervalSeconds: integer(env, 'DISCOVERY_INTERVAL_SECONDS', 60, { min: 30, max: 3600 }),
    httpTimeoutSeconds: integer(env, 'HTTP_TIMEOUT_SECONDS', 15, { min: 3, max: 60 }),
    httpRetries: integer(env, 'HTTP_RETRIES', 2, { min: 0, max: 5 }),
    maxConcurrency: integer(env, 'MAX_CONCURRENCY', 3, { min: 1, max: 10 }),
    notifyOnStartup: boolean(env, 'NOTIFY_ON_STARTUP', false),
    stateFile: path.resolve(env.STATE_FILE || './data/state.json'),
    logLevel: env.LOG_LEVEL || 'info',
    sitemapUrl: 'https://datalix.eu/sitemap-main.xml',
  };
}

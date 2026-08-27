import fs from 'node:fs/promises';
import path from 'node:path';

export function emptyState() {
  return {
    version: 1,
    initializedAt: null,
    lastSuccessfulCheckAt: null,
    products: {},
    outbox: [],
  };
}

export async function readState(filename) {
  try {
    const parsed = JSON.parse(await fs.readFile(filename, 'utf8'));
    if (parsed.version !== 1 || typeof parsed.products !== 'object' || !Array.isArray(parsed.outbox)) {
      throw new Error('unsupported state shape');
    }
    return parsed;
  } catch (error) {
    if (error.code === 'ENOENT') return emptyState();
    throw new Error(`Cannot read state ${filename}: ${error.message}`);
  }
}

export async function writeState(filename, state) {
  const directory = path.dirname(filename);
  await fs.mkdir(directory, { recursive: true });
  const temporary = `${filename}.${process.pid}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  await fs.rename(temporary, filename);
}

function eventId(product, observedAt) {
  return `${observedAt}:${product.key}`;
}

export function observeProducts(state, products, { confirmationsRequired, notifyOnStartup, now }) {
  const firstCheck = !state.initializedAt;
  const events = [];

  for (const product of products) {
    const previous = state.products[product.key];
    const discoveredAfterBaseline = !previous && !firstCheck;
    const candidateCount = previous?.candidateAvailable === product.available
      ? previous.candidateCount + 1
      : 1;
    const record = {
      ...product,
      candidateAvailable: product.available,
      candidateCount,
      confirmedAvailable: previous
        ? previous.confirmedAvailable
        : (firstCheck ? product.available : null),
      firstSeenAt: previous?.firstSeenAt ?? now,
      lastSeenAt: now,
    };

    const confirmationReached = candidateCount >= confirmationsRequired;
    const changedToAvailable = confirmationReached
      && product.available
      && previous?.confirmedAvailable === false;
    const discoveredAvailable = confirmationReached
      && product.available
      && (discoveredAfterBaseline || previous?.confirmedAvailable === null);

    if (confirmationReached) record.confirmedAvailable = product.available;

    const shouldNotify = changedToAvailable || discoveredAvailable || (firstCheck && notifyOnStartup && product.available);
    if (shouldNotify) {
      const event = {
        id: eventId(product, now),
        kind: discoveredAvailable ? 'new' : 'restocked',
        observedAt: now,
        product,
      };
      if (!state.outbox.some((item) => item.id === event.id)) {
        state.outbox.push(event);
        events.push(event);
      }
    }

    state.products[product.key] = record;
  }

  state.initializedAt ??= now;
  state.lastSuccessfulCheckAt = now;
  return events;
}

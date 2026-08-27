const priorities = { debug: 10, info: 20, warn: 30, error: 40 };

export function createLogger(level = 'info') {
  const threshold = priorities[level] ?? priorities.info;
  const write = (severity, message, details = {}) => {
    if (priorities[severity] < threshold) return;
    const line = { time: new Date().toISOString(), level: severity, message, ...details };
    const stream = severity === 'error' ? process.stderr : process.stdout;
    stream.write(`${JSON.stringify(line)}\n`);
  };
  return {
    debug: (message, details) => write('debug', message, details),
    info: (message, details) => write('info', message, details),
    warn: (message, details) => write('warn', message, details),
    error: (message, details) => write('error', message, details),
  };
}

// Structured logger wrapper
type LogLevel = 'INFO' | 'WARN' | 'ERROR';

function formatTimestamp(): string {
  return new Date().toISOString();
}

function formatMessage(level: LogLevel, module: string, message: string, details?: any): string {
  const detailsStr = details ? ` ${JSON.stringify(details)}` : '';
  return `[${formatTimestamp()}] [${level}] [${module}] ${message}${detailsStr}`;
}

export const logger = {
  info(module: string, message: string, details?: any) {
    console.log(formatMessage('INFO', module, message, details));
  },

  warn(module: string, message: string, details?: any) {
    console.warn(formatMessage('WARN', module, message, details));
  },

  error(module: string, message: string, details?: any) {
    console.error(formatMessage('ERROR', module, message, details));
  },
};

export default logger;

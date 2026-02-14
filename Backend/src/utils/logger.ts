import winston from 'winston';
import { env } from '../config/env';

const levels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  debug: 'blue',
};

winston.addColors(colors);

const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

const consoleFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(
    (info) => `${info.timestamp} [${info.level}]: ${info.message}${
      info.stack ? `\n${info.stack}` : ''
    }${
      Object.keys(info).length > 3
        ? `\n${JSON.stringify(
            Object.fromEntries(
              Object.entries(info).filter(
                ([key]) => !['timestamp', 'level', 'message', 'stack'].includes(key)
              )
            ),
            null,
            2
          )}`
        : ''
    }`
  )
);

const transports: winston.transport[] = [
    new winston.transports.Console({
    format: env.NODE_ENV === 'production' ? format : consoleFormat,
  }),
];

if (env.NODE_ENV === 'production') {
  transports.push(
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      format,
    }),
    new winston.transports.File({
      filename: 'logs/combined.log',
      format,
    })
  );
}

export const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  levels,
  format,
  transports,
  exitOnError: false,
});

export const loggerStream = {
  write: (message: string) => {
    logger.info(message.trim());
  },
};

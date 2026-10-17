import type { NextFunction, Request, Response } from 'express';

/** An error whose message is safe to show to the user. */
export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const fail = (status: number, message: string): never => {
  throw new HttpError(status, message);
};

export function int(value: unknown, field: string, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}): number {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < min || n > max) {
    fail(400, `Некорректное значение: ${field}`);
  }
  return n as number;
}

export function num(value: unknown, field: string, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}): number {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max) {
    fail(400, `Некорректное значение: ${field}`);
  }
  return n as number;
}

export function str(value: unknown, field: string, { min = 1, max = 200 } = {}): string {
  if (typeof value !== 'string') fail(400, `Некорректное значение: ${field}`);
  const s = (value as string).trim();
  if (s.length < min || s.length > max) fail(400, `Некорректное значение: ${field}`);
  return s;
}

export function optStr(value: unknown, field: string, max = 200): string {
  if (value === undefined || value === null) return '';
  return str(value, field, { min: 0, max });
}

export function bool(value: unknown): 0 | 1 {
  return value === true || value === 1 || value === '1' ? 1 : 0;
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({ error: 'Некорректный JSON' });
    return;
  }
  console.error('[api]', err);
  res.status(500).json({ error: 'Внутренняя ошибка сервера' });
}

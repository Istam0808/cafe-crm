import { randomBytes } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { get, now, run } from './db.ts';
import { HttpError } from './http.ts';

export type Role = 'admin' | 'cashier' | 'waiter';

export interface User {
  id: number;
  name: string;
  role: Role;
}

declare global {
  namespace Express {
    interface Request {
      user: User;
    }
  }
}

export function createSession(userId: number): string {
  const token = randomBytes(32).toString('hex');
  run('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)', token, userId, now());
  return token;
}

export function userByToken(token: string | undefined): User | undefined {
  if (!token) return undefined;
  return get<User>(
    `SELECT u.id, u.name, u.role FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token = ? AND u.is_active = 1`,
    token,
  );
}

export function bearer(req: Request): string | undefined {
  const header = req.headers.authorization;
  return header?.startsWith('Bearer ') ? header.slice(7) : undefined;
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const user = userByToken(bearer(req));
  if (!user) return next(new HttpError(401, 'Нужно войти заново'));
  req.user = user;
  next();
}

/** Cashier is a "главный" without access to settings; admin can do everything. */
export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!roles.includes(req.user.role)) return next(new HttpError(403, 'Недостаточно прав'));
    next();
  };
}

export const isManager = (user: User) => user.role === 'admin' || user.role === 'cashier';

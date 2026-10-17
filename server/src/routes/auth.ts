import { Router } from 'express';
import { all, get, run } from '../db.ts';
import { bearer, createSession, requireAuth } from '../auth.ts';
import { fail, int, str } from '../http.ts';
import { verifyPin } from '../pin.ts';

export const authRouter = Router();

const MAX_FAILS = 5;
const LOCK_MS = 60_000;
const fails = new Map<number, { count: number; until: number }>();

authRouter.get('/users', (_req, res) => {
  res.json(all('SELECT id, name, role FROM users WHERE is_active = 1 ORDER BY role, name'));
});

authRouter.post('/login', (req, res) => {
  const userId = int(req.body?.userId, 'userId', { min: 1 });
  const pin = str(req.body?.pin, 'PIN', { min: 4, max: 6 });

  const lock = fails.get(userId);
  if (lock && lock.until > Date.now()) fail(429, 'Слишком много попыток, подождите минуту');

  const user = get<{ id: number; name: string; role: string; pin_hash: string }>(
    'SELECT id, name, role, pin_hash FROM users WHERE id = ? AND is_active = 1',
    userId,
  );
  if (!user || !verifyPin(pin, user.pin_hash)) {
    const count = (lock?.count ?? 0) + 1;
    fails.set(userId, { count: count >= MAX_FAILS ? 0 : count, until: count >= MAX_FAILS ? Date.now() + LOCK_MS : 0 });
    fail(401, 'Неверный PIN');
  }
  fails.delete(userId);
  res.json({ token: createSession(user!.id), user: { id: user!.id, name: user!.name, role: user!.role } });
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.json(req.user);
});

authRouter.post('/logout', requireAuth, (req, res) => {
  run('DELETE FROM sessions WHERE token = ?', bearer(req)!);
  res.json({ ok: true });
});

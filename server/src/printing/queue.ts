import { Socket } from 'node:net';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { all, DATA_DIR, get, now, run } from '../db.ts';
import { broadcast } from '../realtime.ts';
import type { PrinterProfile, Ticket } from './escpos.ts';

export interface PrinterRow {
  id: number;
  name: string;
  ip: string;
  port: number;
  codepage: 'cp866' | 'cp1251';
  codepage_id: number;
  width: 58 | 80;
  emulate: number;
  is_active: number;
}

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 4_000;
const SOCKET_TIMEOUT_MS = 5_000;
const PRINTS_DIR = resolve(DATA_DIR, 'prints');

export function getPrinter(id: number | null | undefined): PrinterRow | undefined {
  if (!id) return undefined;
  return get<PrinterRow>('SELECT * FROM printers WHERE id = ? AND is_active = 1', id);
}

export function profileOf(printer: PrinterRow): PrinterProfile {
  return { codepage: printer.codepage, codepageId: printer.codepage_id, width: printer.width };
}

/** Stores a ready ticket in the queue; it survives a restart and is retried if the printer is down. */
export function enqueue(printer: PrinterRow, kind: string, title: string, ticket: Ticket): number {
  const id = Number(
    run(
      'INSERT INTO print_jobs (printer_id, kind, title, data, preview, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      printer.id, kind, title, ticket.bytes(), ticket.preview(), now(),
    ).lastInsertRowid,
  );
  // let the surrounding transaction commit first
  setImmediate(kick);
  return id;
}

const busy = new Set<number>();

export function kick() {
  const printerIds = all<{ printer_id: number }>(
    "SELECT DISTINCT printer_id FROM print_jobs WHERE status = 'pending'",
  ).map((r) => r.printer_id);
  for (const printerId of printerIds) {
    if (!busy.has(printerId)) void drain(printerId);
  }
}

/** Prints one printer's jobs strictly in order, so tickets never interleave. */
async function drain(printerId: number) {
  busy.add(printerId);
  try {
    for (;;) {
      const job = get<{ id: number; title: string; data: Uint8Array; preview: string; kind: string; attempts: number }>(
        "SELECT id, title, data, preview, kind, attempts FROM print_jobs WHERE printer_id = ? AND status = 'pending' ORDER BY id LIMIT 1",
        printerId,
      );
      if (!job) return;
      const printer = get<PrinterRow>('SELECT * FROM printers WHERE id = ?', printerId);
      if (!printer) return;

      try {
        if (printer.emulate) emulate(printer, job);
        else await sendRaw(printer.ip, printer.port, Buffer.from(job.data));
        run("UPDATE print_jobs SET status = 'done', attempts = attempts + 1, error = NULL, printed_at = ? WHERE id = ?", now(), job.id);
        broadcast({ type: 'print', jobId: job.id, status: 'done', printer: printer.name });
      } catch (err) {
        const attempts = job.attempts + 1;
        const message = err instanceof Error ? err.message : String(err);
        const status = attempts >= MAX_ATTEMPTS ? 'failed' : 'pending';
        run('UPDATE print_jobs SET status = ?, attempts = ?, error = ? WHERE id = ?', status, attempts, message, job.id);
        console.warn(`[print] ${printer.name} (${printer.ip}): ${message} — попытка ${attempts}`);
        broadcast({ type: 'print', jobId: job.id, status, printer: printer.name, error: message });
        if (status === 'pending') {
          setTimeout(kick, RETRY_DELAY_MS).unref();
          return;
        }
      }
    }
  } finally {
    busy.delete(printerId);
  }
}

function emulate(printer: PrinterRow, job: { id: number; kind: string; title: string; preview: string }) {
  mkdirSync(PRINTS_DIR, { recursive: true });
  writeFileSync(resolve(PRINTS_DIR, `${String(job.id).padStart(6, '0')}-${job.kind}.txt`), job.preview, 'utf8');
  console.log(`\n[print → ${printer.name}] ${job.title}\n${job.preview}\n`);
}

export function sendRaw(ip: string, port: number, data: Buffer): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    if (!ip) {
      reject(new Error('Не указан IP принтера'));
      return;
    }
    const socket = new Socket();
    let settled = false;
    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (err) reject(err);
      else resolvePromise();
    };
    socket.setTimeout(SOCKET_TIMEOUT_MS, () => finish(new Error('Принтер не отвечает (таймаут)')));
    socket.once('error', (err: NodeJS.ErrnoException) => {
      const reason = err.code === 'ECONNREFUSED' ? 'соединение отклонено' : err.code === 'EHOSTUNREACH' ? 'принтер недоступен в сети' : err.message;
      finish(new Error(reason));
    });
    socket.connect(port, ip, () => {
      socket.end(data, () => finish());
    });
  });
}

export function startPrintQueue() {
  // jobs left pending by a previous run
  kick();
  setInterval(kick, 15_000).unref();
}

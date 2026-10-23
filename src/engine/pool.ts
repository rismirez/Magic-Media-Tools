import type { WorkerRequest, WorkerResponse } from './types';

type Result = Extract<WorkerResponse, { ok: true }>;

/** Pool de workers: cada uno procesa una imagen a la vez. */
export class WorkerPool {
  private workers: Worker[] = [];
  private idle: Worker[] = [];
  private waiting: Array<(w: Worker) => void> = [];
  private pending = new Map<number, { worker: Worker; resolve: (r: Result) => void; reject: (e: Error) => void }>();
  private seq = 0;

  constructor(size = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1))) {
    for (let i = 0; i < size; i++) {
      const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e: MessageEvent<WorkerResponse>) => this.onMessage(w, e.data);
      w.onerror = (e) => this.onCrash(w, e.message);
      this.workers.push(w);
      this.idle.push(w);
    }
  }

  private onMessage(w: Worker, msg: WorkerResponse) {
    const p = this.pending.get(msg.id);
    this.pending.delete(msg.id);
    this.release(w);
    if (!p) return;
    if (msg.ok) p.resolve(msg);
    else p.reject(new Error(msg.error));
  }

  private onCrash(w: Worker, message: string) {
    for (const [id, p] of this.pending) {
      if (p.worker !== w) continue;
      p.reject(new Error(message || 'El proceso de conversión falló'));
      this.pending.delete(id);
    }
    this.release(w);
  }

  private release(w: Worker) {
    const next = this.waiting.shift();
    if (next) next(w);
    else this.idle.push(w);
  }

  private acquire(): Promise<Worker> {
    const w = this.idle.pop();
    return w ? Promise.resolve(w) : new Promise((r) => this.waiting.push(r));
  }

  async run(req: Omit<WorkerRequest, 'id'>): Promise<Result> {
    const worker = await this.acquire();
    const id = ++this.seq;
    return new Promise<Result>((resolve, reject) => {
      this.pending.set(id, { worker, resolve, reject });
      worker.postMessage({ ...req, id }, [req.buffer]);
    });
  }

  dispose() {
    this.workers.forEach((w) => w.terminate());
  }
}

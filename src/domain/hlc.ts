// Гибридные логические часы (SPEC §7.1): физическое время + счётчик + устройство.
// Строка фиксированной ширины сравнивается как обычная строка: больше — значит позже.
// Формат: 13 hex-цифр миллисекунд, «-», 4 hex-цифры счётчика, «-», id устройства.

export type HLC = string;

export const hlcString = (ms: number, counter: number, node: string): HLC =>
  `${ms.toString(16).padStart(13, '0')}-${counter.toString(16).padStart(4, '0')}-${node}`;

export function parseHlc(h: HLC): { ms: number; counter: number; node: string } {
  const [ms, counter, ...node] = h.split('-');
  return { ms: parseInt(ms, 16) || 0, counter: parseInt(counter, 16) || 0, node: node.join('-') };
}

export const maxHlc = (a: HLC | undefined, b: HLC | undefined): HLC => ((a ?? '') > (b ?? '') ? (a ?? '') : (b ?? ''));

/** Часы устройства: каждое новое событие позже всех известных, даже если системное время отстаёт. */
export class Clock {
  private ms = 0;
  private counter = 0;

  constructor(
    readonly node: string,
    private readonly now: () => number = () => Date.now(),
  ) {}

  tick(): HLC {
    const t = this.now();
    if (t > this.ms) {
      this.ms = t;
      this.counter = 0;
    } else this.counter += 1;
    return hlcString(this.ms, this.counter, this.node);
  }

  /** Учесть время, пришедшее с другого устройства. */
  receive(remote: HLC) {
    if (!remote) return;
    const r = parseHlc(remote);
    if (r.ms > this.ms || (r.ms === this.ms && r.counter > this.counter)) {
      this.ms = r.ms;
      this.counter = r.counter;
    }
  }
}

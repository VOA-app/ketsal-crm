// SHA-256 для проверки целостности файлов резервной копии (SPEC §9.1).
import { buf } from './bytes';

export async function sha256Hex(data: Uint8Array): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', buf(data)));
  return Array.from(h, (b) => b.toString(16).padStart(2, '0')).join('');
}

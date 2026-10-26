// Резервная копия на этом устройстве: собрать, открыть, восстановить (SPEC §9.1).
// Экран работает только через эти функции; ключи и шифрование остаются внутри.
import { requireSession } from '../crypto/session';
import { decodeRecovery } from '../crypto/keys';
import { unlockWithPassword, unlockWithRecovery } from '../crypto/vault';
import { getVaultHeader, local } from '../db/repo';
import { todayISO } from '../domain/dates';
import { fetchMissingPhotos } from '../sync/service';
import { buildBackup, importBackup, inspectBackup, type BackupInfo, type BuildResult, type ImportMode } from './ketsal';

export type Progress = (stage: 'photos' | 'pack' | 'check' | 'restore', done: number, total: number) => void;

/** Собрать копию: сначала докачать с Диска фото, которых нет на устройстве. */
export async function makeBackup(onProgress?: Progress): Promise<BuildResult> {
  await fetchMissingPhotos((done, total) => onProgress?.('photos', done, total));
  onProgress?.('pack', 0, 1);
  const header = await getVaultHeader();
  if (!header) throw new Error('no vault');
  return buildBackup({ local: local(), session: requireSession, header, today: todayISO() });
}

/** Открыть файл и проверить целостность. */
export const openBackup = (file: Blob, onProgress?: Progress): Promise<BackupInfo> =>
  inspectBackup(file, (done, total) => onProgress?.('check', done, total));

/** Копия другого хранилища (сделана до переустановки или на другом устройстве): нужен её пароль. */
export const needsSecret = (info: BackupInfo): boolean => info.header.vaultId !== requireSession().vaultId;

/** Похоже ли на ключ восстановления (до проверки ключом). */
export const isRecoveryCode = (s: string): boolean => !!decodeRecovery(s);

/** Перед открытой выгрузкой: скачать с Диска фото, которых нет на устройстве. */
export const fetchPhotosForExport = (onProgress?: (done: number, total: number) => void) =>
  fetchMissingPhotos(onProgress);

/** Ключ копии по её паролю или ключу восстановления. Неверный — WrongSecretError. */
export function unlockBackup(info: BackupInfo, secret: { password: string } | { recovery: string }) {
  return 'password' in secret
    ? unlockWithPassword(info.header, secret.password)
    : unlockWithRecovery(info.header, secret.recovery);
}

/** Восстановить. key — ключ копии другого хранилища; для копии этого хранилища не нужен. */
export function restoreBackup(info: BackupInfo, key: CryptoKey | null, mode: ImportMode, onProgress?: Progress) {
  const session = requireSession();
  return importBackup({
    local: local(),
    session: requireSession,
    info,
    backupDek: key ?? session.dek,
    mode,
    today: todayISO(),
    onProgress: (done, total) => onProgress?.('restore', done, total),
  });
}

export type { BackupInfo, BuildResult, ImportMode };
export { backupFileName, BackupFormatError } from './ketsal';
export { WrongSecretError } from '../crypto/vault';

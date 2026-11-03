// Passkey с расширением PRF для входа по Face ID (SPEC §5.4). Этап 0: на iPhone в режиме «Домой»
// секрет приходит сразу при создании passkey. Сам passkey хранится в Связке ключей iCloud;
// приложение помнит только его id и соль PRF.

const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const ab = (b: Uint8Array) => b.slice().buffer as ArrayBuffer;
const random = (n: number) => crypto.getRandomValues(new Uint8Array(n));

export interface PasskeyRef {
  /** base64: rawId */
  credId: string;
  /** base64: соль PRF */
  prfSalt: string;
}

/** Есть ли на устройстве Face ID / Touch ID для входа (без него опция не показывается). */
export async function passkeyAvailable(): Promise<boolean> {
  try {
    if (!window.PublicKeyCredential || !window.isSecureContext) return false;
    const pkc = PublicKeyCredential as typeof PublicKeyCredential & {
      getClientCapabilities?: () => Promise<Record<string, boolean>>;
    };
    if (pkc.getClientCapabilities) {
      const caps = await pkc.getClientCapabilities();
      if (caps['extension:prf'] === false) return false;
    }
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

/** Passkey не дал секрет PRF: на этом устройстве Face ID для входа не подходит. */
export class NoPrfError extends Error {
  constructor() {
    super('prf unavailable');
    this.name = 'NoPrfError';
  }
}

interface PrfResults {
  prf?: { enabled?: boolean; results?: { first?: ArrayBuffer } };
}

const secretOf = (cred: Credential | null): Uint8Array | null => {
  const ext = (cred as PublicKeyCredential | null)?.getClientExtensionResults() as PrfResults | undefined;
  const first = ext?.prf?.results?.first;
  return first ? new Uint8Array(first) : null;
};

/** Получить секрет PRF существующим passkey (Face ID). */
export async function prfSecret(ref: PasskeyRef): Promise<Uint8Array> {
  const cred = await navigator.credentials.get({
    publicKey: {
      challenge: ab(random(32)),
      allowCredentials: [{ type: 'public-key', id: ab(unb64(ref.credId)) }],
      userVerification: 'required',
      timeout: 60_000,
      extensions: { prf: { eval: { first: ab(unb64(ref.prfSalt)) } } } as AuthenticationExtensionsClientInputs,
    },
  });
  const s = secretOf(cred);
  if (!s) throw new NoPrfError();
  return s;
}

/**
 * Создать passkey и сразу получить секрет. Если при создании секрет не пришёл (так бывает не везде),
 * просим Face ID ещё раз. Вызывать прямо из нажатия: иначе Safari не покажет Face ID.
 */
export async function createPasskey(): Promise<{ ref: PasskeyRef; secret: Uint8Array }> {
  const salt = random(32);
  const cred = (await navigator.credentials.create({
    publicKey: {
      rp: { name: 'Кетсаль' },
      user: { id: ab(random(16)), name: 'ketsal', displayName: 'Кетсаль · учёт клиентов' },
      challenge: ab(random(32)),
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        residentKey: 'preferred',
        userVerification: 'required',
      },
      timeout: 60_000,
      extensions: { prf: { eval: { first: ab(salt) } } } as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new NoPrfError();
  const ref: PasskeyRef = { credId: b64(new Uint8Array(cred.rawId)), prfSalt: b64(salt) };
  const secret = secretOf(cred) ?? (await prfSecret(ref));
  return { ref, secret };
}

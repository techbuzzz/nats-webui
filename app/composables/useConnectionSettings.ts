/**
 * Browser-persisted NATS connection settings.
 *
 * The server-side env config is always the default; anything set here is an
 * operator override for the playground only. It never changes which monitoring
 * endpoint the Nitro proxy talks to.
 *
 * Secret handling: the password/token are kept in `sessionStorage` unless the
 * operator explicitly opts into "remember in this browser", which moves them to
 * `localStorage`. Non-secret values (URL, connection name, username) always live
 * in `localStorage`.
 */

export interface ConnectionSettings {
  websocketUrl: string
  connectionName: string
  user: string
  password: string
  authToken: string
  /** When true, secrets are persisted in localStorage instead of sessionStorage. */
  rememberSecret: boolean
}

const STORAGE_KEY = 'nats-webui:connection'
const SECRET_STORAGE_KEY = 'nats-webui:connection:secret'

type StoredSecret = Pick<ConnectionSettings, 'password' | 'authToken'>

function readSecret(storage: Storage | null): StoredSecret {
  return readJson<StoredSecret>(storage, SECRET_STORAGE_KEY) ?? { password: '', authToken: '' }
}

/** Fields that are safe to persist across browser restarts. */
const NON_SECRET_FIELDS = ['websocketUrl', 'connectionName', 'user', 'rememberSecret'] as const

const DEFAULTS: ConnectionSettings = {
  websocketUrl: '',
  connectionName: 'nats-webui',
  user: '',
  password: '',
  authToken: '',
  rememberSecret: false,
}

function readJson<T>(storage: Storage | null, key: string): T | null {
  if (!storage) {
    return null
  }
  try {
    const raw = storage.getItem(key)
    return raw === null ? null : (JSON.parse(raw) as T)
  }
  catch {
    return null
  }
}

function writeJson(storage: Storage | null, key: string, value: unknown): void {
  if (!storage) {
    return
  }
  try {
    storage.setItem(key, JSON.stringify(value))
  }
  catch {
    // Private-browsing or quota errors must not break the app.
  }
}

export function useConnectionSettings() {
  const settings = useState<ConnectionSettings>('nats-webui:connection-settings', () => ({
    ...DEFAULTS,
  }))

  function hydrate(defaults: { websocketUrl: string, connectionName: string }): void {
    if (!import.meta.client) {
      return
    }

    const local = readJson<Partial<ConnectionSettings>>(localStorage, STORAGE_KEY) ?? {}
    const secret = readSecret(sessionStorage)

    settings.value = {
      websocketUrl: typeof local.websocketUrl === 'string' ? local.websocketUrl : defaults.websocketUrl,
      connectionName: typeof local.connectionName === 'string' ? local.connectionName : defaults.connectionName,
      user: typeof local.user === 'string' ? local.user : '',
      // Secrets come from whichever store the current `rememberSecret` selects.
      password: typeof secret.password === 'string' ? secret.password : '',
      authToken: typeof secret.authToken === 'string' ? secret.authToken : '',
      rememberSecret: local.rememberSecret === true,
    }

    if (settings.value.rememberSecret) {
      const persistedSecret = readSecret(localStorage)
      settings.value.password = persistedSecret.password
      settings.value.authToken = persistedSecret.authToken
    }
  }

  function persist(): void {
    if (!import.meta.client) {
      return
    }

    const nonSecret: Record<string, unknown> = {}
    for (const field of NON_SECRET_FIELDS) {
      nonSecret[field] = settings.value[field]
    }
    writeJson(localStorage, STORAGE_KEY, nonSecret)

    const secret = { password: settings.value.password, authToken: settings.value.authToken }

    if (settings.value.rememberSecret) {
      writeJson(localStorage, SECRET_STORAGE_KEY, secret)
      sessionStorage.removeItem(SECRET_STORAGE_KEY)
    }
    else {
      writeJson(sessionStorage, SECRET_STORAGE_KEY, secret)
      localStorage.removeItem(SECRET_STORAGE_KEY)
    }
  }

  function reset(defaults: { websocketUrl: string, connectionName: string }): void {
    settings.value = { ...DEFAULTS, ...defaults }
    if (import.meta.client) {
      localStorage.removeItem(STORAGE_KEY)
      localStorage.removeItem(SECRET_STORAGE_KEY)
      sessionStorage.removeItem(SECRET_STORAGE_KEY)
    }
  }

  return { settings, hydrate, persist, reset }
}
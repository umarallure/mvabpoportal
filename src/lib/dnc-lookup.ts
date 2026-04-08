const DNC_LOOKUP_TIMEOUT_MS = 15_000

export type DncCallStatus = 'SAFE' | 'WARNING' | 'DANGER' | 'INVALID' | 'ERROR'

export type DncLookupFlags = {
  isTcpa: boolean
  isDnc: boolean
  isInvalid: boolean
  isClean: boolean
}

export type DncLookupProvider = {
  provider: string
  isTcpa: boolean
  isDnc: boolean
  isInvalid: boolean
  isClean: boolean
  matchedLists: string[]
  error: string | null
}

export type DncLookupResponse = {
  callStatus: DncCallStatus
  message: string
  flags: DncLookupFlags
  matchedLists: string[]
  leadDeactivated: boolean
  providers: DncLookupProvider[]
}

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }

  return null
}

const toStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return []

  return value.filter((item): item is string => typeof item === 'string')
}

const isDncCallStatus = (value: unknown): value is DncCallStatus => {
  return value === 'SAFE' || value === 'WARNING' || value === 'DANGER' || value === 'INVALID' || value === 'ERROR'
}

const resolveFunctionsBase = () => {
  const explicitBase = String(import.meta.env.VITE_SUPABASE_FUNCTIONS_BASE ?? '').trim().replace(/\/$/, '')

  if (explicitBase) {
    return explicitBase.endsWith('/functions/v1') ? explicitBase : `${explicitBase}/functions/v1`
  }

  return `${import.meta.env.VITE_SUPABASE_URL.replace(/\/$/, '')}/functions/v1`
}

const fetchWithTimeout = async (input: string, init: RequestInit, timeoutMs = DNC_LOOKUP_TIMEOUT_MS) => {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal
    })
  } finally {
    window.clearTimeout(timeout)
  }
}

const coerceProvider = (value: unknown): DncLookupProvider | null => {
  const record = asRecord(value)

  if (!record || typeof record.provider !== 'string') {
    return null
  }

  return {
    provider: record.provider,
    isTcpa: record.isTcpa === true,
    isDnc: record.isDnc === true,
    isInvalid: record.isInvalid === true,
    isClean: record.isClean === true,
    matchedLists: toStringArray(record.matchedLists),
    error: typeof record.error === 'string' ? record.error : null
  }
}

const coerceDncLookupResponse = (value: unknown): DncLookupResponse | null => {
  const record = asRecord(value)
  const flags = asRecord(record?.flags)

  if (!record || !isDncCallStatus(record.callStatus)) {
    return null
  }

  return {
    callStatus: record.callStatus,
    message: typeof record.message === 'string' ? record.message : 'DNC screening completed.',
    flags: {
      isTcpa: flags?.isTcpa === true,
      isDnc: flags?.isDnc === true,
      isInvalid: flags?.isInvalid === true,
      isClean: flags?.isClean === true
    },
    matchedLists: toStringArray(record.matchedLists),
    leadDeactivated: record.leadDeactivated === true,
    providers: Array.isArray(record.providers)
      ? record.providers
          .map(coerceProvider)
          .filter((provider): provider is DncLookupProvider => provider !== null)
      : []
  }
}

export class DncLookupError extends Error {
  status: number
  response: DncLookupResponse | null

  constructor(message: string, status: number, response: DncLookupResponse | null = null) {
    super(message)
    this.name = 'DncLookupError'
    this.status = status
    this.response = response
  }
}

export const normalizeUsPhone = (value: unknown) => {
  const digits = String(value ?? '').replace(/\D/g, '')

  if (digits.length === 11 && digits.startsWith('1')) {
    return digits.slice(1)
  }

  return digits.length === 10 ? digits : ''
}

export const formatUsPhone = (value: unknown) => {
  const digits = normalizeUsPhone(value)

  if (!digits) return ''

  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}

export const lookupDncScreening = async (mobileNumber: string): Promise<DncLookupResponse> => {
  const normalizedPhone = normalizeUsPhone(mobileNumber)

  if (!normalizedPhone) {
    throw new DncLookupError('Please enter a valid 10-digit US phone number.', 400, {
      callStatus: 'INVALID',
      message: 'Invalid mobile number format provided.',
      flags: {
        isTcpa: false,
        isDnc: false,
        isInvalid: true,
        isClean: false
      },
      matchedLists: [],
      leadDeactivated: false,
      providers: []
    })
  }

  try {
    const response = await fetchWithTimeout(`${resolveFunctionsBase()}/dnc-lookup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY
      },
      body: JSON.stringify({ mobileNumber: normalizedPhone })
    })

    let payload: unknown

    try {
      payload = await response.json()
    } catch {
      throw new DncLookupError(`DNC screening returned an invalid response (${response.status}).`, response.status, null)
    }

    const parsed = coerceDncLookupResponse(payload)

    if (!parsed) {
      throw new DncLookupError(`DNC screening returned an unexpected response (${response.status}).`, response.status, null)
    }

    if (!response.ok) {
      throw new DncLookupError(parsed.message, response.status, parsed)
    }

    return parsed
  } catch (error) {
    if (error instanceof DncLookupError) {
      throw error
    }

    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new DncLookupError('DNC/TCPA screening timed out. Please try again.', 504, null)
    }

    throw new DncLookupError('Unable to reach the DNC/TCPA screening service. Please try again.', 0, null)
  }
}

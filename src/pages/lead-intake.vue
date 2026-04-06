<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '../composables/useAuth'
import { supabase } from '../lib/supabase'

const auth = useAuth()
const router = useRouter()
const route = useRoute()
const toast = useToast()
const dncRawPhone = ref('')
const dncChecking = ref(false)
const dncVerified = ref(false)
const dncBlocked = ref(false)
const dncStatus = ref<'idle' | 'clean' | 'blocked' | 'error'>('idle')

const verifyDNC = async () => {
  const digits = dncRawPhone.value.replace(/\D/g, '')
  if (digits.length !== 10) {
    toast.add({
      title: 'Invalid phone number',
      description: 'Please enter a valid 10-digit US phone number.',
      icon: 'i-lucide-alert-circle',
      color: 'error'
    })
    return
  }

  dncChecking.value = true
  dncVerified.value = false
  dncBlocked.value = false
  dncStatus.value = 'idle'

  try {
    const res = await fetch(
      'https://yfivkhczzywgttbgwtgr.supabase.co/functions/v1/dnc-lookup',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY as string
        },
        body: JSON.stringify({ mobileNumber: digits })
      }
    )

    const data = await res.json()

    if (!res.ok) {
      throw new Error(data?.error || `DNC check failed (${res.status})`)
    }

    const results: unknown[] = Array.isArray(data)
      ? data
      : Array.isArray(data?.results)
        ? data.results
        : Array.isArray(data?.data?.results)
          ? data.data.results
          : data?.data
            ? [data.data]
            : [data]

    const entry = results[0] as Record<string, unknown> | undefined
    const isOnDnc =
      entry?.is_dnc === true ||
      entry?.dnc === true ||
      entry?.status === 'dnc' ||
      entry?.registered === true ||
      entry?.blocked === true

    if (isOnDnc) {
      dncBlocked.value = true
      dncStatus.value = 'blocked'
      form.phone_number = ''
    } else {
      dncVerified.value = true
      dncStatus.value = 'clean'
      form.phone_number = dncRawPhone.value

      if (!submissionId.value) {
        submissionId.value = generateSubmissionId()
      }
      router.replace({ query: { ...route.query, sid: submissionId.value } })
    }
  } catch (err) {
    dncStatus.value = 'error'
    const msg = err instanceof Error ? err.message : 'DNC check failed. Please try again.'
    toast.add({ title: 'DNC Check Error', description: msg, icon: 'i-lucide-x', color: 'error' })
  } finally {
    dncChecking.value = false
  }
}

const submissionId = ref<string>(
  typeof route.query.sid === 'string' ? route.query.sid : ''
)

const generateSubmissionId = (): string => {
  const ts = Date.now().toString()
  const rand = Math.floor(Math.random() * 1_000_000).toString().padStart(6, '0')
  return ts + rand
}

const form = reactive({
  accident_last_12_months: null as boolean | null,
  accident_date: '',
  prior_attorney_involved: null as boolean | null,
  prior_attorney_details: '',
  other_party_admit_fault: null as boolean | null,
  police_attended: null as boolean | null,
  police_report_ref: '',
  acc_street: '',
  acc_street2: '',
  acc_city: '',
  acc_state: '',
  acc_zip: '',
  acc_country: '',
  customer_state: '',
  accident_scenario: '',

  received_medical_treatment: null as boolean | null,
  medical_attention: '',
  injuries: '',

  insured: null as boolean | null,
  vehicle_registration: '',
  insurance_company: '',
  third_party_vehicle_registration: '',
  passengers_count: '' as number | '',

  first_name: '',
  last_name: '',
  phone_number: '',
  date_of_birth: '',
  email: '',
  street_address: '',
  street_address_2: '',
  city: '',
  state: '',
  zip_code: '',

  source_url: '',
  trustedform_cert_url: '',
  ip_address: '',

  has_medical_proof: null as boolean | null,
  has_insurance_docs: null as boolean | null,
  has_police_report: null as boolean | null,

  additional_notes: ''
})

type IntakeDocCategory = 'medical_report' | 'insurance_document' | 'police_report'

const INTAKE_DOC_CATEGORIES = [
  {
    key:        'medical_report'     as IntakeDocCategory,
    label:      'Medical Treatment Proof',
    formKey:    'has_medical_proof'  as const,
    description: 'Medical records, hospital bills, treatment summaries'
  },
  {
    key:        'insurance_document' as IntakeDocCategory,
    label:      'Insurance Documents',
    formKey:    'has_insurance_docs' as const,
    description: 'Insurance policy, declaration page, claim forms'
  },
  {
    key:        'police_report'      as IntakeDocCategory,
    label:      'Police Report',
    formKey:    'has_police_report'  as const,
    description: 'Official accident / police report documents'
  }
]

const docFiles = ref<Record<IntakeDocCategory, File[]>>({
  medical_report:      [],
  insurance_document:  [],
  police_report:       []
})

const docInputEl = ref<Record<IntakeDocCategory, HTMLInputElement | null>>({
  medical_report:      null,
  insurance_document:  null,
  police_report:       null
})

const ALLOWED_DOC_TYPES = ['application/pdf', 'image/png', 'image/jpeg']
const MAX_DOC_BYTES      = 10 * 1024 * 1024

const onDocFilesSelected = (e: Event, category: IntakeDocCategory) => {
  const fileList = (e.target as HTMLInputElement).files
  if (!fileList) return

  const incoming  = Array.from(fileList)
  const invalid   = incoming.filter(f => !ALLOWED_DOC_TYPES.includes(f.type))
  const oversized = incoming.filter(f => f.size > MAX_DOC_BYTES)

  if (invalid.length)   toast.add({ title: 'Invalid file type',  description: `Only PDF, PNG, JPEG allowed: ${invalid.map(f => f.name).join(', ')}`,    color: 'error',   icon: 'i-lucide-x' })
  if (oversized.length) toast.add({ title: 'File too large',     description: `Max 10 MB each: ${oversized.map(f => f.name).join(', ')}`,                color: 'error',   icon: 'i-lucide-x' })

  const valid = incoming.filter(f => ALLOWED_DOC_TYPES.includes(f.type) && f.size <= MAX_DOC_BYTES)
  docFiles.value[category] = [...docFiles.value[category], ...valid]

  const el = docInputEl.value[category]
  if (el) el.value = ''
}

const removeDocFile = (category: IntakeDocCategory, index: number) => {
  docFiles.value[category].splice(index, 1)
}

const formatDocBytes = (bytes: number) => {
  if (bytes < 1024)             return `${bytes} B`
  if (bytes < 1024 * 1024)     return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

const usStates = [
  { label: 'Alabama', value: 'AL' },
  { label: 'Alaska', value: 'AK' },
  { label: 'Arizona', value: 'AZ' },
  { label: 'Arkansas', value: 'AR' },
  { label: 'California', value: 'CA' },
  { label: 'Colorado', value: 'CO' },
  { label: 'Connecticut', value: 'CT' },
  { label: 'Delaware', value: 'DE' },
  { label: 'Florida', value: 'FL' },
  { label: 'Georgia', value: 'GA' },
  { label: 'Hawaii', value: 'HI' },
  { label: 'Idaho', value: 'ID' },
  { label: 'Illinois', value: 'IL' },
  { label: 'Indiana', value: 'IN' },
  { label: 'Iowa', value: 'IA' },
  { label: 'Kansas', value: 'KS' },
  { label: 'Kentucky', value: 'KY' },
  { label: 'Louisiana', value: 'LA' },
  { label: 'Maine', value: 'ME' },
  { label: 'Maryland', value: 'MD' },
  { label: 'Massachusetts', value: 'MA' },
  { label: 'Michigan', value: 'MI' },
  { label: 'Minnesota', value: 'MN' },
  { label: 'Mississippi', value: 'MS' },
  { label: 'Missouri', value: 'MO' },
  { label: 'Montana', value: 'MT' },
  { label: 'Nebraska', value: 'NE' },
  { label: 'Nevada', value: 'NV' },
  { label: 'New Hampshire', value: 'NH' },
  { label: 'New Jersey', value: 'NJ' },
  { label: 'New Mexico', value: 'NM' },
  { label: 'New York', value: 'NY' },
  { label: 'North Carolina', value: 'NC' },
  { label: 'North Dakota', value: 'ND' },
  { label: 'Ohio', value: 'OH' },
  { label: 'Oklahoma', value: 'OK' },
  { label: 'Oregon', value: 'OR' },
  { label: 'Pennsylvania', value: 'PA' },
  { label: 'Rhode Island', value: 'RI' },
  { label: 'South Carolina', value: 'SC' },
  { label: 'South Dakota', value: 'SD' },
  { label: 'Tennessee', value: 'TN' },
  { label: 'Texas', value: 'TX' },
  { label: 'Utah', value: 'UT' },
  { label: 'Vermont', value: 'VT' },
  { label: 'Virginia', value: 'VA' },
  { label: 'Washington', value: 'WA' },
  { label: 'West Virginia', value: 'WV' },
  { label: 'Wisconsin', value: 'WI' },
  { label: 'Wyoming', value: 'WY' }
]

const countries = [
  { label: 'United States', value: 'US' },
  { label: 'Afghanistan', value: 'AF' },
  { label: 'Albania', value: 'AL' },
  { label: 'Algeria', value: 'DZ' },
  { label: 'Andorra', value: 'AD' },
  { label: 'Angola', value: 'AO' },
  { label: 'Antigua and Barbuda', value: 'AG' },
  { label: 'Argentina', value: 'AR' },
  { label: 'Armenia', value: 'AM' },
  { label: 'Australia', value: 'AU' },
  { label: 'Austria', value: 'AT' },
  { label: 'Azerbaijan', value: 'AZ' },
  { label: 'Bahamas', value: 'BS' },
  { label: 'Bahrain', value: 'BH' },
  { label: 'Bangladesh', value: 'BD' },
  { label: 'Barbados', value: 'BB' },
  { label: 'Belarus', value: 'BY' },
  { label: 'Belgium', value: 'BE' },
  { label: 'Belize', value: 'BZ' },
  { label: 'Benin', value: 'BJ' },
  { label: 'Bhutan', value: 'BT' },
  { label: 'Bolivia', value: 'BO' },
  { label: 'Bosnia and Herzegovina', value: 'BA' },
  { label: 'Botswana', value: 'BW' },
  { label: 'Brazil', value: 'BR' },
  { label: 'Brunei', value: 'BN' },
  { label: 'Bulgaria', value: 'BG' },
  { label: 'Burkina Faso', value: 'BF' },
  { label: 'Burundi', value: 'BI' },
  { label: 'Cabo Verde', value: 'CV' },
  { label: 'Cambodia', value: 'KH' },
  { label: 'Cameroon', value: 'CM' },
  { label: 'Canada', value: 'CA' },
  { label: 'Central African Republic', value: 'CF' },
  { label: 'Chad', value: 'TD' },
  { label: 'Chile', value: 'CL' },
  { label: 'China', value: 'CN' },
  { label: 'Colombia', value: 'CO' },
  { label: 'Comoros', value: 'KM' },
  { label: 'Congo (DRC)', value: 'CD' },
  { label: 'Congo (Republic)', value: 'CG' },
  { label: 'Costa Rica', value: 'CR' },
  { label: 'Croatia', value: 'HR' },
  { label: 'Cuba', value: 'CU' },
  { label: 'Cyprus', value: 'CY' },
  { label: 'Czech Republic', value: 'CZ' },
  { label: 'Denmark', value: 'DK' },
  { label: 'Djibouti', value: 'DJ' },
  { label: 'Dominica', value: 'DM' },
  { label: 'Dominican Republic', value: 'DO' },
  { label: 'Ecuador', value: 'EC' },
  { label: 'Egypt', value: 'EG' },
  { label: 'El Salvador', value: 'SV' },
  { label: 'Equatorial Guinea', value: 'GQ' },
  { label: 'Eritrea', value: 'ER' },
  { label: 'Estonia', value: 'EE' },
  { label: 'Eswatini', value: 'SZ' },
  { label: 'Ethiopia', value: 'ET' },
  { label: 'Fiji', value: 'FJ' },
  { label: 'Finland', value: 'FI' },
  { label: 'France', value: 'FR' },
  { label: 'Gabon', value: 'GA' },
  { label: 'Gambia', value: 'GM' },
  { label: 'Georgia', value: 'GE' },
  { label: 'Germany', value: 'DE' },
  { label: 'Ghana', value: 'GH' },
  { label: 'Greece', value: 'GR' },
  { label: 'Grenada', value: 'GD' },
  { label: 'Guatemala', value: 'GT' },
  { label: 'Guinea', value: 'GN' },
  { label: 'Guinea-Bissau', value: 'GW' },
  { label: 'Guyana', value: 'GY' },
  { label: 'Haiti', value: 'HT' },
  { label: 'Honduras', value: 'HN' },
  { label: 'Hungary', value: 'HU' },
  { label: 'Iceland', value: 'IS' },
  { label: 'India', value: 'IN' },
  { label: 'Indonesia', value: 'ID' },
  { label: 'Iran', value: 'IR' },
  { label: 'Iraq', value: 'IQ' },
  { label: 'Ireland', value: 'IE' },
  { label: 'Israel', value: 'IL' },
  { label: 'Italy', value: 'IT' },
  { label: 'Ivory Coast', value: 'CI' },
  { label: 'Jamaica', value: 'JM' },
  { label: 'Japan', value: 'JP' },
  { label: 'Jordan', value: 'JO' },
  { label: 'Kazakhstan', value: 'KZ' },
  { label: 'Kenya', value: 'KE' },
  { label: 'Kiribati', value: 'KI' },
  { label: 'Kosovo', value: 'XK' },
  { label: 'Kuwait', value: 'KW' },
  { label: 'Kyrgyzstan', value: 'KG' },
  { label: 'Laos', value: 'LA' },
  { label: 'Latvia', value: 'LV' },
  { label: 'Lebanon', value: 'LB' },
  { label: 'Lesotho', value: 'LS' },
  { label: 'Liberia', value: 'LR' },
  { label: 'Libya', value: 'LY' },
  { label: 'Liechtenstein', value: 'LI' },
  { label: 'Lithuania', value: 'LT' },
  { label: 'Luxembourg', value: 'LU' },
  { label: 'Madagascar', value: 'MG' },
  { label: 'Malawi', value: 'MW' },
  { label: 'Malaysia', value: 'MY' },
  { label: 'Maldives', value: 'MV' },
  { label: 'Mali', value: 'ML' },
  { label: 'Malta', value: 'MT' },
  { label: 'Marshall Islands', value: 'MH' },
  { label: 'Mauritania', value: 'MR' },
  { label: 'Mauritius', value: 'MU' },
  { label: 'Mexico', value: 'MX' },
  { label: 'Micronesia', value: 'FM' },
  { label: 'Moldova', value: 'MD' },
  { label: 'Monaco', value: 'MC' },
  { label: 'Mongolia', value: 'MN' },
  { label: 'Montenegro', value: 'ME' },
  { label: 'Morocco', value: 'MA' },
  { label: 'Mozambique', value: 'MZ' },
  { label: 'Myanmar', value: 'MM' },
  { label: 'Namibia', value: 'NA' },
  { label: 'Nauru', value: 'NR' },
  { label: 'Nepal', value: 'NP' },
  { label: 'Netherlands', value: 'NL' },
  { label: 'New Zealand', value: 'NZ' },
  { label: 'Nicaragua', value: 'NI' },
  { label: 'Niger', value: 'NE' },
  { label: 'Nigeria', value: 'NG' },
  { label: 'North Korea', value: 'KP' },
  { label: 'North Macedonia', value: 'MK' },
  { label: 'Norway', value: 'NO' },
  { label: 'Oman', value: 'OM' },
  { label: 'Pakistan', value: 'PK' },
  { label: 'Palau', value: 'PW' },
  { label: 'Palestine', value: 'PS' },
  { label: 'Panama', value: 'PA' },
  { label: 'Papua New Guinea', value: 'PG' },
  { label: 'Paraguay', value: 'PY' },
  { label: 'Peru', value: 'PE' },
  { label: 'Philippines', value: 'PH' },
  { label: 'Poland', value: 'PL' },
  { label: 'Portugal', value: 'PT' },
  { label: 'Qatar', value: 'QA' },
  { label: 'Romania', value: 'RO' },
  { label: 'Russia', value: 'RU' },
  { label: 'Rwanda', value: 'RW' },
  { label: 'Saint Kitts and Nevis', value: 'KN' },
  { label: 'Saint Lucia', value: 'LC' },
  { label: 'Saint Vincent and the Grenadines', value: 'VC' },
  { label: 'Samoa', value: 'WS' },
  { label: 'San Marino', value: 'SM' },
  { label: 'Sao Tome and Principe', value: 'ST' },
  { label: 'Saudi Arabia', value: 'SA' },
  { label: 'Senegal', value: 'SN' },
  { label: 'Serbia', value: 'RS' },
  { label: 'Seychelles', value: 'SC' },
  { label: 'Sierra Leone', value: 'SL' },
  { label: 'Singapore', value: 'SG' },
  { label: 'Slovakia', value: 'SK' },
  { label: 'Slovenia', value: 'SI' },
  { label: 'Solomon Islands', value: 'SB' },
  { label: 'Somalia', value: 'SO' },
  { label: 'South Africa', value: 'ZA' },
  { label: 'South Korea', value: 'KR' },
  { label: 'South Sudan', value: 'SS' },
  { label: 'Spain', value: 'ES' },
  { label: 'Sri Lanka', value: 'LK' },
  { label: 'Sudan', value: 'SD' },
  { label: 'Suriname', value: 'SR' },
  { label: 'Sweden', value: 'SE' },
  { label: 'Switzerland', value: 'CH' },
  { label: 'Syria', value: 'SY' },
  { label: 'Taiwan', value: 'TW' },
  { label: 'Tajikistan', value: 'TJ' },
  { label: 'Tanzania', value: 'TZ' },
  { label: 'Thailand', value: 'TH' },
  { label: 'Timor-Leste', value: 'TL' },
  { label: 'Togo', value: 'TG' },
  { label: 'Tonga', value: 'TO' },
  { label: 'Trinidad and Tobago', value: 'TT' },
  { label: 'Tunisia', value: 'TN' },
  { label: 'Turkey', value: 'TR' },
  { label: 'Turkmenistan', value: 'TM' },
  { label: 'Tuvalu', value: 'TV' },
  { label: 'Uganda', value: 'UG' },
  { label: 'Ukraine', value: 'UA' },
  { label: 'United Arab Emirates', value: 'AE' },
  { label: 'United Kingdom', value: 'GB' },
  { label: 'Uruguay', value: 'UY' },
  { label: 'Uzbekistan', value: 'UZ' },
  { label: 'Vanuatu', value: 'VU' },
  { label: 'Vatican City', value: 'VA' },
  { label: 'Venezuela', value: 'VE' },
  { label: 'Vietnam', value: 'VN' },
  { label: 'Yemen', value: 'YE' },
  { label: 'Zambia', value: 'ZM' },
  { label: 'Zimbabwe', value: 'ZW' }
]

const formDisabled = computed(() => !dncVerified.value)

const uploadCategoryFiles = async (
  files: File[],
  category: IntakeDocCategory,
  sid: string
): Promise<string | null> => {
  if (files.length === 0) return null

  for (const file of files) {
    const ts        = Date.now()
    const sanitized = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const filePath  = `${sid}/${category}/${ts}_${sanitized}`

    const { error } = await supabase.storage
      .from('lead-documents')
      .upload(filePath, file, { cacheControl: '3600', upsert: false })

    if (error) throw new Error(`Upload failed for "${file.name}": ${error.message}`)
  }

  return `${sid}/${category}`
}

const validate = (): string | null => {
  if (!dncVerified.value) return 'Please verify the phone number via DNC check first.'
  if (!form.first_name.trim()) return 'Customer first name is required.'
  if (!form.last_name.trim()) return 'Customer last name is required.'
  if (form.accident_last_12_months === null) return 'Please answer: Accident within last 12 months?'
  if (!form.accident_date) return 'Date of accident is required.'
  if (form.prior_attorney_involved === null) return 'Please answer: Any prior attorney involved?'
  if (form.other_party_admit_fault === null) return 'Please answer: Did the other party admit fault?'
  if (form.received_medical_treatment === null) return 'Please answer: Medical attention within 2 weeks?'
  if (form.police_attended === null) return 'Please answer: Did police attend the accident?'
  if (form.insured === null) return 'Please answer: Is the customer insured?'
  if (!form.vehicle_registration.trim()) return 'Customer vehicle registration is required.'
  if (!form.insurance_company.trim()) return 'Customer insurance company is required.'
  if (!form.third_party_vehicle_registration.trim()) return 'Third party vehicle registration is required.'
  if (!form.injuries.trim()) return 'Customer injuries / areas affected is required.'
  if (!form.accident_scenario.trim()) return 'Accident scenario is required.'
  return null
}

const submitting = ref(false)

const onSubmit = async () => {
  const validationError = validate()
  if (validationError) {
    toast.add({ title: 'Validation Error', description: validationError, icon: 'i-lucide-alert-circle', color: 'error' })
    return
  }

  submitting.value = true

  try {
    const sid = submissionId.value

    const [medicalProofUrl, insuranceDocUrl, policeReportUrl] = await Promise.all([
      uploadCategoryFiles(docFiles.value.medical_report,     'medical_report',     sid),
      uploadCategoryFiles(docFiles.value.insurance_document, 'insurance_document', sid),
      uploadCategoryFiles(docFiles.value.police_report,      'police_report',      sid)
    ])

    const accidentLocation = [
      form.acc_street,
      form.acc_street2,
      form.acc_city,
      form.acc_state,
      form.acc_zip
    ].filter(v => v.trim()).join(', ') || null

    let additionalNotes = form.additional_notes.trim() || null
    if (form.police_report_ref.trim()) {
      additionalNotes = `Police Report #: ${form.police_report_ref.trim()}${additionalNotes ? '\n\n' + additionalNotes : ''}`
    }

    const payload = {
      submission_id: sid,
      customer_full_name: `${form.first_name.trim()} ${form.last_name.trim()}`,
      phone_number: dncRawPhone.value.replace(/\D/g, ''),
      email: form.email.trim() || null,
      date_of_birth: form.date_of_birth || null,
      street_address: form.street_address.trim() || null,
      city: form.city.trim() || null,
      state: form.state || null,
      zip_code: form.zip_code.trim() || null,
      accident_last_12_months: form.accident_last_12_months,
      accident_date: form.accident_date || null,
      prior_attorney_involved: form.prior_attorney_involved ?? false,
      prior_attorney_details: form.prior_attorney_details.trim() || null,
      other_party_admit_fault: form.other_party_admit_fault ?? false,
      police_attended: form.police_attended ?? false,
      accident_location: accidentLocation,
      accident_scenario: form.accident_scenario.trim() || null,
      received_medical_treatment: form.received_medical_treatment ?? false,
      medical_attention: form.medical_attention.trim() || null,
      is_injured: form.injuries.trim() ? true : false,
      injuries: form.injuries.trim() || null,
      insured: form.insured ?? false,
      vehicle_registration: form.vehicle_registration.trim() || null,
      insurance_company: form.insurance_company.trim() || null,
      third_party_vehicle_registration: form.third_party_vehicle_registration.trim() || null,
      passengers_count: form.passengers_count === '' ? null : Number(form.passengers_count),
      source_url: form.source_url.trim() || null,
      trustedform_cert_url: form.trustedform_cert_url.trim() || null,
      ip_address: form.ip_address.trim() || null,
      medical_treatment_proof: medicalProofUrl,
      insurance_documents: insuranceDocUrl,
      police_report: policeReportUrl,
      additional_notes: additionalNotes,
      user_id: auth.state.value.user?.id ?? null,
      lead_vendor: auth.state.value.centerContext?.lead_vendor ?? null,
      status: 'transfer_api'
    }

    const { error } = await supabase.from('leads').insert(payload)
    if (error) throw new Error(error.message)

    const edgeBase = String(import.meta.env.VITE_SUPABASE_FUNCTIONS_BASE ?? '').replace(/\/$/, '')
    const slackUrl = `${edgeBase}/functions/v1/lead-intake-notification`

    fetch(slackUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY as string
      },
      body: JSON.stringify({
        submissionId: sid,
        customerName: payload.customer_full_name,
        customerState: payload.state ?? 'N/A',
        leadVendor: payload.lead_vendor,
        centerName: auth.state.value.centerContext?.center_name ?? 'N/A',
        submissionDate: new Date().toISOString()
      })
    }).catch(err => console.warn('[lead-intake] Slack notification failed silently:', err))

    toast.add({
      title: 'Lead Submitted',
      description: `Lead ${sid} has been successfully saved.`,
      icon: 'i-lucide-check',
      color: 'success'
    })

    await router.push('/transfers')
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to submit lead. Please try again.'
    toast.add({ title: 'Submission Error', description: msg, icon: 'i-lucide-x', color: 'error' })
  } finally {
    submitting.value = false
  }
}

onMounted(async () => {
  await auth.init()
})
</script>

<template>
  <UDashboardPanel id="lead-intake">
    <template #header>
      <UDashboardNavbar title="Lead Intake">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto max-w-4xl space-y-5 pb-8">

        <!-- ═══ Row 1 · DNC Verification ═══════════════════════════════════ -->
        <div class="ap-fade-in ap-delay-1 relative overflow-hidden rounded-xl border border-amber-500/25 bg-white/90 shadow-lg backdrop-blur-sm transition-shadow duration-300 hover:shadow-xl dark:bg-[#1a1a1a]/60">
            <div class="pointer-events-none absolute inset-0 bg-gradient-to-br from-amber-500/[0.04] via-transparent to-transparent" />
            <div class="relative border-b border-black/[0.06] dark:border-white/[0.06]">
              <div class="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-amber-500/[0.08] to-transparent" />
              <div class="absolute inset-x-0 bottom-0 h-[2px] bg-gradient-to-r from-amber-500 via-amber-500/60 to-transparent" />
              <div class="relative flex items-center justify-between gap-3 px-5 py-3.5">
                <div class="flex items-center gap-3">
                  <div class="flex h-7 w-7 items-center justify-center rounded-lg border-[0.5px] border-amber-500/45 bg-amber-500/10">
                    <UIcon name="i-lucide-phone" class="text-xs text-amber-500" />
                  </div>
                  <span class="text-[13px] font-semibold text-highlighted">DNC Verification</span>
                  <UBadge label="Required first" color="error" variant="soft" size="sm" />
                </div>
                <UBadge
                  :label="submissionId ? `ID: ${submissionId}` : 'Verify number to generate ID'"
                  :color="submissionId ? 'neutral' : 'warning'"
                  variant="soft"
                  class="hidden font-mono text-xs sm:flex"
                />
              </div>
            </div>
            <div class="relative space-y-4 p-5">
              <p class="text-sm text-muted">Enter the customer's phone number and verify it against the Do Not Call registry before proceeding.</p>
              <div class="flex flex-wrap items-end gap-3">
                <div class="min-w-60 flex-1 space-y-1.5">
                  <label class="text-xs font-medium text-highlighted">Customer Phone Number</label>
                  <UInput v-model="dncRawPhone" placeholder="(000) 000-0000" :disabled="dncVerified" class="w-full" @keyup.enter="verifyDNC" />
                </div>
                <UButton :label="dncVerified ? 'Verified' : 'Verify Number'" :icon="dncVerified ? 'i-lucide-check' : 'i-lucide-shield-check'" :color="dncVerified ? 'success' : 'warning'" :loading="dncChecking" :disabled="dncVerified || dncChecking || !dncRawPhone" @click="verifyDNC" />
              </div>
              <div v-if="dncStatus === 'clean'" class="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 dark:border-green-800 dark:bg-green-950">
                <UIcon name="i-lucide-check-circle" class="size-5 shrink-0 text-green-600 dark:text-green-400" />
                <p class="text-sm font-medium text-green-700 dark:text-green-300">Phone number verified — not on the DNC registry. You may now complete the intake form.</p>
              </div>
              <div v-if="dncStatus === 'blocked'" class="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 dark:border-red-800 dark:bg-red-950">
                <UIcon name="i-lucide-ban" class="size-5 shrink-0 text-red-600 dark:text-red-400" />
                <p class="text-sm font-medium text-red-700 dark:text-red-300">This number is on the Do Not Call registry. This lead cannot be submitted.</p>
              </div>
            </div>
          </div>

        <!-- ═══ Locked form area ═════════════════════════════════════════ -->
        <div :class="formDisabled ? 'pointer-events-none select-none opacity-40' : ''" class="space-y-5 transition-opacity duration-300">

          <!-- ═══ Customer Personal Information ═══════════════════════════ -->
            <div class="ap-fade-in ap-delay-2 relative flex flex-col overflow-hidden rounded-xl border border-[var(--ap-accent)]/25 bg-white/90 shadow-lg backdrop-blur-sm transition-shadow duration-300 hover:shadow-xl dark:bg-[#1a1a1a]/60">
              <div class="pointer-events-none absolute inset-0 bg-gradient-to-br from-[var(--ap-accent)]/[0.04] via-transparent to-transparent" />
              <div class="relative border-b border-black/[0.06] dark:border-white/[0.06]">
                <div class="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[var(--ap-accent)]/[0.08] to-transparent" />
                <div class="absolute inset-x-0 bottom-0 h-[2px] bg-gradient-to-r from-[var(--ap-accent)] via-[var(--ap-accent)]/60 to-transparent" />
                <div class="relative flex items-center gap-3 px-5 py-3.5">
                  <div class="flex h-7 w-7 items-center justify-center rounded-lg border-[0.5px] border-[var(--ap-accent)]/45 bg-[var(--ap-accent)]/10">
                    <UIcon name="i-lucide-user" class="text-xs text-[var(--ap-accent)]" />
                  </div>
                  <span class="text-[13px] font-semibold text-highlighted">Customer Personal Information</span>
                </div>
              </div>
              <div class="relative flex-1 p-5">
                <!-- Personal Details -->
                <div class="space-y-4">
                  <div class="grid grid-cols-2 gap-3">
                    <div class="space-y-2">
                      <label class="text-xs font-medium text-highlighted">First Name <span class="text-red-400/80">*</span></label>
                      <UInput v-model="form.first_name" placeholder="Enter first name" class="w-full" />
                    </div>
                    <div class="space-y-2">
                      <label class="text-xs font-medium text-highlighted">Last Name <span class="text-red-400/80">*</span></label>
                      <UInput v-model="form.last_name" placeholder="Enter last name" class="w-full" />
                    </div>
                  </div>
                  <div class="grid grid-cols-2 gap-3">
                    <div class="space-y-2">
                      <label class="text-xs font-medium text-highlighted">Date of Birth <span class="text-red-400/80">*</span></label>
                      <UInput v-model="form.date_of_birth" type="date" class="w-full" />
                    </div>
                    <div class="space-y-2">
                      <label class="text-xs font-medium text-highlighted">Email <span class="text-red-400/80">*</span></label>
                      <UInput v-model="form.email" type="email" placeholder="myname@example.com" class="w-full" />
                      <p class="text-[11px] text-muted">If no email, create one for the customer.</p>
                    </div>
                  </div>
                </div>

                <div class="mt-1 space-y-4">
                    <div class="space-y-2">
                      <label class="text-xs font-medium text-highlighted">Street Address <span class="text-red-400/80">*</span></label>
                      <UInput v-model="form.street_address" placeholder="Enter street address" class="w-full" />
                    </div>
                    <div class="space-y-2">
                      <label class="text-xs font-medium text-highlighted">Street Address Line 2</label>
                      <UInput v-model="form.street_address_2" placeholder="Apt, Suite, Unit, etc." class="w-full" />
                    </div>
                    <div class="grid grid-cols-3 items-end gap-3">
                      <div class="space-y-2">
                        <label class="text-xs font-medium text-highlighted">City <span class="text-red-400/80">*</span></label>
                        <UInput v-model="form.city" placeholder="City" class="w-full" />
                      </div>
                      <div class="space-y-2">
                        <label class="text-xs font-medium text-highlighted">State <span class="text-red-400/80">*</span></label>
                        <USelect v-model="form.state" :items="usStates" placeholder="State" value-key="value" class="w-full" />
                      </div>
                      <div class="space-y-2">
                        <label class="text-xs font-medium text-highlighted">Zip <span class="text-red-400/80">*</span></label>
                        <UInput v-model="form.zip_code" placeholder="Zip Code" class="w-full" />
                      </div>
                    </div>
                  </div>
              </div>
            </div>

          <!-- ═══ Accident Information ═════════════════════════════════ -->
            <div class="ap-fade-in ap-delay-2 relative flex flex-col overflow-hidden rounded-xl border border-[var(--ap-accent)]/25 bg-white/90 shadow-lg backdrop-blur-sm transition-shadow duration-300 hover:shadow-xl dark:bg-[#1a1a1a]/60">
              <div class="pointer-events-none absolute inset-0 bg-gradient-to-br from-[var(--ap-accent)]/[0.04] via-transparent to-transparent" />
              <div class="relative border-b border-black/[0.06] dark:border-white/[0.06]">
                <div class="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[var(--ap-accent)]/[0.08] to-transparent" />
                <div class="absolute inset-x-0 bottom-0 h-[2px] bg-gradient-to-r from-[var(--ap-accent)] via-[var(--ap-accent)]/60 to-transparent" />
                <div class="relative flex items-center gap-3 px-5 py-3.5">
                  <div class="flex h-7 w-7 items-center justify-center rounded-lg border-[0.5px] border-[var(--ap-accent)]/45 bg-[var(--ap-accent)]/10">
                    <UIcon name="i-lucide-alert-triangle" class="text-xs text-[var(--ap-accent)]" />
                  </div>
                  <span class="text-[13px] font-semibold text-highlighted">Accident Information</span>
                </div>
              </div>
              <div class="relative flex-1 space-y-3.5 p-5">
                <!-- Row 1: Accident 12mo + Other Party Fault + Date of Accident -->
                <div class="grid grid-cols-3 gap-3">
                  <div class="space-y-1.5">
                    <p class="text-xs font-medium text-highlighted">Accident within 12 months? <span class="text-red-400/80">*</span></p>
                    <div class="flex w-fit overflow-hidden rounded-lg border border-[var(--ap-accent)]/20">
                      <button type="button" class="border-r border-[var(--ap-accent)]/20 px-4 py-1.5 text-xs font-medium transition-colors" :class="form.accident_last_12_months === true ? 'bg-[var(--ap-accent)] text-white' : 'text-muted hover:bg-[var(--ap-accent)]/5'" @click="form.accident_last_12_months = true">Yes</button>
                      <button type="button" class="px-4 py-1.5 text-xs font-medium transition-colors" :class="form.accident_last_12_months === false ? 'bg-error-600 text-white' : 'text-muted hover:bg-[var(--ap-accent)]/5'" @click="form.accident_last_12_months = false">No</button>
                    </div>
                  </div>
                  <div class="space-y-1.5">
                    <p class="text-xs font-medium text-highlighted">Other Party Fault? <span class="text-red-400/80">*</span></p>
                    <div class="flex w-fit overflow-hidden rounded-lg border border-[var(--ap-accent)]/20">
                      <button type="button" class="border-r border-[var(--ap-accent)]/20 px-4 py-1.5 text-xs font-medium transition-colors" :class="form.other_party_admit_fault === true ? 'bg-[var(--ap-accent)] text-white' : 'text-muted hover:bg-[var(--ap-accent)]/5'" @click="form.other_party_admit_fault = true">Yes</button>
                      <button type="button" class="px-4 py-1.5 text-xs font-medium transition-colors" :class="form.other_party_admit_fault === false ? 'bg-error-600 text-white' : 'text-muted hover:bg-[var(--ap-accent)]/5'" @click="form.other_party_admit_fault = false">No</button>
                    </div>
                  </div>
                  <div class="space-y-1.5">
                    <label class="text-xs font-medium text-highlighted">Date of Accident <span class="text-red-400/80">*</span></label>
                    <UInput v-model="form.accident_date" type="date" class="w-full" />
                  </div>
                </div>

                <!-- Row 2: Prior Attorney + Police Attend -->
                <div class="grid grid-cols-3 gap-3">
                  <div class="space-y-1.5">
                    <p class="text-xs font-medium text-highlighted">Prior Attorney? <span class="text-red-400/80">*</span></p>
                    <div class="flex w-fit overflow-hidden rounded-lg border border-[var(--ap-accent)]/20">
                      <button type="button" class="border-r border-[var(--ap-accent)]/20 px-4 py-1.5 text-xs font-medium transition-colors" :class="form.prior_attorney_involved === true ? 'bg-[var(--ap-accent)] text-white' : 'text-muted hover:bg-[var(--ap-accent)]/5'" @click="form.prior_attorney_involved = true">Yes</button>
                      <button type="button" class="px-4 py-1.5 text-xs font-medium transition-colors" :class="form.prior_attorney_involved === false ? 'bg-error-600 text-white' : 'text-muted hover:bg-[var(--ap-accent)]/5'" @click="form.prior_attorney_involved = false">No</button>
                    </div>
                  </div>
                  <div class="space-y-1.5">
                    <p class="text-xs font-medium text-highlighted">Police Attend? <span class="text-red-400/80">*</span></p>
                    <div class="flex w-fit overflow-hidden rounded-lg border border-[var(--ap-accent)]/20">
                      <button type="button" class="border-r border-[var(--ap-accent)]/20 px-4 py-1.5 text-xs font-medium transition-colors" :class="form.police_attended === true ? 'bg-[var(--ap-accent)] text-white' : 'text-muted hover:bg-[var(--ap-accent)]/5'" @click="form.police_attended = true">Yes</button>
                      <button type="button" class="px-4 py-1.5 text-xs font-medium transition-colors" :class="form.police_attended === false ? 'bg-error-600 text-white' : 'text-muted hover:bg-[var(--ap-accent)]/5'" @click="form.police_attended = false">No</button>
                    </div>
                  </div>
                  <div />
                </div>

                <!-- Conditional: Prior attorney details -->
                <div v-if="form.prior_attorney_involved === true" class="space-y-1.5">
                  <label class="text-xs font-medium text-highlighted">Prior Attorney Details <span class="text-red-400/80">*</span></label>
                  <UInput v-model="form.prior_attorney_details" placeholder="Name of attorney previously involved" class="w-full" />
                </div>

                <!-- Conditional: Police report ref -->
                <div v-if="form.police_attended === true" class="space-y-1.5">
                  <label class="text-xs font-medium text-highlighted">Police Report Ref.</label>
                  <UInput v-model="form.police_report_ref" placeholder="e.g. RPT-2024-001234" class="w-full" />
                </div>

                <!-- Accident location -->
                <div class="space-y-1.5">
                  <label class="text-xs font-medium text-highlighted">Location of the Accident</label>
                  <div class="grid grid-cols-2 gap-3">
                    <UInput v-model="form.acc_street" placeholder="Street Address" class="w-full" />
                    <UInput v-model="form.acc_street2" placeholder="Street Address Line 2" class="w-full" />
                  </div>
                  <div class="mt-1.5 grid grid-cols-3 gap-3">
                    <UInput v-model="form.acc_city" placeholder="City" />
                    <USelect v-model="form.acc_state" :items="usStates" placeholder="State" value-key="value" />
                    <UInput v-model="form.acc_zip" placeholder="Zip Code" />
                  </div>
                  <div class="mt-1.5 grid grid-cols-2 gap-3">
                    <div class="space-y-1.5">
                      <label class="text-xs font-medium text-highlighted">Country</label>
                      <USelect v-model="form.acc_country" :items="countries" placeholder="Select Country" value-key="value" class="w-full" />
                    </div>
                    <div class="space-y-1.5">
                      <label class="text-xs font-medium text-highlighted">Customer State</label>
                      <USelect v-model="form.customer_state" :items="usStates" placeholder="Select State" value-key="value" class="w-full" />
                    </div>
                  </div>
                </div>

                <!-- Accident scenario -->
                <div class="space-y-1.5">
                  <label class="text-xs font-medium text-highlighted">Accident Scenario <span class="text-red-400/80">*</span></label>
                  <UTextarea v-model="form.accident_scenario" placeholder="Briefly describe how the accident occurred..." :rows="3" class="w-full" />
                </div>
              </div>
            </div>

          <!-- ═══ Medical Information ═══════════════════════════════════ -->
            <div class="ap-fade-in ap-delay-3 relative flex flex-col overflow-hidden rounded-xl border border-[var(--ap-accent)]/25 bg-white/90 shadow-lg backdrop-blur-sm transition-shadow duration-300 hover:shadow-xl dark:bg-[#1a1a1a]/60">
              <div class="pointer-events-none absolute inset-0 bg-gradient-to-br from-[var(--ap-accent)]/[0.04] via-transparent to-transparent" />
              <div class="relative border-b border-black/[0.06] dark:border-white/[0.06]">
                <div class="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[var(--ap-accent)]/[0.08] to-transparent" />
                <div class="absolute inset-x-0 bottom-0 h-[2px] bg-gradient-to-r from-[var(--ap-accent)] via-[var(--ap-accent)]/60 to-transparent" />
                <div class="relative flex items-center gap-3 px-5 py-3.5">
                  <div class="flex h-7 w-7 items-center justify-center rounded-lg border-[0.5px] border-[var(--ap-accent)]/45 bg-[var(--ap-accent)]/10">
                    <UIcon name="i-lucide-heart-pulse" class="text-xs text-[var(--ap-accent)]" />
                  </div>
                  <span class="text-[13px] font-semibold text-highlighted">Medical Information</span>
                </div>
              </div>
              <div class="relative flex-1 space-y-4 p-5">
                <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p class="text-xs font-medium text-highlighted">Medical Attention Within 2 Weeks? <span class="text-red-400/80">*</span></p>
                  <div class="flex w-fit shrink-0 overflow-hidden rounded-lg border border-[var(--ap-accent)]/20">
                    <button type="button" class="border-r border-[var(--ap-accent)]/20 px-5 py-2 text-sm font-medium transition-colors" :class="form.received_medical_treatment === true ? 'bg-[var(--ap-accent)] text-white' : 'text-muted hover:bg-[var(--ap-accent)]/5'" @click="form.received_medical_treatment = true">Yes</button>
                    <button type="button" class="px-5 py-2 text-sm font-medium transition-colors" :class="form.received_medical_treatment === false ? 'bg-error-600 text-white' : 'text-muted hover:bg-[var(--ap-accent)]/5'" @click="form.received_medical_treatment = false">No</button>
                  </div>
                </div>
                <div v-if="form.received_medical_treatment === true" class="space-y-1.5">
                  <label class="text-xs font-medium text-highlighted">Hospitals / Care Received <span class="text-red-400/80">*</span></label>
                  <UTextarea v-model="form.medical_attention" placeholder="List hospitals, clinics, and care received after the accident." :rows="4" class="w-full" />
                </div>
                <div class="space-y-1.5">
                  <label class="text-xs font-medium text-highlighted">Customer Injuries / Areas Affected <span class="text-red-400/80">*</span></label>
                  <UTextarea v-model="form.injuries" placeholder="Describe injuries and which parts of the body were affected." :rows="4" class="w-full" />
                </div>
              </div>
            </div>

            <!-- Insurance & Vehicle Information -->
            <div class="ap-fade-in ap-delay-3 relative flex flex-col overflow-hidden rounded-xl border border-[var(--ap-accent)]/25 bg-white/90 shadow-lg backdrop-blur-sm transition-shadow duration-300 hover:shadow-xl dark:bg-[#1a1a1a]/60">
              <div class="pointer-events-none absolute inset-0 bg-gradient-to-br from-[var(--ap-accent)]/[0.04] via-transparent to-transparent" />
              <div class="relative border-b border-black/[0.06] dark:border-white/[0.06]">
                <div class="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[var(--ap-accent)]/[0.08] to-transparent" />
                <div class="absolute inset-x-0 bottom-0 h-[2px] bg-gradient-to-r from-[var(--ap-accent)] via-[var(--ap-accent)]/60 to-transparent" />
                <div class="relative flex items-center gap-3 px-5 py-3.5">
                  <div class="flex h-7 w-7 items-center justify-center rounded-lg border-[0.5px] border-[var(--ap-accent)]/45 bg-[var(--ap-accent)]/10">
                    <UIcon name="i-lucide-car" class="text-xs text-[var(--ap-accent)]" />
                  </div>
                  <span class="text-[13px] font-semibold text-highlighted">Insurance & Vehicle</span>
                </div>
              </div>
              <div class="relative flex-1 space-y-4 p-5">
                <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p class="text-xs font-medium text-highlighted">Is Customer Insured? <span class="text-red-400/80">*</span></p>
                  <div class="flex w-fit shrink-0 overflow-hidden rounded-lg border border-[var(--ap-accent)]/20">
                    <button type="button" class="border-r border-[var(--ap-accent)]/20 px-5 py-2 text-sm font-medium transition-colors" :class="form.insured === true ? 'bg-[var(--ap-accent)] text-white' : 'text-muted hover:bg-[var(--ap-accent)]/5'" @click="form.insured = true">Yes</button>
                    <button type="button" class="px-5 py-2 text-sm font-medium transition-colors" :class="form.insured === false ? 'bg-error-600 text-white' : 'text-muted hover:bg-[var(--ap-accent)]/5'" @click="form.insured = false">No</button>
                  </div>
                </div>
                <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div class="space-y-1.5">
                    <label class="text-xs font-medium text-highlighted">Vehicle Registration <span class="text-red-400/80">*</span></label>
                    <UInput v-model="form.vehicle_registration" placeholder="License plate number" class="w-full" />
                  </div>
                  <div class="space-y-1.5">
                    <label class="text-xs font-medium text-highlighted">Insurance Company <span class="text-red-400/80">*</span></label>
                    <UInput v-model="form.insurance_company" placeholder="Insurance company name" class="w-full" />
                  </div>
                </div>
                <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div class="space-y-1.5">
                    <label class="text-xs font-medium text-highlighted">Third Party Vehicle Reg. <span class="text-red-400/80">*</span></label>
                    <UInput v-model="form.third_party_vehicle_registration" placeholder="Other party's plate" class="w-full" />
                  </div>
                  <div class="space-y-1.5">
                    <label class="text-xs font-medium text-highlighted">Passengers in Vehicle</label>
                    <UInput v-model.number="form.passengers_count" type="number" placeholder="e.g. 2" min="0" class="w-full" />
                  </div>
                </div>
              </div>
            </div>

            <!-- Lead Tracking -->
            <div class="ap-fade-in ap-delay-3 relative flex flex-col overflow-hidden rounded-xl border border-[var(--ap-accent)]/25 bg-white/90 shadow-lg backdrop-blur-sm transition-shadow duration-300 hover:shadow-xl dark:bg-[#1a1a1a]/60">
              <div class="pointer-events-none absolute inset-0 bg-gradient-to-br from-[var(--ap-accent)]/[0.04] via-transparent to-transparent" />
              <div class="relative border-b border-black/[0.06] dark:border-white/[0.06]">
                <div class="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[var(--ap-accent)]/[0.08] to-transparent" />
                <div class="absolute inset-x-0 bottom-0 h-[2px] bg-gradient-to-r from-[var(--ap-accent)] via-[var(--ap-accent)]/60 to-transparent" />
                <div class="relative flex items-center gap-3 px-5 py-3.5">
                  <div class="flex h-7 w-7 items-center justify-center rounded-lg border-[0.5px] border-[var(--ap-accent)]/45 bg-[var(--ap-accent)]/10">
                    <UIcon name="i-lucide-link" class="text-xs text-[var(--ap-accent)]" />
                  </div>
                  <span class="text-[13px] font-semibold text-highlighted">Lead Tracking</span>
                </div>
              </div>
              <div class="relative flex-1 space-y-4 p-5">
                <div class="space-y-1.5">
                  <label class="text-xs font-medium text-highlighted">Source URL <span class="text-red-400/80">*</span></label>
                  <UInput v-model="form.source_url" placeholder="Landing page URL" class="w-full" />
                </div>
                <div class="space-y-1.5">
                  <label class="text-xs font-medium text-highlighted">TrustedForm Cert URL <span class="text-red-400/80">*</span></label>
                  <UInput v-model="form.trustedform_cert_url" placeholder="TrustedForm certificate URL" class="w-full" />
                </div>
                <div class="space-y-1.5">
                  <label class="text-xs font-medium text-highlighted">IP Address <span class="text-red-400/80">*</span></label>
                  <UInput v-model="form.ip_address" placeholder="IP address of the user" class="w-full" />
                </div>
              </div>
            </div>

          <!-- ═══ Supporting Documents ══════════════════════════════════ -->
          <div class="ap-fade-in ap-delay-4 relative overflow-hidden rounded-xl border border-[var(--ap-accent)]/25 bg-white/90 shadow-lg backdrop-blur-sm transition-shadow duration-300 hover:shadow-xl dark:bg-[#1a1a1a]/60">
            <div class="pointer-events-none absolute inset-0 bg-gradient-to-br from-[var(--ap-accent)]/[0.04] via-transparent to-transparent" />
            <div class="relative border-b border-black/[0.06] dark:border-white/[0.06]">
              <div class="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[var(--ap-accent)]/[0.08] to-transparent" />
              <div class="absolute inset-x-0 bottom-0 h-[2px] bg-gradient-to-r from-[var(--ap-accent)] via-[var(--ap-accent)]/60 to-transparent" />
              <div class="relative flex items-center gap-3 px-5 py-3.5">
                <div class="flex h-7 w-7 items-center justify-center rounded-lg border-[0.5px] border-[var(--ap-accent)]/45 bg-[var(--ap-accent)]/10">
                  <UIcon name="i-lucide-file-up" class="text-xs text-[var(--ap-accent)]" />
                </div>
                <span class="text-[13px] font-semibold text-highlighted">Supporting Documents</span>
              </div>
            </div>
            <div class="relative p-5">
              <div class="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <div
                  v-for="cat in INTAKE_DOC_CATEGORIES"
                  :key="cat.key"
                  class="relative overflow-hidden rounded-xl border border-[var(--ap-accent)]/20"
                >
                  <div class="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[var(--ap-accent)]/[0.08] to-transparent" />
                  <div class="relative flex items-center justify-between gap-2 border-b border-[var(--ap-accent)]/10 px-4 py-2.5">
                    <div class="flex items-center gap-2">
                      <UIcon
                        :name="cat.key === 'medical_report' ? 'i-lucide-stethoscope' : cat.key === 'insurance_document' ? 'i-lucide-shield' : 'i-lucide-file-badge'"
                        class="text-xs text-[var(--ap-accent)]"
                      />
                      <span class="text-xs font-semibold text-highlighted">{{ cat.label }}</span>
                    </div>
                    <span v-if="docFiles[cat.key].length > 0" class="text-[11px] tabular-nums text-muted">{{ docFiles[cat.key].length }} staged</span>
                  </div>
                  <div class="space-y-3 p-4">
                    <p class="text-[11px] text-muted">{{ cat.description }}</p>

                    <div class="flex items-center justify-between">
                      <p class="text-xs font-medium text-highlighted">Has {{ cat.label }}? <span class="text-red-400/80">*</span></p>
                      <div class="flex w-fit shrink-0 overflow-hidden rounded-lg border border-[var(--ap-accent)]/20">
                        <button type="button" class="border-r border-[var(--ap-accent)]/20 px-4 py-1.5 text-xs font-medium transition-colors" :class="form[cat.formKey] === true ? 'bg-[var(--ap-accent)] text-white' : 'text-muted hover:bg-[var(--ap-accent)]/5'" @click="form[cat.formKey] = true">Yes</button>
                        <button type="button" class="px-4 py-1.5 text-xs font-medium transition-colors" :class="form[cat.formKey] === false ? 'bg-error-600 text-white' : 'text-muted hover:bg-[var(--ap-accent)]/5'" @click="form[cat.formKey] = false; docFiles[cat.key] = []">No</button>
                      </div>
                    </div>

                    <div v-if="form[cat.formKey] === true" class="space-y-2">
                      <div class="cursor-pointer rounded-lg border-2 border-dashed border-[var(--ap-accent)]/20 p-4 text-center transition-colors hover:border-[var(--ap-accent)]/40" @click="docInputEl[cat.key]?.click()">
                        <input :ref="el => { docInputEl[cat.key] = el as HTMLInputElement | null }" type="file" multiple class="hidden" accept=".pdf,.jpg,.jpeg,.png" @change="onDocFilesSelected($event, cat.key)">
                        <UIcon name="i-lucide-upload" class="mx-auto mb-1 size-5 text-[var(--ap-accent)]/60" />
                        <p class="text-xs text-muted">Browse Files</p>
                        <p class="mt-0.5 text-[10px] text-muted">PDF, JPG, PNG · max 10 MB</p>
                      </div>

                      <div v-if="docFiles[cat.key].length > 0" class="flex flex-wrap gap-1.5">
                        <div
                          v-for="(file, idx) in docFiles[cat.key]"
                          :key="`${cat.key}-${idx}-${file.name}`"
                          class="group flex items-center gap-1.5 rounded-lg border border-[var(--ap-accent)]/20 bg-[var(--ap-accent)]/[0.06] py-1 pl-1 pr-1.5 transition-all duration-200 hover:border-[var(--ap-accent)]/40 hover:bg-[var(--ap-accent)]/[0.1]"
                        >
                          <span class="rounded-md bg-[var(--ap-accent)]/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--ap-accent)]">{{ file.type === 'application/pdf' ? 'PDF' : 'IMG' }}</span>
                          <span class="max-w-24 truncate text-[11px] font-medium text-highlighted">{{ file.name }}</span>
                          <span class="hidden text-[10px] text-muted sm:inline">{{ formatDocBytes(file.size) }}</span>
                          <button type="button" class="flex h-4 w-4 items-center justify-center rounded p-0 opacity-30 transition-opacity group-hover:opacity-100" title="Remove" @click="removeDocFile(cat.key, idx)">
                            <UIcon name="i-lucide-x" class="size-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- ═══ Additional Comments ═══════════════════════════════════ -->
          <div class="ap-fade-in ap-delay-5 relative overflow-hidden rounded-xl border border-[var(--ap-accent)]/25 bg-white/90 shadow-lg backdrop-blur-sm transition-shadow duration-300 hover:shadow-xl dark:bg-[#1a1a1a]/60">
            <div class="pointer-events-none absolute inset-0 bg-gradient-to-br from-[var(--ap-accent)]/[0.04] via-transparent to-transparent" />
            <div class="relative border-b border-black/[0.06] dark:border-white/[0.06]">
              <div class="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[var(--ap-accent)]/[0.08] to-transparent" />
              <div class="absolute inset-x-0 bottom-0 h-[2px] bg-gradient-to-r from-[var(--ap-accent)] via-[var(--ap-accent)]/60 to-transparent" />
              <div class="relative flex items-center gap-3 px-5 py-3.5">
                <div class="flex h-7 w-7 items-center justify-center rounded-lg border-[0.5px] border-[var(--ap-accent)]/45 bg-[var(--ap-accent)]/10">
                  <UIcon name="i-lucide-message-square" class="text-xs text-[var(--ap-accent)]" />
                </div>
                <span class="text-[13px] font-semibold text-highlighted">Additional Comments</span>
              </div>
            </div>
            <div class="relative p-5">
              <UTextarea v-model="form.additional_notes" placeholder="Any additional information relevant to this lead..." :rows="3" class="w-full" />
            </div>
          </div>

          <!-- ═══ Submit ═════════════════════════════════════════════════ -->
          <div class="flex justify-end gap-3 pt-1">
            <UButton label="Cancel" color="neutral" variant="ghost" :disabled="submitting" @click="router.push('/transfers')" />
            <UButton label="Submit Lead" icon="i-lucide-send" color="primary" :loading="submitting" :disabled="formDisabled || submitting" @click="onSubmit" />
          </div>

        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>

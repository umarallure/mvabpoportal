export type DeliveryMethod = 'email' | 'sms_only'
export type RetainerStatus = 'unknown' | 'sent' | 'viewed' | 'signed' | 'declined' | 'voided'

export type TemplateOption = {
  id: string
  name: string
  type: string | null
  stateCode: string | null
  isDefault: boolean
  priority: number
}

export type AttorneyOption = {
  id: string
  displayName: string
  selectable: boolean
  qualification: 'qualified' | 'missing_documents'
  reasons: string[]
  templates: TemplateOption[]
}

export type RetainerDocuments = {
  policeReport: boolean
  insuranceDocuments: boolean
  medicalTreatmentProof: boolean
  driverLicense: boolean
}

export type AgreementRow = {
  id: string
  envelope_id: string
  status: RetainerStatus
  document_bucket: string | null
  document_storage_path: string | null
  document_file_name: string | null
}

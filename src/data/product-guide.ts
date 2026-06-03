export type GuideComponent = {
  label: string
  icon: string
  description: string
}

export type GuideSubsection = {
  id: string
  title: string
  summary: string
  bullets: string[]
  note?: string
  components?: GuideComponent[]
}

export type GuideSection = {
  id: string
  number: string
  title: string
  icon: string
  overview: string
  highlights: string[]
  subsections: GuideSubsection[]
}

export const productGuideSections: GuideSection[] = [
  {
    id: 'publisher-dashboard',
    number: '01',
    title: 'Dashboard',
    icon: 'i-lucide-layout-dashboard',
    overview: 'The Dashboard is the publisher workspace command center. It summarizes lead activity, transfer momentum, and invoicing so the team can read performance before opening the deeper pipelines.',
    highlights: ['Top-line KPI cards', 'Activity overview', 'Quick navigation'],
    subsections: [
      {
        id: 'publisher-dashboard-kpis',
        title: 'Summary KPIs',
        summary: 'The header cards surface the most important operating numbers as soon as the page loads.',
        bullets: [
          'Lead and transfer counts show current intake volume at a glance.',
          'Invoicing totals summarize billed, pending, and paid amounts.',
          'Cards link into the matching pipeline for a deeper view.',
          'Numbers refresh with the latest data when the page loads.'
        ],
        components: [
          {
            label: 'KPI cards',
            icon: 'i-lucide-square-activity',
            description: 'Summarize lead, transfer, and invoicing activity.'
          },
          {
            label: 'Quick links',
            icon: 'i-lucide-arrow-right',
            description: 'Jump from a summary card into the matching pipeline.'
          }
        ]
      },
      {
        id: 'publisher-dashboard-activity',
        title: 'Recent Activity',
        summary: 'The activity area keeps the team oriented on the newest records without leaving the dashboard.',
        bullets: [
          'Recent leads and transfers appear in compact rows.',
          'Status labels show where each record sits in its pipeline.',
          'Selecting a row opens the underlying record for review.'
        ],
        components: [
          {
            label: 'Activity list',
            icon: 'i-lucide-list',
            description: 'Shows the newest leads and transfers in one place.'
          }
        ]
      }
    ]
  },
  {
    id: 'publisher-sales-map',
    number: '02',
    title: 'Sales Map',
    icon: 'i-lucide-map',
    overview: 'The Sales Map gives a geographic view of activity by state. It helps the team understand coverage and where lead and transfer volume is concentrated.',
    highlights: ['State-based map', 'Coverage at a glance', 'Drill into regions'],
    subsections: [
      {
        id: 'publisher-sales-map-overview',
        title: 'Geographic Overview',
        summary: 'The map translates activity into color-coded states so coverage is readable at a glance.',
        bullets: [
          'States are shaded by their current activity level.',
          'Hovering a state reveals its underlying counts.',
          'The view helps spot strong regions and gaps quickly.'
        ],
        components: [
          {
            label: 'Interactive map',
            icon: 'i-lucide-map',
            description: 'Color-codes states by activity volume.'
          },
          {
            label: 'State tooltip',
            icon: 'i-lucide-mouse-pointer-click',
            description: 'Shows the counts behind each state.'
          }
        ]
      }
    ]
  },
  {
    id: 'publisher-lead-intake',
    number: '03',
    title: 'Lead Intake',
    icon: 'i-lucide-clipboard-pen',
    overview: 'Lead Intake is where new leads are captured into the portal. It is the entry point for closers to submit qualified leads into the pipeline.',
    highlights: ['Guided intake form', 'Validation on submit', 'Feeds the pipelines'],
    subsections: [
      {
        id: 'publisher-lead-intake-form',
        title: 'Intake Form',
        summary: 'The form collects the details needed to qualify and route a new lead.',
        bullets: [
          'Required fields are validated before the lead can be submitted.',
          'Submitted leads flow into the transfer and submission pipelines.',
          'Clear prompts keep intake consistent across the team.'
        ],
        note: 'Lead Intake is the first step in the pipeline, so accurate entry here keeps downstream stages clean.',
        components: [
          {
            label: 'Intake fields',
            icon: 'i-lucide-form-input',
            description: 'Capture the lead details needed for qualification.'
          },
          {
            label: 'Submit action',
            icon: 'i-lucide-send',
            description: 'Validates and pushes the lead into the pipeline.'
          }
        ]
      }
    ]
  },
  {
    id: 'publisher-transfers',
    number: '04',
    title: 'Transfer Pipeline',
    icon: 'i-lucide-arrow-right-left',
    overview: 'The Transfer Pipeline tracks leads as they move through transfer stages. It gives the team a board-style view of where every transfer stands.',
    highlights: ['Stage-based pipeline', 'Search and filters', 'Record drill-down'],
    subsections: [
      {
        id: 'publisher-transfers-pipeline',
        title: 'Pipeline Stages',
        summary: 'Transfers are organized into stage columns so progress is visible without reading a flat list.',
        bullets: [
          'Each card represents a transfer with its key identifying details.',
          'Columns reflect the stages a transfer moves through.',
          'Selecting a card opens the full record for review.'
        ],
        components: [
          {
            label: 'Stage columns',
            icon: 'i-lucide-columns-3',
            description: 'Group transfers by their current pipeline stage.'
          },
          {
            label: 'Transfer card',
            icon: 'i-lucide-id-card',
            description: 'Summarizes a single transfer on the board.'
          }
        ]
      },
      {
        id: 'publisher-transfers-filtering',
        title: 'Search and Filtering',
        summary: 'The toolbar keeps the pipeline usable as volume grows.',
        bullets: [
          'Search locates a specific transfer quickly.',
          'Filters narrow the board to a focused subset.',
          'Controls preserve the board layout while reloading data.'
        ],
        components: [
          {
            label: 'Search bar',
            icon: 'i-lucide-search',
            description: 'Finds a transfer without scrolling the board.'
          },
          {
            label: 'Filters',
            icon: 'i-lucide-filter',
            description: 'Narrow the pipeline to the records that matter.'
          }
        ]
      }
    ]
  },
  {
    id: 'publisher-submissions',
    number: '05',
    title: 'Submission Pipeline',
    icon: 'i-lucide-layout-dashboard',
    overview: 'The Submission Pipeline tracks retained submissions through their lifecycle. It is the board the team uses to manage cases after intake.',
    highlights: ['Submission board', 'Status tracking', 'Detail review'],
    subsections: [
      {
        id: 'publisher-submissions-board',
        title: 'Submission Board',
        summary: 'Submissions appear as cards inside status columns so the team can track movement.',
        bullets: [
          'Cards show the submission\'s key details and current status.',
          'Columns reflect each stage in the submission lifecycle.',
          'Selecting a card opens the full submission record.'
        ],
        components: [
          {
            label: 'Status columns',
            icon: 'i-lucide-columns-2',
            description: 'Separate submissions by lifecycle stage.'
          },
          {
            label: 'Submission card',
            icon: 'i-lucide-file-text',
            description: 'Summarizes a single submission on the board.'
          }
        ]
      }
    ]
  },
  {
    id: 'publisher-invoicing',
    number: '06',
    title: 'Invoicing',
    icon: 'i-lucide-receipt',
    overview: 'Invoicing is the financial ledger. It tracks what is ready to bill, what is pending payment, and what has been paid.',
    highlights: ['Financial summary', 'Invoice records', 'PDF access'],
    subsections: [
      {
        id: 'publisher-invoicing-summary',
        title: 'Financial Summary',
        summary: 'The header condenses the visible invoice portfolio into top-line totals.',
        bullets: [
          'Total Invoiced rolls up every invoice in the current view.',
          'Pending and Paid show the money currently in each bucket.',
          'Totals refresh with the page data.'
        ],
        components: [
          {
            label: 'Summary cards',
            icon: 'i-lucide-circle-dollar-sign',
            description: 'Roll up invoiced, pending, and paid amounts.'
          }
        ]
      },
      {
        id: 'publisher-invoicing-records',
        title: 'Invoice Records',
        summary: 'The ledger lists invoices with the controls needed to review and act on them.',
        bullets: [
          'Each row shows the invoice number, amount, date, and status.',
          'Search and filters narrow the ledger to a focused set.',
          'Invoices can be opened as a PDF for sharing or records.'
        ],
        components: [
          {
            label: 'Invoice list',
            icon: 'i-lucide-table-properties',
            description: 'Shows invoices with amount, date, and status.'
          },
          {
            label: 'PDF view',
            icon: 'i-lucide-file-text',
            description: 'Opens a printable version of an invoice.'
          }
        ]
      }
    ]
  },
  {
    id: 'publisher-settings',
    number: '07',
    title: 'Settings',
    icon: 'i-lucide-settings',
    overview: 'Settings is where the publisher manages its own profile and team. It controls the BPO\'s identity in the portal and the access granted to team members.',
    highlights: ['BPO profile', 'Team management', 'Member access'],
    subsections: [
      {
        id: 'publisher-settings-bpo-profile',
        title: 'BPO Profile',
        summary: 'The BPO profile holds the organization\'s identity and core account details used across the portal.',
        bullets: [
          'Update the BPO\'s display name and contact details.',
          'These details represent the publisher throughout the workspace.',
          'Keeping the profile current ensures records show the right information.'
        ],
        components: [
          {
            label: 'Profile fields',
            icon: 'i-lucide-building-2',
            description: 'Stores the BPO\'s identity and account details.'
          }
        ]
      },
      {
        id: 'publisher-settings-team-profile',
        title: 'Team Profile',
        summary: 'Team Profile is where team members are managed and given access to the portal.',
        bullets: [
          'Invite or manage team members from one place.',
          'Closers are scoped to the areas relevant to their role.',
          'Access control keeps the workspace organized and secure.'
        ],
        components: [
          {
            label: 'Team member list',
            icon: 'i-lucide-users-round',
            description: 'Shows the publisher\'s team members and their access.'
          }
        ]
      }
    ]
  }
]

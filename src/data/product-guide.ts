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
    overview: 'The Dashboard is the publisher workspace command center. It summarizes lead activity, transfer momentum, retainer movement, and invoicing so the team can read performance before opening deeper workflows.',
    highlights: ['Top-line KPI cards', 'Date range control', 'Retainer trend chart', 'Quick navigation'],
    subsections: [
      {
        id: 'publisher-dashboard-kpis',
        title: 'Summary KPIs',
        summary: 'The header cards surface the most important operating numbers as soon as the page loads.',
        bullets: [
          'Lead and transfer counts show current intake volume at a glance.',
          'Invoicing totals summarize billed, pending, and paid amounts.',
          'KPI cards refresh with the selected dashboard date range.',
          'Cards link into the matching workflow when a deeper review is needed.',
          'Use the KPI row as the starting point for daily volume, payment, and workflow checks.'
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
        id: 'publisher-dashboard-trends',
        title: 'Retainer Trends',
        summary: 'The trend chart shows how retained submissions move over the selected period.',
        bullets: [
          'The date range picker controls the period used for dashboard KPIs and trend data.',
          'The chart groups retained activity over the selected range.',
          'Hovering chart points reveals the count behind each period.',
          'Use the trend to spot changes in retained volume before opening the detailed pipelines.',
          'Compare short and longer ranges to separate normal daily movement from broader performance shifts.'
        ],
        components: [
          {
            label: 'Date range picker',
            icon: 'i-lucide-calendar',
            description: 'Controls the reporting window used by the dashboard.'
          },
          {
            label: 'Trend chart',
            icon: 'i-lucide-chart-line',
            description: 'Shows retained activity over time.'
          }
        ]
      },
      {
        id: 'publisher-dashboard-rhythm',
        title: 'Daily Operating Rhythm',
        summary: 'The Dashboard is designed to be the first page checked at the start of a shift.',
        bullets: [
          'Start with the date range to confirm the reporting window is correct.',
          'Review KPI cards for volume, retained movement, and invoicing exposure.',
          'Use unusual changes in the chart as a prompt to review the Transfer Pipeline, Submission Pipeline, or Invoicing page.',
          'Use the quick actions in the header to move into common workflows without searching through navigation.'
        ],
        note: 'The Dashboard is a summary view. Use the detailed pages when you need record-level context or to take action.',
        components: [
          {
            label: 'Date window',
            icon: 'i-lucide-calendar-range',
            description: 'Sets the timeframe for dashboard review.'
          },
          {
            label: 'Header actions',
            icon: 'i-lucide-plus',
            description: 'Provides quick access to common follow-up work.'
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
          'The view helps spot strong regions and gaps quickly.',
          'Use the map as a planning view before deciding where to focus outreach or review.'
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
      },
      {
        id: 'publisher-sales-map-capacity',
        title: 'Availability and Capacity',
        summary: 'Sales Map availability indicators help the team understand where selling activity can be prioritized.',
        bullets: [
          'Available states are places where selling activity can continue.',
          'Blocked or unavailable states should be treated as areas requiring caution or review before additional activity.',
          'Capacity indicators help show whether a state has low, medium, or high room for more activity.',
          'Use tooltip details to confirm state-level context before making operating decisions.'
        ],
        components: [
          {
            label: 'State color',
            icon: 'i-lucide-palette',
            description: 'Shows state availability at a glance.'
          },
          {
            label: 'Capacity legend',
            icon: 'i-lucide-gauge',
            description: 'Explains the low, medium, and high capacity ranges.'
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
          'Clear prompts keep intake consistent across the team.',
          'Customer, accident, injury, insurance, liability, and tracking details should be entered as completely as possible.',
          'Conditional fields appear when additional context is required, such as prior attorney involvement or medical treatment details.'
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
      },
      {
        id: 'publisher-lead-intake-screening',
        title: 'DNC and TCPA Screening',
        summary: 'Screening protects the team from continuing with phone numbers that require extra consent or cannot be used.',
        bullets: [
          'Run the phone number check before completing the rest of the intake form.',
          'If the number is clear, continue with the intake details.',
          'If consent is required, read the displayed disclaimer and capture clear verbal permission before proceeding.',
          'If a TCPA litigator warning is shown, do not continue the call or submit the lead.',
          'If screening cannot be completed, stop and retry the check before moving forward.'
        ],
        note: 'This section is user guidance only. Follow your company compliance process whenever a warning is shown.',
        components: [
          {
            label: 'Phone screening',
            icon: 'i-lucide-phone-call',
            description: 'Checks whether the number can be used for intake.'
          },
          {
            label: 'Consent prompt',
            icon: 'i-lucide-shield-check',
            description: 'Shows the disclaimer needed when consent must be confirmed.'
          }
        ]
      },
      {
        id: 'publisher-lead-intake-submit',
        title: 'Submitting a Lead',
        summary: 'The final submit step validates the lead and sends it into the portal workflow.',
        bullets: [
          'Review required fields and resolve any validation messages before submitting.',
          'Do not submit the same lead multiple times; use the success confirmation to verify submission.',
          'After submission, the lead becomes available in the downstream pipeline views.',
          'Use Cancel only when you need to leave intake without submitting the current form.'
        ],
        components: [
          {
            label: 'Validation messages',
            icon: 'i-lucide-alert-circle',
            description: 'Point out missing or invalid fields before submission.'
          },
          {
            label: 'Success confirmation',
            icon: 'i-lucide-check-circle',
            description: 'Confirms that the lead was accepted into the workflow.'
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
    highlights: ['Stage KPI cards', 'Board and list views', 'Search and filters', 'Record drill-down'],
    subsections: [
      {
        id: 'publisher-transfers-pipeline',
        title: 'Pipeline Stages',
        summary: 'Transfers are organized into stage columns so progress is visible without reading a flat list.',
        bullets: [
          'Each card represents a transfer with its key identifying details.',
          'Columns reflect the stages a transfer moves through.',
          'Stage counters show how many transfers are currently in each column.',
          'Empty columns remain visible so the board layout stays consistent even when there are no transfers in a stage.',
          'Selecting a card opens the full record for review.'
        ],
        components: [
          {
            label: 'Stage columns',
            icon: 'i-lucide-columns-3',
            description: 'Group transfers by their current pipeline stage.'
          },
          {
            label: 'Stage counters',
            icon: 'i-lucide-hash',
            description: 'Show the number of transfers in each stage.'
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
          'Date ranges focus the page on the period being reviewed.',
          'Filters narrow the board by state, case category, injury severity, insurance status, liability status, treatment status, language, and expiry timing.',
          'Use Reset all to clear search and filters in one action.',
          'Switch between Board and List when you need either stage visibility or row-by-row comparison.',
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
          },
          {
            label: 'View toggle',
            icon: 'i-lucide-list',
            description: 'Switches between the board and list layouts.'
          }
        ]
      },
      {
        id: 'publisher-transfers-review',
        title: 'Reviewing Transfer Records',
        summary: 'Transfer cards and list rows open the record view used for detailed review and follow-up.',
        bullets: [
          'Open a transfer when the card summary is not enough to make a decision.',
          'Use the record details to confirm customer, phone, state, publisher, date, and transfer context.',
          'Use stage descriptions and card details together to understand why a transfer is waiting, returned, or ready for the next step.',
          'When drag-and-drop is available, moving a card updates the transfer stage immediately.',
          'Refresh the page when you need to confirm the latest pipeline state after another user has worked the same queue.'
        ],
        note: 'Use the detailed record before changing a transfer stage when the reason for the current stage is unclear.',
        components: [
          {
            label: 'Open record',
            icon: 'i-lucide-eye',
            description: 'Opens the complete transfer details from a card or row.'
          },
          {
            label: 'Drag movement',
            icon: 'i-lucide-grip',
            description: 'Moves a transfer between stages when that action is enabled.'
          },
          {
            label: 'Refresh',
            icon: 'i-lucide-refresh-cw',
            description: 'Reloads pipeline data without leaving the page.'
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
    highlights: ['Submission KPI cards', 'Tier and commission context', 'Status tracking', 'Detail review'],
    subsections: [
      {
        id: 'publisher-submissions-board',
        title: 'Submission Board',
        summary: 'Submissions appear as cards inside status columns so the team can track movement.',
        bullets: [
          'Cards show the submission\'s key details and current status.',
          'Columns reflect each stage in the submission lifecycle.',
          'Column headers include help text so each stage can be understood without leaving the board.',
          'Cards show available state, tier, commission, vendor, and note count context.',
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
          },
          {
            label: 'Stage help',
            icon: 'i-lucide-circle-help',
            description: 'Explains each stage and tier directly from the column header.'
          }
        ]
      },
      {
        id: 'publisher-submissions-kpis',
        title: 'Submission KPI Cards',
        summary: 'The top cards summarize the submission board before the team starts working individual cases.',
        bullets: [
          'Total Cases counts valid submissions after the current filters are applied.',
          'Intake Queue shows submissions that have a signed retainer or are missing required information.',
          'Qualified & Review groups tiered cases and attorney-review stages, including pending commission value where available.',
          'Payment Queue shows cases that are qualified and payable, including payable commission value.',
          'Use the help icon on each card to confirm which stages are included in that total.'
        ],
        components: [
          {
            label: 'KPI cards',
            icon: 'i-lucide-square-activity',
            description: 'Summarize case volume and commission movement by workflow group.'
          },
          {
            label: 'Stage list',
            icon: 'i-lucide-list-checks',
            description: 'Shows which submission stages feed each KPI.'
          }
        ]
      },
      {
        id: 'publisher-submissions-tier-review',
        title: 'Qualification and Tier Review',
        summary: 'Tier details help users understand case quality and expected commission while reviewing submissions.',
        bullets: [
          'Qualified stages separate cases by tier so the team can see value and review priority.',
          'Tier chips on cards show the current case tier when it is available.',
          'Commission values help the team understand the expected value tied to qualified and payable cases.',
          'Attorney Review and Attorney Approved stages show cases that need legal review or have passed that review.',
          'Cases missing information should be worked before they can reliably move into qualified or payable stages.'
        ],
        components: [
          {
            label: 'Tier chip',
            icon: 'i-lucide-badge-dollar-sign',
            description: 'Shows the tier assigned to a submission.'
          },
          {
            label: 'Commission value',
            icon: 'i-lucide-banknote',
            description: 'Shows the expected value tied to the submission when available.'
          }
        ]
      },
      {
        id: 'publisher-submissions-stage-notes',
        title: 'Stage Updates and Notes',
        summary: 'Submission cards provide a fast path to update stage and add business context.',
        bullets: [
          'Use the pencil action on a card when a submission needs a stage update.',
          'Choose the next status that reflects the case\'s current review or payment state.',
          'Add a note when the stage change needs context for another team member.',
          'Note counts on cards show whether previous context exists before opening the full record.',
          'Open the full retainer record when you need more detail than the board card provides.'
        ],
        components: [
          {
            label: 'Stage editor',
            icon: 'i-lucide-pencil',
            description: 'Updates the submission status from the board.'
          },
          {
            label: 'Notes',
            icon: 'i-lucide-sticky-note',
            description: 'Captures context that should stay attached to the submission.'
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
    overview: 'Invoicing is the financial workspace for publisher invoices. It helps the team understand outstanding value, review invoice details, track payment progress, and open printable invoice documents when needed.',
    highlights: ['Financial KPI cards', 'Status board and list view', 'Invoice PDF review', 'Payment follow-up'],
    subsections: [
      {
        id: 'publisher-invoicing-summary',
        title: 'Financial KPI Cards',
        summary: 'The KPI cards at the top of Invoicing explain the current dollar value in each invoice bucket.',
        bullets: [
          'Total Invoiced shows the full invoice value available to your account across every status.',
          'Billable - Awaiting to be Paid shows invoices that are ready for payment and have not yet moved into review or paid status.',
          'In Review shows invoices currently being reviewed, previewed, or awaiting final confirmation.',
          'Paid shows invoice value that has been marked as paid and completed.',
          'Chargeback shows invoice value flagged for chargeback review or follow-up.'
        ],
        note: 'Use the help icon on each KPI card when you need a quick reminder of what the number includes.',
        components: [
          {
            label: 'Summary cards',
            icon: 'i-lucide-circle-dollar-sign',
            description: 'Roll up invoice value by payment and review status.'
          },
          {
            label: 'Info icons',
            icon: 'i-lucide-circle-help',
            description: 'Explain what each KPI card is counting in business terms.'
          }
        ]
      },
      {
        id: 'publisher-invoicing-board',
        title: 'Board and List Views',
        summary: 'Invoicing supports both a status board and a ledger-style list so finance work can be reviewed from either angle.',
        bullets: [
          'The board groups invoices by payment status so outstanding work is easy to scan.',
          'The list view shows invoice number, date range, related leads, amount, and status in rows.',
          'Search helps locate a specific invoice by invoice number, related lead, or note.',
          'Opening a card or row brings up the invoice document for review.'
        ],
        components: [
          {
            label: 'Status board',
            icon: 'i-lucide-columns-3',
            description: 'Groups invoices by payment or review stage.'
          },
          {
            label: 'Invoice list',
            icon: 'i-lucide-table-properties',
            description: 'Shows invoice details in a compact ledger format.'
          },
          {
            label: 'Search',
            icon: 'i-lucide-search',
            description: 'Finds invoices without manually scanning every card or row.'
          }
        ]
      },
      {
        id: 'publisher-invoicing-pdf',
        title: 'Invoice PDF Review',
        summary: 'The invoice document view is used for formal review, printing, saving, and payment follow-up.',
        bullets: [
          'The invoice document shows billing parties, invoice number, status, dates, line items, totals, and notes.',
          'The Print / Save as PDF action creates a clean copy for records or sharing.',
          'When available, payment and chargeback actions are shown directly on the invoice document.',
          'The due date and billing period help the team understand timing and coverage.'
        ],
        components: [
          {
            label: 'PDF document',
            icon: 'i-lucide-file-text',
            description: 'Presents a printable invoice with line items, dates, and totals.'
          },
          {
            label: 'Status actions',
            icon: 'i-lucide-check-circle',
            description: 'Shows payment or chargeback actions when they apply to the invoice status.'
          },
          {
            label: 'Print / Save',
            icon: 'i-lucide-printer',
            description: 'Creates a business-ready copy of the invoice.'
          }
        ]
      },
      {
        id: 'publisher-invoicing-statuses',
        title: 'Payment Statuses and Actions',
        summary: 'Invoice statuses show where each invoice sits in the payment workflow and which follow-up actions may be available.',
        bullets: [
          'Billable - Awaiting to be Paid means the invoice is ready for payment follow-up.',
          'In Review groups invoices that are being checked, previewed, or awaiting final confirmation.',
          'Paid means the invoice has been completed and should no longer be treated as outstanding.',
          'Chargeback means the invoice has been flagged for additional review or correction.',
          'Mark as Paid and Request Chargeback actions appear on the invoice document when those actions apply to the current invoice.'
        ],
        note: 'Use the invoice document as the source for action buttons; the board and list views are optimized for scanning.',
        components: [
          {
            label: 'Status badge',
            icon: 'i-lucide-badge-check',
            description: 'Shows the current payment state of an invoice.'
          },
          {
            label: 'Mark as Paid',
            icon: 'i-lucide-circle-check-big',
            description: 'Moves an eligible invoice into paid status.'
          },
          {
            label: 'Request Chargeback',
            icon: 'i-lucide-triangle-alert',
            description: 'Flags an eligible invoice for chargeback review.'
          }
        ]
      }
    ]
  },
  {
    id: 'publisher-deel',
    number: '07',
    title: 'Deel',
    icon: 'i-lucide-landmark',
    overview: 'Deel is the payment and contractor-management handoff. The portal provides a quick path to open Deel in a new tab when the team needs to manage payments, contracts, or payroll outside the portal.',
    highlights: ['External payment workspace', 'New-tab handoff', 'Contract and payroll access'],
    subsections: [
      {
        id: 'publisher-deel-handoff',
        title: 'Opening Deel',
        summary: 'The Deel page keeps the payment-management handoff simple and clear.',
        bullets: [
          'Use Open Deel to launch the Deel platform in a separate browser tab.',
          'Keep the portal open while completing payment or contractor tasks in Deel.',
          'Return to the portal when you need invoice, lead, or pipeline context.'
        ],
        note: 'Deel is a separate platform. Portal invoice status and Deel payment activity should be reviewed together when reconciling payments.',
        components: [
          {
            label: 'Open Deel',
            icon: 'i-lucide-external-link',
            description: 'Launches Deel in a new tab for payment and contractor workflows.'
          }
        ]
      },
      {
        id: 'publisher-deel-reconciliation',
        title: 'Reconciling With Portal Invoices',
        summary: 'Deel and the portal should be reviewed together when payment questions come up.',
        bullets: [
          'Use the portal first to confirm invoice number, status, amount, billing period, and line items.',
          'Open Deel when payment, contract, or payroll action needs to be completed outside the portal.',
          'Keep invoice status and Deel payment activity aligned during reconciliation.',
          'Return to Invoicing after external payment work so the portal remains the team\'s shared status view.'
        ],
        components: [
          {
            label: 'Invoice context',
            icon: 'i-lucide-receipt',
            description: 'Provides the portal-side payment record before opening Deel.'
          },
          {
            label: 'External handoff',
            icon: 'i-lucide-external-link',
            description: 'Moves payment work into Deel when needed.'
          }
        ]
      }
    ]
  },
  {
    id: 'publisher-inbox',
    number: '08',
    title: 'Inbox',
    icon: 'i-lucide-inbox',
    overview: 'Inbox is the notification center. It gives the team one place to review portal alerts, filter unread items, search for a specific update, and jump into the related workflow.',
    highlights: ['Notification feed', 'Unread tracking', 'Category filters', 'Direct navigation'],
    subsections: [
      {
        id: 'publisher-inbox-feed',
        title: 'Notification Feed',
        summary: 'The feed lists notifications in a structured timeline so important updates do not get buried.',
        bullets: [
          'Unread notifications are counted and can be marked as read individually or in bulk.',
          'Category filters narrow the feed to the type of update you need to review.',
          'Search checks notification titles, descriptions, and category labels.',
          'Selecting a notification opens the related page when a destination is available.'
        ],
        components: [
          {
            label: 'Filter chips',
            icon: 'i-lucide-filter',
            description: 'Switch between all, unread, and category-specific notifications.'
          },
          {
            label: 'Notification item',
            icon: 'i-lucide-bell',
            description: 'Shows the update, status, and available actions.'
          },
          {
            label: 'Pagination',
            icon: 'i-lucide-chevron-right',
            description: 'Keeps larger notification feeds manageable.'
          }
        ]
      },
      {
        id: 'publisher-inbox-follow-up',
        title: 'Unread and Follow-Up Actions',
        summary: 'Inbox actions help users clear notifications after the underlying work has been reviewed.',
        bullets: [
          'Unread counts help users see whether new portal activity needs attention.',
          'Mark a notification as read after the update has been reviewed.',
          'Use category filters when you only want lead, invoice, system, or workflow updates.',
          'Delete notifications that no longer need to remain in the feed.',
          'When a notification has a destination, open it from the Inbox instead of manually searching for the record.'
        ],
        components: [
          {
            label: 'Mark as read',
            icon: 'i-lucide-check',
            description: 'Clears unread status after review.'
          },
          {
            label: 'Open destination',
            icon: 'i-lucide-arrow-up-right',
            description: 'Navigates to the related portal page when available.'
          },
          {
            label: 'Delete',
            icon: 'i-lucide-trash-2',
            description: 'Removes a notification from the feed.'
          }
        ]
      }
    ]
  },
  {
    id: 'publisher-product-offering',
    number: '09',
    title: 'Product Offering',
    icon: 'i-lucide-package',
    overview: 'Product Offering explains the case tiers and commission values used by the business. It helps teams understand how case quality, documentation, timing, and liability strength influence value.',
    highlights: ['Consumer and commercial tiers', 'Commission values', 'Qualification criteria'],
    subsections: [
      {
        id: 'publisher-product-offering-tiers',
        title: 'Case Tiers',
        summary: 'The tier cards show how cases are grouped and what each tier is worth.',
        bullets: [
          'Use the Consumer / Commercial selector to switch between offering categories.',
          'Each card shows the commission value for that case type.',
          'Tier details explain accident timing, injury level, documentation expectations, and liability strength.',
          'Use this page as a quick reference when reviewing lead quality or coaching intake teams.'
        ],
        components: [
          {
            label: 'Category selector',
            icon: 'i-lucide-list-filter',
            description: 'Switches between consumer and commercial case offerings.'
          },
          {
            label: 'Tier cards',
            icon: 'i-lucide-badge-dollar-sign',
            description: 'Show commission value and qualification criteria.'
          }
        ]
      },
      {
        id: 'publisher-product-offering-qa',
        title: 'Using the Offering During QA',
        summary: 'The offering page can be used as a shared reference when reviewing lead quality and coaching intake behavior.',
        bullets: [
          'Compare a lead against the tier details before assuming its expected value.',
          'Use accident timing, injury details, treatment status, documentation, and liability strength as quality checks.',
          'Use the Consumer / Commercial selector before discussing values so the right tier set is visible.',
          'When a case does not clearly fit a tier, gather missing facts before moving it forward.',
          'Use tier language consistently when discussing submissions across intake, review, and payment workflows.'
        ],
        components: [
          {
            label: 'Quality criteria',
            icon: 'i-lucide-list-checks',
            description: 'Helps the team review whether a case matches the expected tier.'
          },
          {
            label: 'Commission reference',
            icon: 'i-lucide-circle-dollar-sign',
            description: 'Shows the business value tied to each case type.'
          }
        ]
      }
    ]
  },
  {
    id: 'publisher-product-guide',
    number: '10',
    title: 'Product Guide',
    icon: 'i-lucide-book-open',
    overview: 'Product Guide is the in-portal operating manual. It explains how the main workspace areas are used and gives admins a place to maintain business-facing guidance for the team.',
    highlights: ['Searchable guide', 'Section and topic navigation', 'Admin-maintained content'],
    subsections: [
      {
        id: 'publisher-product-guide-navigation',
        title: 'Using the Guide',
        summary: 'The guide is organized into sections and topics so users can quickly find help for a specific workflow.',
        bullets: [
          'Use the left navigation to browse portal areas and their topics.',
          'Use search to find guidance by page name, workflow, or business term.',
          'Topic pages contain summaries, key details, notes, and component explanations.',
          'Admins can add, edit, reorder, and remove guide content as workflows evolve.'
        ],
        components: [
          {
            label: 'Topic search',
            icon: 'i-lucide-search',
            description: 'Finds guide content by matching section and topic text.'
          },
          {
            label: 'Topic editor',
            icon: 'i-lucide-pencil',
            description: 'Lets authorized admins maintain business-facing help content.'
          }
        ]
      },
      {
        id: 'publisher-product-guide-maintenance',
        title: 'Maintaining Content',
        summary: 'Authorized admins can keep guide content aligned with current business workflows.',
        bullets: [
          'Create sections for major portal areas and topics for specific workflows.',
          'Use clear business language so the guide is useful to closers, managers, and finance users.',
          'Update guide content when a workflow, status name, or business rule changes.',
          'Reorder sections and topics so high-traffic workflows stay easy to find.',
          'Avoid storing sensitive internal notes, credentials, private process details, or customer-specific information in guide content.'
        ],
        components: [
          {
            label: 'Section controls',
            icon: 'i-lucide-folder-plus',
            description: 'Adds or edits major guide areas.'
          },
          {
            label: 'Topic controls',
            icon: 'i-lucide-file-plus',
            description: 'Adds or edits workflow-specific guide pages.'
          },
          {
            label: 'Reordering',
            icon: 'i-lucide-grip-vertical',
            description: 'Changes the order of sections and topics.'
          }
        ]
      }
    ]
  },
  {
    id: 'publisher-settings',
    number: '11',
    title: 'Settings',
    icon: 'i-lucide-settings',
    overview: 'Settings is where the publisher manages its profile, capacity details, and team access. Keeping this area current helps records, reporting, and user permissions stay aligned with the business.',
    highlights: ['BPO profile', 'Stats and capacity', 'Team management', 'Member access'],
    subsections: [
      {
        id: 'publisher-settings-bpo-profile',
        title: 'BPO Profile',
        summary: 'The BPO profile holds the organization\'s identity, contact details, market focus, and operating capacity.',
        bullets: [
          'Basic Identity stores the center name, location, website or LinkedIn, contact email, and contact phone.',
          'Stats & Capacity stores number of agents, buyers, campaigns, sales model, market targets, languages, and operating hours.',
          'Use Edit to make changes, Save changes to apply them, or Cancel to restore the last saved profile.',
          'Keeping the profile current helps business records and reporting show the right information.'
        ],
        components: [
          {
            label: 'Basic Identity',
            icon: 'i-lucide-building-2',
            description: 'Stores the center identity and primary contact details.'
          },
          {
            label: 'Stats & Capacity',
            icon: 'i-lucide-bar-chart-3',
            description: 'Stores team size, buyers, campaigns, markets, languages, and hours.'
          }
        ]
      },
      {
        id: 'publisher-settings-team-profile',
        title: 'Team Profile',
        summary: 'Team Profile is where team members are managed and given access to the portal.',
        bullets: [
          'Add team members with the role, position, shift availability, and login details they need.',
          'Edit member details inline when a profile needs to be corrected.',
          'Remove access for users who should no longer use the portal.',
          'Closers have a focused workspace for intake and their center-scoped team page.'
        ],
        components: [
          {
            label: 'Team member list',
            icon: 'i-lucide-users-round',
            description: 'Shows the publisher\'s team members and their access.'
          },
          {
            label: 'Add member',
            icon: 'i-lucide-user-plus',
            description: 'Creates a new team member account with role and shift details.'
          }
        ]
      },
      {
        id: 'publisher-settings-access-roles',
        title: 'Access and Roles',
        summary: 'Settings should be reviewed whenever team responsibilities or portal access needs change.',
        bullets: [
          'Publisher admins can manage the BPO profile, team access, and guide content available to the publisher workspace.',
          'Publisher closers have a focused workspace for intake and center-scoped team details.',
          'Review a member\'s role before granting access so users only receive the workspace they need.',
          'Update team details when a role, shift, or position changes.',
          'Remove access promptly when a user should no longer use the portal.'
        ],
        components: [
          {
            label: 'Role selection',
            icon: 'i-lucide-user-cog',
            description: 'Controls which workspace level a team member receives.'
          },
          {
            label: 'Member actions',
            icon: 'i-lucide-users-round',
            description: 'Adds, edits, or removes team member access.'
          }
        ]
      }
    ]
  }
]

import { supabase } from './supabase'

// The terms tables are shared with the broker and lawyer portals (same
// Supabase project). This portal only reads and accepts its own portal's
// versions.
export const TERMS_PORTAL_KEY = 'publisher'

export type TermsVersion = {
  id: string
  portal_key: string
  version: number
  title: string
  content_md: string
  content_sha256: string
  is_published: boolean
  effective_at: string
  created_at: string
}

export async function fetchPendingTerms(): Promise<TermsVersion | null> {
  const { data, error } = await supabase.rpc('get_pending_terms', {
    p_portal_key: TERMS_PORTAL_KEY
  })

  if (error) throw new Error(error.message)

  const rows = (data ?? []) as TermsVersion[]
  return rows[0] ?? null
}

// Current published version as an unpersonalized template (placeholder tags
// intact) for the public /terms page. Works for anonymous visitors.
export async function fetchPublicTerms(): Promise<TermsVersion | null> {
  const { data, error } = await supabase.rpc('get_public_terms', {
    p_portal_key: TERMS_PORTAL_KEY
  })

  if (error) throw new Error(error.message)

  const rows = (data ?? []) as TermsVersion[]
  return rows[0] ?? null
}

export const TERMS_VERSION_CHANGED = 'TERMS_VERSION_CHANGED'

export async function acceptTerms(termsVersionId: string, typedName: string): Promise<void> {
  const { error } = await supabase.rpc('accept_terms', {
    p_portal_key: TERMS_PORTAL_KEY,
    p_terms_version_id: termsVersionId,
    p_typed_name: typedName,
    p_user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null
  })

  if (error) {
    if (error.message.includes(TERMS_VERSION_CHANGED)) {
      throw new Error(TERMS_VERSION_CHANGED)
    }
    throw new Error(error.message)
  }
}

// ── Markdown rendering ──
// The stored terms body uses a small markdown subset (headings, paragraphs,
// bullet lists, links, bold). Everything is HTML-escaped before our own tags
// are added, so the output is safe for v-html regardless of the stored text.

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const renderInline = (text: string) =>
  escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
    )

export function renderTermsMarkdown(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const html: string[] = []
  let paragraph: string[] = []
  let listItems: string[] = []

  const flushParagraph = () => {
    if (!paragraph.length) return
    html.push(`<p>${renderInline(paragraph.join(' '))}</p>`)
    paragraph = []
  }

  const flushList = () => {
    if (!listItems.length) return
    html.push(`<ul>${listItems.map((item) => `<li>${renderInline(item)}</li>`).join('')}</ul>`)
    listItems = []
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()

    if (!line) {
      flushParagraph()
      flushList()
      continue
    }

    const heading = line.match(/^(#{1,4})\s+(.*)$/)
    if (heading) {
      flushParagraph()
      flushList()
      const level = Math.min(Math.max(heading[1].length, 2), 4)
      html.push(`<h${level}>${renderInline(heading[2])}</h${level}>`)
      continue
    }

    if (line.startsWith('- ')) {
      flushParagraph()
      listItems.push(line.slice(2))
      continue
    }

    flushList()
    paragraph.push(line)
  }

  flushParagraph()
  flushList()

  return html.join('\n')
}

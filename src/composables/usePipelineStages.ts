import { ref, onMounted } from 'vue'
import { supabase } from '../lib/supabase'

export interface PipelineStage {
  id: string
  pipeline: string
  key: string
  label: string
  description?: string | null
  display_order: number
  column_class: string | null
  header_class: string | null
  is_active: boolean
  publisher_portal_stage_view?: boolean | null
}

interface UsePipelineStagesOptions {
  publisherPortalView?: boolean
}

export function usePipelineStages(pipeline: string, options: UsePipelineStagesOptions = {}) {
  const stages = ref<PipelineStage[]>([])
  const loading = ref(true)
  const error = ref<string | null>(null)

  const fetchStages = async () => {
    loading.value = true
    error.value = null

    try {
      const runQuery = async (applyPublisherViewFilter: boolean) => {
        let query = supabase
          .from('portal_stages')
          .select('*')
          .eq('pipeline', pipeline)
          .eq('is_active', true)

        if (applyPublisherViewFilter) {
          query = query.eq('publisher_portal_stage_view', true)
        }

        return query.order('display_order', { ascending: true })
      }

      let { data, error: fetchError } = await runQuery(Boolean(options.publisherPortalView))

      if (
        fetchError &&
        options.publisherPortalView &&
        /publisher_portal_stage_view/i.test(fetchError.message)
      ) {
        ;({ data, error: fetchError } = await runQuery(false))
      }

      if (fetchError) {
        error.value = fetchError.message
      } else {
        stages.value = (data ?? []) as unknown as PipelineStage[]
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to fetch stages'
    } finally {
      loading.value = false
    }
  }

  onMounted(() => {
    fetchStages()
  })

  return { stages, loading, error, refetch: fetchStages }
}

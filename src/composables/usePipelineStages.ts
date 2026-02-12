import { ref, onMounted } from 'vue'
import { supabase } from '../lib/supabase'

export interface PipelineStage {
  id: string
  pipeline: string
  key: string
  label: string
  display_order: number
  column_class: string | null
  header_class: string | null
  is_active: boolean
}

export function usePipelineStages(pipeline: string) {
  const stages = ref<PipelineStage[]>([])
  const loading = ref(true)
  const error = ref<string | null>(null)

  const fetchStages = async () => {
    loading.value = true
    error.value = null

    try {
      const { data, error: fetchError } = await supabase
        .from('portal_stages')
        .select('*')
        .eq('pipeline', pipeline)
        .eq('is_active', true)
        .order('display_order', { ascending: true })

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

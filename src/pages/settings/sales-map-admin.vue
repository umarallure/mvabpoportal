<script setup lang="ts">
import { ref } from 'vue'

type StateConfig = {
  code: string
  name: string
  status: 'green' | 'yellow' | 'red'
  volume: number
  criteria: string
  minVolume: number
  maxVolume: number
}

const loading = ref(false)
const saving = ref(false)

const statesConfig = ref<StateConfig[]>([
  { code: 'CA', name: 'California', status: 'green', volume: 450, criteria: 'High demand, excellent market', minVolume: 300, maxVolume: 600 },
  { code: 'TX', name: 'Texas', status: 'green', volume: 380, criteria: 'Strong market, good opportunities', minVolume: 250, maxVolume: 500 },
  { code: 'FL', name: 'Florida', status: 'yellow', volume: 250, criteria: 'Moderate demand, competitive', minVolume: 150, maxVolume: 350 },
  { code: 'NY', name: 'New York', status: 'green', volume: 420, criteria: 'High demand, premium market', minVolume: 300, maxVolume: 550 },
  { code: 'PA', name: 'Pennsylvania', status: 'yellow', volume: 180, criteria: 'Moderate demand', minVolume: 100, maxVolume: 300 }
])

const selectedState = ref<StateConfig | null>(null)
const showEditModal = ref(false)

const editState = (state: StateConfig) => {
  selectedState.value = { ...state }
  showEditModal.value = true
}

const saveState = () => {
  if (!selectedState.value) return
  
  saving.value = true
  
  setTimeout(() => {
    const index = statesConfig.value.findIndex(s => s.code === selectedState.value?.code)
    if (index !== -1 && selectedState.value) {
      statesConfig.value[index] = { ...selectedState.value }
    }
    
    saving.value = false
    showEditModal.value = false
    selectedState.value = null
  }, 500)
}

const statusOptions = [
  { value: 'green', label: 'Green - Can Sell' },
  { value: 'yellow', label: 'Yellow - Moderate' },
  { value: 'red', label: 'Red - Restricted' }
]
</script>

<template>
  <div class="space-y-6 p-6">
    <div>
      <h2 class="text-2xl font-semibold">Sales Map Administration</h2>
      <p class="mt-1 text-sm text-muted">Configure state-level sales criteria and volume thresholds</p>
    </div>

    <UCard>
      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <h3 class="font-semibold">State Configurations</h3>
          <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide-refresh-cw"
            :loading="loading"
          >
            Refresh
          </UButton>
        </div>

        <div class="space-y-2">
          <UCard v-for="state in statesConfig" :key="state.code">
            <div class="flex items-center justify-between">
              <div class="flex-1">
                <div class="flex items-center gap-3">
                  <h4 class="font-semibold">{{ state.name }} ({{ state.code }})</h4>
                  <UBadge
                    :color="state.status === 'green' ? 'success' : state.status === 'yellow' ? 'warning' : 'error'"
                    variant="subtle"
                    :label="state.status.toUpperCase()"
                  />
                </div>
                <div class="mt-2 grid gap-2 text-sm sm:grid-cols-3">
                  <div>
                    <span class="text-muted">Volume:</span>
                    <span class="ml-2 font-semibold">{{ state.volume }}</span>
                  </div>
                  <div>
                    <span class="text-muted">Min:</span>
                    <span class="ml-2">{{ state.minVolume }}</span>
                  </div>
                  <div>
                    <span class="text-muted">Max:</span>
                    <span class="ml-2">{{ state.maxVolume }}</span>
                  </div>
                </div>
                <p class="mt-2 text-xs text-muted">{{ state.criteria }}</p>
              </div>

              <UButton
                color="neutral"
                variant="outline"
                icon="i-lucide-edit"
                @click="editState(state)"
              >
                Edit
              </UButton>
            </div>
          </UCard>
        </div>
      </div>
    </UCard>

    <UModal v-model:open="showEditModal" :title="`Edit ${selectedState?.name}`">
      <div v-if="selectedState" class="space-y-4 p-4">
        <USelect
          v-model="selectedState.status"
          label="Status"
          :items="statusOptions"
          value-key="value"
          label-key="label"
        />

        <UInput
          v-model.number="selectedState.volume"
          type="number"
          label="Current Volume"
        />

        <UInput
          v-model.number="selectedState.minVolume"
          type="number"
          label="Minimum Volume Threshold"
        />

        <UInput
          v-model.number="selectedState.maxVolume"
          type="number"
          label="Maximum Volume Threshold"
        />

        <UTextarea
          v-model="selectedState.criteria"
          label="Criteria Description"
          :rows="3"
        />

        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="outline" @click="showEditModal = false">
            Cancel
          </UButton>
          <UButton :loading="saving" @click="saveState">
            Save Changes
          </UButton>
        </div>
      </div>
    </UModal>
  </div>
</template>

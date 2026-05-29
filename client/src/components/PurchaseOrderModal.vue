<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="isOpen && backlogItem" class="modal-overlay" @click="close">
        <div class="modal-container" @click.stop>
          <div class="modal-header">
            <h3 class="modal-title">
              {{ mode === 'view' ? 'Purchase Order Details' : 'Create Purchase Order' }}
            </h3>
            <button class="close-button" @click="close">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M15 5L5 15M5 5L15 15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
            </button>
          </div>

          <div class="modal-body">
            <div class="po-header">
              <div class="po-icon">
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                  <rect x="10" y="6" width="28" height="36" rx="2" stroke="currentColor" stroke-width="2.5"/>
                  <path d="M18 16H30M18 24H30M18 32H26" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
                </svg>
              </div>
              <div class="po-title-section">
                <h4 class="item-name">{{ translateProductName(backlogItem.item_name) }}</h4>
                <div class="item-sku">SKU: {{ backlogItem.item_sku }}</div>
              </div>
            </div>

            <!-- Loading state -->
            <div v-if="loading" class="state-message">Loading...</div>

            <!-- Error state -->
            <div v-else-if="error" class="state-message error">{{ error }}</div>

            <!-- Create mode: form -->
            <form v-else-if="mode === 'create'" class="po-form" @submit.prevent="submit">
              <div class="form-grid">
                <div class="form-field">
                  <label class="form-label" for="po-supplier">Supplier Name</label>
                  <input
                    id="po-supplier"
                    v-model="form.supplier_name"
                    type="text"
                    class="form-input"
                    placeholder="Enter supplier name"
                    required
                  />
                </div>

                <div class="form-field">
                  <label class="form-label" for="po-quantity">Quantity</label>
                  <input
                    id="po-quantity"
                    v-model.number="form.quantity"
                    type="number"
                    min="1"
                    class="form-input"
                    required
                  />
                </div>

                <div class="form-field">
                  <label class="form-label" for="po-unit-cost">Unit Cost</label>
                  <input
                    id="po-unit-cost"
                    v-model.number="form.unit_cost"
                    type="number"
                    min="0"
                    step="0.01"
                    class="form-input"
                    placeholder="0.00"
                    required
                  />
                </div>

                <div class="form-field">
                  <label class="form-label" for="po-delivery">Expected Delivery Date</label>
                  <input
                    id="po-delivery"
                    v-model="form.expected_delivery_date"
                    type="date"
                    class="form-input"
                    required
                  />
                </div>

                <div class="form-field full-width">
                  <label class="form-label" for="po-notes">Notes (optional)</label>
                  <textarea
                    id="po-notes"
                    v-model="form.notes"
                    class="form-textarea"
                    rows="3"
                    placeholder="Add any additional notes"
                  ></textarea>
                </div>
              </div>
            </form>

            <!-- View mode: read-only details -->
            <div v-else-if="mode === 'view' && purchaseOrder" class="info-grid">
              <div class="info-item">
                <div class="info-label">Purchase Order ID</div>
                <div class="info-value order-id">{{ purchaseOrder.id }}</div>
              </div>

              <div class="info-item">
                <div class="info-label">Supplier</div>
                <div class="info-value">{{ purchaseOrder.supplier_name }}</div>
              </div>

              <div class="info-item">
                <div class="info-label">Quantity</div>
                <div class="info-value">{{ purchaseOrder.quantity }} units</div>
              </div>

              <div class="info-item">
                <div class="info-label">Unit Cost</div>
                <div class="info-value">{{ formatCurrency(purchaseOrder.unit_cost) }}</div>
              </div>

              <div class="info-item">
                <div class="info-label">Expected Delivery</div>
                <div class="info-value">{{ formatDate(purchaseOrder.expected_delivery_date) }}</div>
              </div>

              <div class="info-item">
                <div class="info-label">Status</div>
                <div class="info-value">
                  <span class="badge" :class="getStatusBadge(purchaseOrder.status)">
                    {{ purchaseOrder.status }}
                  </span>
                </div>
              </div>

              <div class="info-item">
                <div class="info-label">Created Date</div>
                <div class="info-value">{{ formatDate(purchaseOrder.created_date) }}</div>
              </div>

              <div class="info-item full-width">
                <div class="info-label">Notes</div>
                <div class="info-value">{{ purchaseOrder.notes || 'N/A' }}</div>
              </div>
            </div>

            <!-- View mode: no PO found -->
            <div v-else class="state-message">No purchase order found for this item.</div>
          </div>

          <div class="modal-footer">
            <button class="btn-secondary" @click="close">Close</button>
            <button
              v-if="mode === 'create'"
              class="btn-primary"
              :disabled="!canSubmit || submitting"
              @click="submit"
            >
              {{ submitting ? 'Creating...' : 'Create PO' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { api } from '../api'
import { useI18n } from '../composables/useI18n'

const { translateProductName } = useI18n()

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false
  },
  backlogItem: {
    type: Object,
    default: null
  },
  mode: {
    type: String,
    default: 'create'
  }
})

const emit = defineEmits(['close', 'po-created'])

const loading = ref(false)
const error = ref(null)
const submitting = ref(false)
const purchaseOrder = ref(null)

const form = ref({
  supplier_name: '',
  quantity: 0,
  unit_cost: 0,
  expected_delivery_date: '',
  notes: ''
})

// Default quantity to the shortage (needed - available), falling back to needed.
const defaultQuantity = (item) => {
  if (!item) return 1
  const shortage = (item.quantity_needed || 0) - (item.quantity_available || 0)
  return shortage > 0 ? shortage : (item.quantity_needed || 1)
}

const resetForm = () => {
  form.value = {
    supplier_name: '',
    quantity: defaultQuantity(props.backlogItem),
    unit_cost: 0,
    expected_delivery_date: '',
    notes: ''
  }
}

const canSubmit = computed(() => {
  return (
    form.value.supplier_name.trim() !== '' &&
    form.value.quantity > 0 &&
    form.value.unit_cost >= 0 &&
    form.value.expected_delivery_date !== ''
  )
})

const loadPurchaseOrder = async () => {
  if (!props.backlogItem) return
  loading.value = true
  error.value = null
  purchaseOrder.value = null
  try {
    purchaseOrder.value = await api.getPurchaseOrderByBacklogItem(props.backlogItem.id)
  } catch (err) {
    // 404 means no PO exists yet; handle gracefully rather than as an error.
    if (err.response && err.response.status === 404) {
      purchaseOrder.value = null
    } else {
      error.value = 'Failed to load purchase order'
      console.error('Load PO error:', err)
    }
  } finally {
    loading.value = false
  }
}

const submit = async () => {
  if (!canSubmit.value || submitting.value || !props.backlogItem) return
  submitting.value = true
  error.value = null
  try {
    const result = await api.createPurchaseOrder({
      backlog_item_id: props.backlogItem.id,
      supplier_name: form.value.supplier_name,
      quantity: form.value.quantity,
      unit_cost: form.value.unit_cost,
      expected_delivery_date: form.value.expected_delivery_date,
      notes: form.value.notes
    })
    emit('po-created', result)
    emit('close')
  } catch (err) {
    error.value = 'Failed to create purchase order'
    console.error('Create PO error:', err)
  } finally {
    submitting.value = false
  }
}

const close = () => {
  emit('close')
}

// React to the modal opening: in create mode reset the form, in view mode fetch the PO.
watch(
  () => props.isOpen,
  (open) => {
    if (!open) return
    error.value = null
    if (props.mode === 'view') {
      loadPurchaseOrder()
    } else {
      resetForm()
    }
  }
)

const formatDate = (dateString) => {
  if (!dateString) return 'N/A'
  const date = new Date(dateString)
  if (isNaN(date.getTime())) return 'N/A'
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

const formatCurrency = (value) => {
  if (value === null || value === undefined) return 'N/A'
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD'
  })
}

const getStatusBadge = (status) => {
  const normalized = (status || '').toLowerCase()
  if (normalized === 'delivered' || normalized === 'completed') return 'success'
  if (normalized === 'pending') return 'warning'
  if (normalized === 'ordered' || normalized === 'shipped') return 'info'
  if (normalized === 'cancelled') return 'danger'
  return 'info'
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  padding: 1rem;
}

.modal-container {
  background: white;
  border-radius: 12px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.15);
  max-width: 700px;
  width: 100%;
  max-height: 90vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.5rem;
  border-bottom: 1px solid #e2e8f0;
}

.modal-title {
  font-size: 1.25rem;
  font-weight: 700;
  color: #0f172a;
  letter-spacing: -0.025em;
}

.close-button {
  background: none;
  border: none;
  color: #64748b;
  cursor: pointer;
  padding: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  transition: all 0.15s ease;
}

.close-button:hover {
  background: #f1f5f9;
  color: #0f172a;
}

.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 2rem;
}

.po-header {
  display: flex;
  align-items: center;
  gap: 1.25rem;
  padding-bottom: 1.5rem;
  border-bottom: 1px solid #e2e8f0;
  margin-bottom: 1.5rem;
}

.po-icon {
  width: 64px;
  height: 64px;
  background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  flex-shrink: 0;
}

.po-title-section {
  flex: 1;
  min-width: 0;
}

.item-name {
  font-size: 1.5rem;
  font-weight: 700;
  color: #0f172a;
  margin: 0 0 0.5rem 0;
}

.item-sku {
  font-size: 0.875rem;
  color: #64748b;
  font-family: 'Monaco', 'Courier New', monospace;
}

.state-message {
  padding: 2rem 0;
  text-align: center;
  font-size: 0.938rem;
  color: #64748b;
}

.state-message.error {
  color: #dc2626;
}

.po-form {
  width: 100%;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1.5rem;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.form-field.full-width {
  grid-column: 1 / -1;
}

.form-label {
  font-size: 0.813rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #64748b;
}

.form-input,
.form-textarea {
  padding: 0.625rem 0.75rem;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 0.938rem;
  color: #0f172a;
  font-family: inherit;
  transition: all 0.15s ease;
}

.form-input:focus,
.form-textarea:focus {
  outline: none;
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
}

.form-textarea {
  resize: vertical;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1.5rem;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.info-item.full-width {
  grid-column: 1 / -1;
}

.info-label {
  font-size: 0.813rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #64748b;
}

.info-value {
  font-size: 0.938rem;
  color: #0f172a;
  font-weight: 500;
}

.info-value.order-id {
  font-family: 'Monaco', 'Courier New', monospace;
  color: #2563eb;
}

.badge {
  display: inline-block;
  padding: 0.25rem 0.625rem;
  border-radius: 6px;
  font-size: 0.813rem;
  font-weight: 600;
}

.badge.success {
  background: #dcfce7;
  color: #166534;
}

.badge.warning {
  background: #fef3c7;
  color: #92400e;
}

.badge.info {
  background: #dbeafe;
  color: #1e40af;
}

.badge.danger {
  background: #fecaca;
  color: #991b1b;
}

.modal-footer {
  padding: 1.5rem;
  border-top: 1px solid #e2e8f0;
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
}

.btn-secondary {
  padding: 0.625rem 1.25rem;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-weight: 500;
  font-size: 0.875rem;
  color: #334155;
  cursor: pointer;
  transition: all 0.15s ease;
  font-family: inherit;
}

.btn-secondary:hover {
  background: #e2e8f0;
  border-color: #cbd5e1;
}

.btn-primary {
  padding: 0.625rem 1.25rem;
  background: #2563eb;
  border: 1px solid #2563eb;
  border-radius: 8px;
  font-weight: 500;
  font-size: 0.875rem;
  color: white;
  cursor: pointer;
  transition: all 0.15s ease;
  font-family: inherit;
}

.btn-primary:hover:not(:disabled) {
  background: #1d4ed8;
  border-color: #1d4ed8;
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Modal transition animations */
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-active .modal-container,
.modal-leave-active .modal-container {
  transition: transform 0.2s ease;
}

.modal-enter-from .modal-container,
.modal-leave-to .modal-container {
  transform: scale(0.95);
}
</style>

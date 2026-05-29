import { ref, computed } from 'vue'

// Shared submitted-restocking-order state (singleton pattern, like useFilters).
// Orders submitted from the Restocking view are held here in memory so the
// Orders view can render them in a "Submitted Orders" section. Not persisted:
// a page refresh clears them (mirrors the app's in-memory backend data model).
const submittedOrders = ref([])

export function useRestocking() {
  // Newest order first
  const submitOrder = (order) => {
    submittedOrders.value.unshift(order)
  }

  const submittedCount = computed(() => submittedOrders.value.length)

  return {
    // State
    submittedOrders,

    // Computed
    submittedCount,

    // Methods
    submitOrder
  }
}

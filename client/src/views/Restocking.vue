<template>
  <div class="restocking">
    <div class="page-header">
      <h2>{{ t('restocking.title') }}</h2>
      <p>{{ t('restocking.description') }}</p>
    </div>

    <div v-if="loading" class="loading">{{ t('common.loading') }}</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else>
      <!-- Budget control -->
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">{{ t('restocking.budgetLabel') }}</h3>
          <span class="budget-amount">{{ currencySymbol }}{{ budget.toLocaleString() }}</span>
        </div>
        <div class="budget-control">
          <span class="budget-min">{{ currencySymbol }}0</span>
          <input
            type="range"
            class="budget-slider"
            min="0"
            :max="maxBudget"
            step="50"
            v-model.number="budget"
          />
          <span class="budget-max">{{ currencySymbol }}{{ maxBudget.toLocaleString() }}</span>
        </div>
        <div class="budget-meta">
          <div class="budget-stat">
            <span class="budget-stat-label">{{ t('restocking.itemsFit', { fit: recommendations.length, total: candidates.length }) }}</span>
          </div>
          <div class="budget-stat">
            <span class="budget-stat-label">{{ t('restocking.totalCost') }}</span>
            <span class="budget-stat-value">{{ currencySymbol }}{{ totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}</span>
          </div>
          <div class="budget-stat">
            <span class="budget-stat-label">{{ t('restocking.remainingBudget') }}</span>
            <span class="budget-stat-value remaining">{{ currencySymbol }}{{ remainingBudget.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}</span>
          </div>
        </div>
      </div>

      <!-- Recommendations -->
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">{{ t('restocking.recommendedItems') }}</h3>
        </div>

        <div v-if="candidates.length === 0" class="empty-note">
          {{ t('restocking.noItems') }}
        </div>
        <div v-else-if="recommendations.length === 0" class="empty-note">
          {{ t('restocking.budgetTooLow') }}
        </div>
        <div v-else class="table-container">
          <table class="restock-table">
            <thead>
              <tr>
                <th>{{ t('restocking.table.sku') }}</th>
                <th>{{ t('restocking.table.itemName') }}</th>
                <th>{{ t('restocking.table.trend') }}</th>
                <th class="num">{{ t('restocking.table.restockQty') }}</th>
                <th class="num">{{ t('restocking.table.unitCost') }}</th>
                <th class="num">{{ t('restocking.table.leadTime') }}</th>
                <th class="num">{{ t('restocking.table.lineTotal') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in recommendations" :key="item.item_sku">
                <td><strong>{{ item.item_sku }}</strong></td>
                <td>{{ item.item_name }}</td>
                <td>
                  <span :class="['badge', item.trend]">{{ t(`trends.${item.trend}`) }}</span>
                </td>
                <td class="num">{{ item.shortfall.toLocaleString() }}</td>
                <td class="num">{{ currencySymbol }}{{ item.unit_cost.toFixed(2) }}</td>
                <td class="num">{{ t('restocking.daysCount', { count: item.leadTime }) }}</td>
                <td class="num"><strong>{{ currencySymbol }}{{ item.lineCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}</strong></td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td colspan="6" class="num foot-label">{{ t('restocking.totalCost') }}</td>
                <td class="num"><strong>{{ currencySymbol }}{{ totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}</strong></td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div class="actions">
          <button
            class="btn-primary"
            :disabled="recommendations.length === 0"
            @click="placeOrder"
          >
            {{ t('restocking.placeOrder') }}
          </button>
        </div>

        <div v-if="lastOrderNumber" class="success-note">
          {{ t('restocking.orderSubmitted', { orderNumber: lastOrderNumber }) }}
          <router-link to="/orders" class="success-link">{{ t('restocking.viewInOrders') }}</router-link>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed, onMounted } from 'vue'
import { api } from '../api'
import { useI18n } from '../composables/useI18n'
import { useRestocking } from '../composables/useRestocking'

// Lead time (in days) by demand trend: faster restock for items in higher demand.
const LEAD_TIME_BY_TREND = {
  increasing: 7,
  stable: 14,
  decreasing: 21
}
// Recommendation priority: restock rising demand first.
const TREND_RANK = {
  increasing: 0,
  stable: 1,
  decreasing: 2
}

export default {
  name: 'Restocking',
  setup() {
    const { t, currentCurrency } = useI18n()
    const { submitOrder, submittedCount } = useRestocking()

    const currencySymbol = computed(() => (currentCurrency.value === 'JPY' ? '¥' : '$'))

    const loading = ref(true)
    const error = ref(null)
    const forecasts = ref([])
    const budget = ref(0)
    const lastOrderNumber = ref(null)

    // Items that actually need restocking (projected shortfall > 0), enriched
    // with shortfall quantity, line cost, and trend-derived lead time. Sorted by
    // restock priority (trend, then larger shortfall first).
    const candidates = computed(() => {
      return forecasts.value
        .map(f => {
          const shortfall = Math.max(f.forecasted_demand - f.current_demand, 0)
          return {
            ...f,
            shortfall,
            lineCost: shortfall * f.unit_cost,
            leadTime: LEAD_TIME_BY_TREND[f.trend] ?? 14
          }
        })
        .filter(c => c.shortfall > 0)
        .sort((a, b) => {
          const rank = (TREND_RANK[a.trend] ?? 1) - (TREND_RANK[b.trend] ?? 1)
          return rank !== 0 ? rank : b.shortfall - a.shortfall
        })
    })

    // Highest budget worth offering: cost to cover every shortfall, rounded up
    // to a clean step so the slider has sensible bounds.
    const maxBudget = computed(() => {
      const total = candidates.value.reduce((sum, c) => sum + c.lineCost, 0)
      return Math.ceil(total / 500) * 500
    })

    // Greedy fill: walk candidates in priority order, include each line whose
    // cost keeps the running total within budget (skip an overflowing line but
    // keep testing smaller later ones).
    const recommendations = computed(() => {
      let cumulative = 0
      const picked = []
      for (const c of candidates.value) {
        if (cumulative + c.lineCost <= budget.value) {
          picked.push(c)
          cumulative += c.lineCost
        }
      }
      return picked
    })

    const totalCost = computed(() =>
      recommendations.value.reduce((sum, r) => sum + r.lineCost, 0)
    )

    const remainingBudget = computed(() => budget.value - totalCost.value)

    const loadForecasts = async () => {
      try {
        loading.value = true
        forecasts.value = await api.getDemandForecasts()
        // Default the slider to half of full coverage so the demo opens on a
        // partial recommendation the user can widen or narrow.
        budget.value = Math.round(maxBudget.value / 2 / 50) * 50
      } catch (err) {
        error.value = 'Failed to load demand forecasts: ' + err.message
      } finally {
        loading.value = false
      }
    }

    const placeOrder = () => {
      if (recommendations.value.length === 0) return

      const now = new Date()
      const leadTimeDays = recommendations.value.reduce(
        (max, r) => Math.max(max, r.leadTime),
        0
      )
      const expected = new Date(now)
      expected.setDate(expected.getDate() + leadTimeDays)

      const yy = String(now.getFullYear()).slice(2)
      const mm = String(now.getMonth() + 1).padStart(2, '0')
      const dd = String(now.getDate()).padStart(2, '0')
      const seq = String(submittedCount.value + 1).padStart(3, '0')
      const orderNumber = `RST-${yy}${mm}${dd}-${seq}`

      const order = {
        id: `rst-${now.getTime()}`,
        order_number: orderNumber,
        customer: t('restocking.internalCustomer'),
        items: recommendations.value.map(r => ({
          sku: r.item_sku,
          name: r.item_name,
          quantity: r.shortfall,
          unit_price: r.unit_cost
        })),
        status: 'Submitted',
        warehouse: null,
        category: null,
        order_date: now.toISOString(),
        lead_time_days: leadTimeDays,
        expected_delivery: expected.toISOString(),
        total_value: totalCost.value
      }

      submitOrder(order)
      lastOrderNumber.value = orderNumber
    }

    onMounted(loadForecasts)

    return {
      t,
      loading,
      error,
      budget,
      maxBudget,
      candidates,
      recommendations,
      totalCost,
      remainingBudget,
      currencySymbol,
      lastOrderNumber,
      placeOrder
    }
  }
}
</script>

<style scoped>
.budget-amount {
  font-size: 1.5rem;
  font-weight: 700;
  color: #2563eb;
  letter-spacing: -0.025em;
}

.budget-control {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.5rem 0 1.25rem;
}

.budget-min,
.budget-max {
  font-size: 0.813rem;
  color: #64748b;
  font-weight: 600;
  white-space: nowrap;
}

.budget-slider {
  flex: 1;
  -webkit-appearance: none;
  appearance: none;
  height: 6px;
  border-radius: 3px;
  background: #e2e8f0;
  outline: none;
  cursor: pointer;
}

.budget-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #2563eb;
  border: 3px solid #ffffff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
  cursor: pointer;
}

.budget-slider::-moz-range-thumb {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #2563eb;
  border: 3px solid #ffffff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
  cursor: pointer;
}

.budget-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 2rem;
  padding-top: 1rem;
  border-top: 1px solid #e2e8f0;
}

.budget-stat {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.budget-stat-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.budget-stat-value {
  font-size: 1.125rem;
  font-weight: 700;
  color: #0f172a;
}

.budget-stat-value.remaining {
  color: #059669;
}

.restock-table {
  width: 100%;
}

.restock-table th.num,
.restock-table td.num {
  text-align: right;
}

.restock-table tfoot td {
  border-top: 2px solid #e2e8f0;
  padding-top: 0.75rem;
  font-size: 0.938rem;
}

.foot-label {
  color: #64748b;
  font-weight: 600;
  text-transform: uppercase;
  font-size: 0.75rem;
  letter-spacing: 0.05em;
}

.empty-note {
  text-align: center;
  padding: 2.5rem;
  color: #64748b;
  font-size: 0.938rem;
}

.actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 1.25rem;
}

.btn-primary {
  padding: 0.75rem 1.75rem;
  background: #2563eb;
  color: #ffffff;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  font-size: 0.938rem;
  cursor: pointer;
  transition: background 0.2s ease;
}

.btn-primary:hover:not(:disabled) {
  background: #1d4ed8;
}

.btn-primary:disabled {
  background: #cbd5e1;
  cursor: not-allowed;
}

.success-note {
  margin-top: 1rem;
  padding: 0.875rem 1.125rem;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 8px;
  color: #065f46;
  font-size: 0.938rem;
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.success-link {
  color: #2563eb;
  font-weight: 600;
  text-decoration: none;
}

.success-link:hover {
  text-decoration: underline;
}
</style>

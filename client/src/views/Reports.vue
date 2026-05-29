<template>
  <div class="reports">
    <div class="page-header">
      <h2>{{ t('reports.title') }}</h2>
      <p>{{ t('reports.description') }}</p>
    </div>

    <div v-if="loading" class="loading">{{ t('reports.loading') }}</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else>
      <!-- Quarterly Performance -->
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">{{ t('reports.quarterlyPerformance') }}</h3>
        </div>
        <div class="table-container">
          <table class="reports-table">
            <thead>
              <tr>
                <th>{{ t('reports.table.quarter') }}</th>
                <th>{{ t('reports.table.totalOrders') }}</th>
                <th>{{ t('reports.table.totalRevenue') }}</th>
                <th>{{ t('reports.table.avgOrderValue') }}</th>
                <th>{{ t('reports.table.fulfillmentRate') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in quarterlyRows" :key="row.quarter">
                <td><strong>{{ row.quarter }}</strong></td>
                <td>{{ row.totalOrders }}</td>
                <td>{{ row.totalRevenue }}</td>
                <td>{{ row.avgOrderValue }}</td>
                <td>
                  <span :class="row.fulfillmentClass">
                    {{ row.fulfillmentRate }}%
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Monthly Trends Chart -->
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">{{ t('reports.monthlyRevenueTrend') }}</h3>
        </div>
        <div class="chart-container">
          <div class="bar-chart">
            <div v-for="bar in monthlyBars" :key="bar.month" class="bar-wrapper">
              <div class="bar-container">
                <div
                  class="bar"
                  :style="{ height: bar.height + 'px' }"
                  :title="bar.revenueLabel"
                ></div>
              </div>
              <div class="bar-label">{{ bar.label }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Month-over-Month Comparison -->
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">{{ t('reports.monthOverMonth') }}</h3>
        </div>
        <div class="table-container">
          <table class="reports-table">
            <thead>
              <tr>
                <th>{{ t('reports.table.month') }}</th>
                <th>{{ t('reports.table.orders') }}</th>
                <th>{{ t('reports.table.revenue') }}</th>
                <th>{{ t('reports.table.change') }}</th>
                <th>{{ t('reports.table.growthRate') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in monthlyRows" :key="row.month">
                <td><strong>{{ row.label }}</strong></td>
                <td>{{ row.orderCount }}</td>
                <td>{{ row.revenue }}</td>
                <td>
                  <span v-if="row.hasPrevious" :class="row.changeClass">
                    {{ row.changeValue }}
                  </span>
                  <span v-else>-</span>
                </td>
                <td>
                  <span v-if="row.hasPrevious" :class="row.changeClass">
                    {{ row.growthRate }}
                  </span>
                  <span v-else>-</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Summary Stats -->
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-label">{{ t('reports.stats.totalRevenueYtd') }}</div>
          <div class="stat-value">{{ totalRevenueDisplay }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">{{ t('reports.stats.avgMonthlyRevenue') }}</div>
          <div class="stat-value">{{ avgMonthlyRevenueDisplay }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">{{ t('reports.stats.totalOrdersYtd') }}</div>
          <div class="stat-value">{{ totalOrders }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">{{ t('reports.stats.bestQuarter') }}</div>
          <div class="stat-value">{{ bestQuarter }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, onMounted, watch, computed } from 'vue'
import { api } from '../api'
import { useFilters } from '../composables/useFilters'
import { useI18n } from '../composables/useI18n'
import { formatCurrency } from '../utils/currency'

export default {
  name: 'Reports',
  setup() {
    const { t, currentCurrency, currentLocale } = useI18n()
    const loading = ref(true)
    const error = ref(null)
    const quarterlyData = ref([])
    const monthlyData = ref([])

    // Use shared filters
    const {
      selectedPeriod,
      selectedLocation,
      selectedCategory,
      selectedStatus,
      getCurrentFilters
    } = useFilters()

    const loadData = async () => {
      try {
        loading.value = true
        error.value = null
        const filters = getCurrentFilters()

        const [quarterly, monthly] = await Promise.all([
          api.getQuarterlyReports(filters),
          api.getMonthlyTrends(filters)
        ])

        quarterlyData.value = quarterly
        monthlyData.value = monthly
      } catch (err) {
        error.value = t('reports.loadError') + ': ' + err.message
        console.error('Failed to load reports:', err)
      } finally {
        loading.value = false
      }
    }

    // Locale-aware "Mon YYYY" label from a YYYY-MM string
    const formatMonth = (monthStr) => {
      const parts = (monthStr || '').split('-')
      const year = parseInt(parts[0], 10)
      const month = parseInt(parts[1], 10)
      const date = new Date(year, month - 1, 1)
      if (isNaN(date.getTime())) return monthStr
      const locale = currentLocale.value === 'ja' ? 'ja-JP' : 'en-US'
      return date.toLocaleDateString(locale, { month: 'short', year: 'numeric' })
    }

    const getFulfillmentClass = (rate) => {
      if (rate >= 90) return 'badge success'
      if (rate >= 75) return 'badge warning'
      return 'badge danger'
    }

    // Pre-formatted quarterly rows so the template reads cached values
    const quarterlyRows = computed(() => {
      return quarterlyData.value.map(q => ({
        quarter: q.quarter,
        totalOrders: q.total_orders,
        totalRevenue: formatCurrency(q.total_revenue, currentCurrency.value),
        avgOrderValue: formatCurrency(q.avg_order_value, currentCurrency.value),
        fulfillmentRate: q.fulfillment_rate,
        fulfillmentClass: getFulfillmentClass(q.fulfillment_rate)
      }))
    })

    // Hoist max revenue once so bar heights are O(n) overall
    const maxMonthlyRevenue = computed(() => {
      if (monthlyData.value.length === 0) return 0
      return Math.max(...monthlyData.value.map(m => m.revenue))
    })

    const monthlyBars = computed(() => {
      const max = maxMonthlyRevenue.value
      return monthlyData.value.map(m => ({
        month: m.month,
        label: formatMonth(m.month),
        height: max > 0 ? (m.revenue / max) * 200 : 0,
        revenueLabel: formatCurrency(m.revenue, currentCurrency.value)
      }))
    })

    const monthlyRows = computed(() => {
      return monthlyData.value.map((m, index) => {
        const previous = index > 0 ? monthlyData.value[index - 1].revenue : null
        const hasPrevious = previous !== null
        const change = hasPrevious ? m.revenue - previous : 0

        let changeValue = '-'
        let changeClass = ''
        let growthRate = '-'

        if (hasPrevious) {
          const magnitude = formatCurrency(Math.abs(change), currentCurrency.value)
          if (change > 0) {
            changeValue = '+' + magnitude
            changeClass = 'positive-change'
          } else if (change < 0) {
            changeValue = '-' + magnitude
            changeClass = 'negative-change'
          } else {
            changeValue = formatCurrency(0, currentCurrency.value)
          }

          if (previous === 0) {
            growthRate = t('reports.notAvailable')
          } else {
            const rate = (change / previous) * 100
            const sign = rate > 0 ? '+' : ''
            growthRate = sign + rate.toFixed(1) + '%'
          }
        }

        return {
          month: m.month,
          label: formatMonth(m.month),
          orderCount: m.order_count,
          revenue: formatCurrency(m.revenue, currentCurrency.value),
          hasPrevious,
          changeValue,
          changeClass,
          growthRate
        }
      })
    })

    // Summary stats derived from raw data
    const totalRevenue = computed(() => {
      return monthlyData.value.reduce((sum, m) => sum + m.revenue, 0)
    })

    const avgMonthlyRevenue = computed(() => {
      if (monthlyData.value.length === 0) return 0
      return totalRevenue.value / monthlyData.value.length
    })

    const totalOrders = computed(() => {
      return monthlyData.value.reduce((sum, m) => sum + m.order_count, 0)
    })

    const bestQuarter = computed(() => {
      let bestQ = ''
      let bestRevenue = 0
      quarterlyData.value.forEach(q => {
        if (q.total_revenue > bestRevenue) {
          bestRevenue = q.total_revenue
          bestQ = q.quarter
        }
      })
      return bestQ
    })

    const totalRevenueDisplay = computed(() => formatCurrency(totalRevenue.value, currentCurrency.value))
    const avgMonthlyRevenueDisplay = computed(() => formatCurrency(avgMonthlyRevenue.value, currentCurrency.value))

    // Watch for filter changes and reload data
    watch([selectedPeriod, selectedLocation, selectedCategory, selectedStatus], () => {
      loadData()
    })

    onMounted(loadData)

    return {
      t,
      loading,
      error,
      quarterlyRows,
      monthlyBars,
      monthlyRows,
      totalOrders,
      bestQuarter,
      totalRevenueDisplay,
      avgMonthlyRevenueDisplay
    }
  }
}
</script>

<style scoped>
.reports {
  padding: 0;
}

.card {
  background: white;
  border-radius: 12px;
  padding: 1.5rem;
  margin-bottom: 1.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.card-header {
  margin-bottom: 1.5rem;
}

.card-title {
  font-size: 1.25rem;
  font-weight: 600;
  color: #0f172a;
  margin: 0;
}

.reports-table {
  width: 100%;
  border-collapse: collapse;
}

.reports-table th {
  background: #f8fafc;
  padding: 0.75rem;
  text-align: left;
  font-weight: 600;
  color: #64748b;
  border-bottom: 2px solid #e2e8f0;
}

.reports-table td {
  padding: 0.75rem;
  border-bottom: 1px solid #e2e8f0;
}

.reports-table tr:hover {
  background: #f8fafc;
}

.chart-container {
  padding: 2rem 1rem;
  min-height: 300px;
}

.bar-chart {
  display: flex;
  align-items: flex-end;
  justify-content: space-around;
  height: 250px;
  gap: 0.5rem;
}

.bar-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
  max-width: 80px;
}

.bar-container {
  height: 200px;
  display: flex;
  align-items: flex-end;
  width: 100%;
}

.bar {
  width: 100%;
  background: linear-gradient(to top, #3b82f6, #60a5fa);
  border-radius: 4px 4px 0 0;
  transition: all 0.3s;
  cursor: pointer;
}

.bar:hover {
  background: linear-gradient(to top, #2563eb, #3b82f6);
}

.bar-label {
  font-size: 0.75rem;
  color: #64748b;
  text-align: center;
  transform: rotate(-45deg);
  white-space: nowrap;
  margin-top: 1.5rem;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 1rem;
  margin-top: 1.5rem;
}

.stat-card {
  background: white;
  border-radius: 12px;
  padding: 1.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  border-left: 4px solid #3b82f6;
}

.stat-label {
  font-size: 0.875rem;
  color: #64748b;
  margin-bottom: 0.5rem;
}

.stat-value {
  font-size: 1.875rem;
  font-weight: 700;
  color: #0f172a;
}

.badge {
  padding: 0.25rem 0.75rem;
  border-radius: 9999px;
  font-size: 0.875rem;
  font-weight: 500;
}

.badge.success {
  background: #dcfce7;
  color: #166534;
}

.badge.warning {
  background: #fef3c7;
  color: #92400e;
}

.badge.danger {
  background: #fee2e2;
  color: #991b1b;
}

.positive-change {
  color: #16a34a;
  font-weight: 600;
}

.negative-change {
  color: #dc2626;
  font-weight: 600;
}

.loading {
  text-align: center;
  padding: 3rem;
  color: #64748b;
}

.error {
  background: #fee2e2;
  color: #991b1b;
  padding: 1rem;
  border-radius: 8px;
  margin: 1rem 0;
}
</style>

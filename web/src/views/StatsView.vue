<template>
  <div class="page" v-loading="loading">
    <el-row :gutter="12" class="metric-row">
      <el-col :span="6">
        <el-card class="metric-card">
          <div class="metric-num">{{ dashboard ? dashboard.member_total : '-' }}</div>
          <div class="metric-label">在册会员</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="metric-card">
          <div class="metric-num warn">{{ dashboard ? dashboard.pending_count : '-' }}</div>
          <div class="metric-label">待审核</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="metric-card">
          <div class="metric-num">{{ dashboard ? dashboard.semester_activity_count : '-' }}</div>
          <div class="metric-label">本学期活动数</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="metric-card">
          <div class="metric-num">{{ avgRate }}</div>
          <div class="metric-label">平均出勤率</div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="12">
      <el-col :span="12">
        <el-card header="部门人数分布" class="chart-card">
          <div v-if="hasData('dept_distribution')" ref="pieRef" class="chart" />
          <el-empty v-else description="暂无数据" :image-size="60" />
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card header="近 6 个月活动与签到" class="chart-card">
          <div v-if="hasData('monthly_trend')" ref="trendRef" class="chart" />
          <el-empty v-else description="暂无数据" :image-size="60" />
        </el-card>
      </el-col>
    </el-row>
    <el-row :gutter="12">
      <el-col :span="12">
        <el-card header="近 10 场活动:报名 vs 签到" class="chart-card">
          <div v-if="hasData('activity_compare')" ref="compareRef" class="chart" />
          <el-empty v-else description="暂无数据" :image-size="60" />
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card header="本学期活跃度 Top10" class="chart-card">
          <div v-if="hasData('top_active')" ref="topRef" class="chart" />
          <el-empty v-else description="暂无数据" :image-size="60" />
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import * as echarts from 'echarts'
import { getDashboard } from '../api/stats'

const loading = ref(false)
const dashboard = ref(null)
const pieRef = ref(null)
const trendRef = ref(null)
const compareRef = ref(null)
const topRef = ref(null)

let charts = []

const avgRate = computed(() =>
  dashboard.value ? `${(dashboard.value.avg_attendance_rate * 100).toFixed(1)}%` : '-'
)

function hasData(key) {
  const arr = dashboard.value && dashboard.value[key]
  return !!(arr && arr.length)
}

onMounted(() => {
  window.addEventListener('resize', onResize)
  load()
})

async function load() {
  loading.value = true
  try {
    dashboard.value = await getDashboard()
    await nextTick()
    renderAll()
  } catch {
    // 拦截器已提示
  } finally {
    loading.value = false
  }
}

function makeChart(el, option) {
  const inst = echarts.init(el)
  inst.setOption(option)
  charts.push(inst)
}

function renderAll() {
  const d = dashboard.value
  if (!d) return

  if (hasData('dept_distribution') && pieRef.value) {
    makeChart(pieRef.value, {
      tooltip: { trigger: 'item', formatter: '{b}: {c} 人({d}%)' },
      legend: { bottom: 0, type: 'scroll' },
      series: [
        {
          type: 'pie',
          radius: ['38%', '62%'],
          center: ['50%', '44%'],
          label: { formatter: '{b} {c}' },
          data: d.dept_distribution.map((x) => ({ name: x.name, value: x.count }))
        }
      ]
    })
  }

  if (hasData('monthly_trend') && trendRef.value) {
    makeChart(trendRef.value, {
      tooltip: { trigger: 'axis' },
      legend: { top: 0 },
      grid: { left: 44, right: 44, top: 36, bottom: 28 },
      xAxis: { type: 'category', data: d.monthly_trend.map((x) => x.month) },
      yAxis: { type: 'value', minInterval: 1 },
      series: [
        { name: '活动数', type: 'bar', barMaxWidth: 32, data: d.monthly_trend.map((x) => x.activities) },
        { name: '签到人次', type: 'line', smooth: true, data: d.monthly_trend.map((x) => x.checkins) }
      ]
    })
  }

  if (hasData('activity_compare') && compareRef.value) {
    makeChart(compareRef.value, {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { top: 0 },
      grid: { left: 100, right: 30, top: 36, bottom: 28 },
      xAxis: { type: 'value', minInterval: 1 },
      yAxis: {
        type: 'category',
        inverse: true,
        data: d.activity_compare.map((x) => (x.title.length > 10 ? `${x.title.slice(0, 10)}…` : x.title))
      },
      series: [
        { name: '报名', type: 'bar', barMaxWidth: 14, data: d.activity_compare.map((x) => x.signups) },
        { name: '签到', type: 'bar', barMaxWidth: 14, data: d.activity_compare.map((x) => x.checkins) }
      ]
    })
  }

  if (hasData('top_active') && topRef.value) {
    // 升序排列,横向条形图第一名显示在最上方
    const sorted = [...d.top_active].sort((a, b) => a.checkin_count - b.checkin_count)
    makeChart(topRef.value, {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params) => {
          const p = params[0]
          const item = sorted[p.dataIndex]
          return `${item.name}(${item.dept_name || '未分配'}):${item.checkin_count} 次`
        }
      },
      grid: { left: 90, right: 40, top: 16, bottom: 28 },
      xAxis: { type: 'value', minInterval: 1 },
      yAxis: { type: 'category', data: sorted.map((x) => x.name) },
      series: [{ name: '签到次数', type: 'bar', barMaxWidth: 14, itemStyle: { color: '#67c23a' }, data: sorted.map((x) => x.checkin_count) }]
    })
  }
}

function onResize() {
  charts.forEach((c) => c.resize())
}

onUnmounted(() => {
  window.removeEventListener('resize', onResize)
  charts.forEach((c) => c.dispose())
  charts = []
})
</script>

<style scoped>
.metric-row {
  margin-bottom: 12px;
}
.metric-card {
  text-align: center;
}
.metric-num {
  font-size: 28px;
  font-weight: 600;
  color: #409eff;
}
.metric-num.warn {
  color: #e6a23c;
}
.metric-label {
  margin-top: 4px;
  color: #909399;
  font-size: 13px;
}
.chart-card {
  margin-bottom: 12px;
}
.chart {
  height: 320px;
}
</style>

<script setup>
import { ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { listSignups, signupsExportUrl, manualCheckin, undoCheckin } from '../api/activities'
import { downloadUrl } from '../utils/csvClient'
import { SIGNUP_STATUS_LABELS, fmtDateTime } from '../utils/format'

const props = defineProps({
  activityId: { type: [Number, String], required: true },
})

const rows = ref([])
const loading = ref(false)

async function load() {
  loading.value = true
  try {
    rows.value = await listSignups(props.activityId)
  } catch {
    // 拦截器已提示
  } finally {
    loading.value = false
  }
}
load()

async function onManual(row) {
  try {
    await ElMessageBox.confirm(`确认为 ${row.name}(${row.student_no}) 补签?`, '补签确认', { type: 'warning' })
  } catch {
    return
  }
  try {
    await manualCheckin(props.activityId, row.member_id)
    ElMessage.success('补签成功')
    load()
  } catch {
    // 拦截器已提示
  }
}

async function onUndo(row) {
  try {
    await ElMessageBox.confirm(`确认撤销 ${row.name}(${row.student_no}) 的签到?`, '撤销确认', { type: 'warning' })
  } catch {
    return
  }
  try {
    await undoCheckin(props.activityId, row.member_id)
    ElMessage.success('已撤销签到')
    load()
  } catch {
    // 拦截器已提示
  }
}

async function exportCsv() {
  try {
    await downloadUrl(signupsExportUrl(props.activityId), '活动名单.csv')
  } catch (e) {
    ElMessage.error(e && e.message ? e.message : '导出失败')
  }
}

function statusTag(row) {
  if (row.status === 'checked_in') return 'success'
  if (row.status === 'cancelled') return 'info'
  return 'danger' // 已报名未签到 → 标红提醒
}
</script>

<template>
  <el-card shadow="never">
    <template #header>
      <div class="roster-head">
        <span>报名 / 签到名单(共 {{ rows.length }} 条)</span>
        <el-button size="small" @click="exportCsv">⬇ 导出 CSV</el-button>
      </div>
    </template>
    <el-table :data="rows" v-loading="loading" size="small" :border="false">
      <el-table-column prop="student_no" label="学号" width="110" />
      <el-table-column prop="name" label="姓名" width="90" />
      <el-table-column prop="dept_name" label="部门" width="90">
        <template #default="{ row }">{{ row.dept_name || '未分配' }}</template>
      </el-table-column>
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag :type="statusTag(row)" size="small">{{ SIGNUP_STATUS_LABELS[row.status] }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="报名时间" width="150">
        <template #default="{ row }">{{ fmtDateTime(row.registered_at) }}</template>
      </el-table-column>
      <el-table-column label="签到时间" width="150">
        <template #default="{ row }">{{ row.checkin_at ? fmtDateTime(row.checkin_at) : '—' }}</template>
      </el-table-column>
      <el-table-column label="签到方式" width="90">
        <template #default="{ row }">
          {{ row.status === 'checked_in' ? (row.checkin_by_name ? `补签(${row.checkin_by_name})` : '本人') : '—' }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="130">
        <template #default="{ row }">
          <el-button
            v-if="row.status === 'registered'"
            type="primary"
            size="small"
            link
            @click="onManual(row)"
          >补签</el-button>
          <el-button
            v-if="row.status === 'checked_in'"
            type="warning"
            size="small"
            link
            @click="onUndo(row)"
          >撤销签到</el-button>
        </template>
      </el-table-column>
      <template #empty>
        <el-empty description="暂无报名记录" :image-size="60" />
      </template>
    </el-table>
  </el-card>
</template>

<style scoped>
.roster-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
</style>

<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { STATE_LABELS, STATE_TAG_TYPES, MY_STATUS_LABELS, fmtDateTime } from '../utils/format'

const props = defineProps({
  activity: { type: Object, required: true },
})

const router = useRouter()

const percent = computed(() => {
  const a = props.activity
  if (!a.capacity) return 0
  return Math.min(100, Math.round((a.signup_count / a.capacity) * 100))
})
</script>

<template>
  <el-card class="activity-card" shadow="hover" @click="router.push(`/activities/${activity.id}`)">
    <div class="card-head">
      <span class="title">{{ activity.title }}</span>
      <el-tag :type="STATE_TAG_TYPES[activity.state]" size="small">{{ STATE_LABELS[activity.state] }}</el-tag>
    </div>
    <div class="meta">🕐 {{ fmtDateTime(activity.start_time) }} ~ {{ fmtDateTime(activity.end_time) }}</div>
    <div class="meta">📍 {{ activity.location }} · 发布:{{ activity.created_by_name }}</div>
    <div class="progress-row">
      <el-progress
        v-if="activity.capacity > 0"
        :percentage="percent"
        :stroke-width="10"
        :format="() => `已报 ${activity.signup_count}/${activity.capacity}`"
        style="flex: 1"
      />
      <span v-else class="capacity-free">已报 {{ activity.signup_count }} / 不限</span>
      <el-tag v-if="activity.my_status && activity.my_status !== 'none'" type="success" size="small" effect="plain">
        {{ MY_STATUS_LABELS[activity.my_status] }}
      </el-tag>
    </div>
  </el-card>
</template>

<style scoped>
.activity-card {
  cursor: pointer;
  margin-bottom: 12px;
}
.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.title {
  font-weight: 600;
  font-size: 15px;
  color: #303133;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.meta {
  margin-top: 6px;
  color: #606266;
  font-size: 13px;
}
.progress-row {
  margin-top: 10px;
  display: flex;
  align-items: center;
  gap: 10px;
}
.capacity-free {
  color: #67c23a;
  font-size: 13px;
}
</style>

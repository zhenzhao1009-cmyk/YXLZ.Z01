<template>
  <div class="page">
    <el-card class="greet-card">
      <div class="greet-row">
        <div>
          <div class="greet-hello">你好,{{ auth.user && auth.user.name }}</div>
          <div class="greet-role">
            {{ roleText }}<template v-if="deptText"> · {{ deptText }}</template>
          </div>
        </div>
      </div>
    </el-card>

    <el-card class="block-card">
      <template #header>我的参与(本学期)</template>
      <div v-if="stats" class="stats-row">
        <div class="stats-item">
          <div class="stats-num">{{ stats.signup_count }}</div>
          <div class="stats-label">报名场次</div>
        </div>
        <div class="stats-item">
          <div class="stats-num">{{ stats.checkin_count }}</div>
          <div class="stats-label">签到次数</div>
        </div>
      </div>
      <el-empty v-else description="加载中" :image-size="60" />
    </el-card>

    <el-card class="block-card">
      <template #header>即将开始的活动</template>
      <template v-if="upcoming.length">
        <el-card v-for="a in upcoming" :key="a.id" shadow="never" class="mini-activity">
          <div class="mini-row">
            <div class="mini-main">
              <div class="mini-title">{{ a.title }}</div>
              <div class="mini-meta">{{ fmtDateTime(a.start_time) }}</div>
              <div class="mini-meta">地点:{{ a.location }}</div>
              <div class="mini-meta">报名:{{ a.signup_count }}/{{ a.capacity > 0 ? a.capacity : '不限' }}</div>
            </div>
            <el-button type="primary" @click="router.push(`/activities/${a.id}`)">去报名/查看</el-button>
          </div>
        </el-card>
      </template>
      <el-empty v-else description="暂无即将开始的活动" :image-size="80" />
    </el-card>

    <el-card class="block-card">
      <template #header>最新公告</template>
      <template v-if="announcements.length">
        <div v-for="n in announcements" :key="n.id" class="ann-row" @click="router.push(`/announcements/${n.id}`)">
          <span v-if="n.my_unread" class="unread-dot" />
          <span class="ann-title">{{ n.pinned ? '[置顶] ' : '' }}{{ n.title }}</span>
          <span v-if="n.require_confirm" class="ann-confirm">需确认</span>
          <span class="ann-time">{{ fmtDate(n.created_at) }}</span>
        </div>
      </template>
      <el-empty v-else description="暂无公告" :image-size="80" />
    </el-card>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { meApi } from '../api/auth'
import { listActivities } from '../api/activities'
import { listAnnouncements } from '../api/announcements'
import { auth } from '../store/auth'
import { fmtDateTime, fmtDate, ROLE_LABELS } from '../utils/format'

const router = useRouter()
const stats = ref(null)
const upcoming = ref([])
const announcements = ref([])

const roleText = computed(() => (auth.user ? ROLE_LABELS[auth.user.role] || auth.user.role : ''))
const deptText = computed(() => (auth.user && auth.user.dept_name) || '未分配部门')

onMounted(async () => {
  try {
    const data = await meApi()
    stats.value = data.my_stats || { signup_count: 0, checkin_count: 0 }
  } catch {
    // 拦截器已提示
  }
  try {
    const list = await listActivities({ state: 'upcoming' })
    // 接口按开始时间倒序返回,首页要展示"最近要开始"的三场
    upcoming.value = (list || [])
      .slice()
      .sort((x, y) => (x.start_time < y.start_time ? -1 : 1))
      .slice(0, 3)
  } catch {
    // 拦截器已提示
  }
  try {
    const data = await listAnnouncements({ pageSize: 3 })
    announcements.value = data.items || []
  } catch {
    // 拦截器已提示
  }
})
</script>

<style scoped>
.greet-card {
  margin-bottom: 12px;
}
.greet-hello {
  font-size: 18px;
  font-weight: 600;
  color: #303133;
}
.greet-role {
  margin-top: 4px;
  color: #909399;
  font-size: 13px;
}
.block-card {
  margin-bottom: 12px;
}
.stats-row {
  display: flex;
}
.stats-item {
  flex: 1;
  text-align: center;
}
.stats-num {
  font-size: 26px;
  font-weight: 600;
  color: #409eff;
}
.stats-label {
  margin-top: 4px;
  color: #909399;
  font-size: 13px;
}
.mini-activity {
  margin-bottom: 12px;
}
.mini-activity :deep(.el-card__body) {
  padding: 12px;
}
.mini-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.mini-title {
  font-weight: 600;
  color: #303133;
}
.mini-meta {
  margin-top: 2px;
  color: #909399;
  font-size: 13px;
}
.ann-row {
  display: flex;
  align-items: center;
  padding: 10px 4px;
  border-bottom: 1px solid #f0f0f0;
  cursor: pointer;
}
.ann-row:last-child {
  border-bottom: none;
}
.ann-row:hover .ann-title {
  color: #409eff;
}
.unread-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #f56c6c;
  margin-right: 8px;
  flex-shrink: 0;
}
.ann-title {
  flex: 1;
  color: #303133;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ann-confirm {
  color: #e6a23c;
  font-size: 12px;
  margin-right: 8px;
  flex-shrink: 0;
}
.ann-time {
  color: #c0c4cc;
  font-size: 12px;
  flex-shrink: 0;
}
</style>

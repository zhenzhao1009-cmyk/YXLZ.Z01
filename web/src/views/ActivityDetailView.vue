<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  activityDetail, updateActivity, cancelActivity, removeActivity,
  signupActivity, cancelSignup, checkinByCode, getCheckinQr,
} from '../api/activities'
import { auth } from '../store/auth'
import { STATE_LABELS, STATE_TAG_TYPES, fmtDateTime } from '../utils/format'
import CheckinCodeDialog from '../components/CheckinCodeDialog.vue'
import SignupRoster from '../components/SignupRoster.vue'
import MaterialPanel from '../components/MaterialPanel.vue'

const route = useRoute()
const router = useRouter()
const activityId = route.params.id

const activity = ref(null)
const loading = ref(false)

async function load() {
  loading.value = true
  try {
    activity.value = await activityDetail(activityId)
  } catch {
    // 拦截器已提示
  } finally {
    loading.value = false
  }
}

const isSuperAdmin = computed(() => auth.user && auth.user.role === 'super_admin')
const isAdminRole = computed(() => ['president', 'advisor', 'super_admin'].includes(auth.user && auth.user.role))
const isMinister = computed(() => auth.user && auth.user.role === 'minister')
const canManage = computed(() => !!(activity.value && activity.value.can_manage))
const state = computed(() => activity.value && activity.value.state)
const myStatus = computed(() => activity.value && activity.value.my_status)

// 我的操作区显隐规则(§9.3/§9.4);签到窗口 = [开始−30分钟, 结束],比 ongoing 更早开放
const checkinWindowOpen = computed(() => {
  if (!activity.value || activity.value.cancelled) return false
  const start = new Date(activity.value.start_time.replace(' ', 'T')).getTime()
  const end = new Date(activity.value.end_time.replace(' ', 'T')).getTime()
  const n = Date.now()
  return n >= start - 30 * 60000 && n <= end
})
const canSignup = computed(() => state.value === 'upcoming' && myStatus.value === 'none')
const canCancelSignup = computed(() => state.value === 'upcoming' && myStatus.value === 'registered')
const canCheckin = computed(() => checkinWindowOpen.value && (myStatus.value === 'none' || myStatus.value === 'registered'))
const checkedIn = computed(() => myStatus.value === 'checked_in')

async function onSignup() {
  try {
    await signupActivity(activityId)
    ElMessage.success('报名成功')
    load()
  } catch {
    // 拦截器已提示(满员/截止等)
  }
}

async function onCancelSignup() {
  try {
    await ElMessageBox.confirm('确认取消报名?名额将立即释放。', '取消报名', { type: 'warning' })
  } catch {
    return
  }
  try {
    await cancelSignup(activityId)
    ElMessage.success('已取消报名')
    load()
  } catch {
    // 拦截器已提示
  }
}

// 输码签到
const codeInput = ref('')
const checking = ref(false)

async function onCheckin() {
  if (!/^\d{6}$/.test(codeInput.value)) {
    ElMessage.warning('请输入 6 位数字签到码')
    return
  }
  checking.value = true
  try {
    await checkinByCode(activityId, codeInput.value)
    ElMessage.success('签到成功')
    codeInput.value = ''
    load()
  } catch {
    // 拦截器已提示(码错误/窗外等)
  } finally {
    checking.value = false
  }
}

// 管理区:签到码卡(30 秒轮询)
const qrCode = ref('')
const qrExpires = ref(0)
const codeDialogVisible = ref(false)
let qrTimer = null

async function refreshQr() {
  try {
    const data = await getCheckinQr(activityId)
    qrCode.value = data.code
    qrExpires.value = data.expires_in
  } catch {
    // 拦截器已提示
  }
}

function stopQr() {
  if (qrTimer) {
    clearInterval(qrTimer)
    qrTimer = null
  }
}

function startQr() {
  stopQr()
  refreshQr()
  qrTimer = setInterval(refreshQr, 30000)
}

onMounted(load)

// 详情加载完后,若可管理则启动轮询
const stopQrWatch = watch(canManage, (v) => {
  if (v) startQr()
  else stopQr()
}, { immediate: true })

onBeforeUnmount(() => {
  stopQr()
  stopQrWatch()
})

// 编辑活动(部长仅开始前;管理层随时)
const canEdit = computed(() => {
  if (!canManage.value) return false
  if (isMinister.value) return state.value === 'upcoming'
  return true
})
const editVisible = ref(false)
const editSubmitting = ref(false)
const editForm = reactive({ title: '', location: '', range: [], capacity: 0, description: '' })

function openEdit() {
  const a = activity.value
  editForm.title = a.title
  editForm.location = a.location
  editForm.range = [a.start_time, a.end_time]
  editForm.capacity = a.capacity
  editForm.description = a.description || ''
  editVisible.value = true
}

async function submitEdit() {
  if (!editForm.title.trim() || !editForm.location.trim()) {
    ElMessage.warning('请填写标题与地点')
    return
  }
  if (!editForm.range || editForm.range.length !== 2) {
    ElMessage.warning('请选择开始与结束时间')
    return
  }
  editSubmitting.value = true
  try {
    await updateActivity(activityId, {
      title: editForm.title.trim(),
      location: editForm.location.trim(),
      start_time: editForm.range[0],
      end_time: editForm.range[1],
      capacity: editForm.capacity,
      description: editForm.description,
    })
    ElMessage.success('已保存')
    editVisible.value = false
    load()
  } catch {
    // 拦截器已提示
  } finally {
    editSubmitting.value = false
  }
}

// 取消活动(软标记;已结束/已取消禁用)
const canCancelActivity = computed(() => canManage.value && state.value !== 'ended' && state.value !== 'cancelled')

async function onCancelActivity() {
  try {
    await ElMessageBox.confirm('确认取消该活动?报名记录将保留供追溯。', '取消活动', { type: 'warning' })
  } catch {
    return
  }
  try {
    await cancelActivity(activityId)
    ElMessage.success('活动已取消')
    load()
  } catch {
    // 拦截器已提示
  }
}

// 删除活动:管理层(§14.1)且零报名
const canDelete = computed(() => isAdminRole.value && activity.value && activity.value.signup_count === 0)

async function onDeleteActivity() {
  try {
    await ElMessageBox.confirm('确认物理删除该活动?该操作不可恢复。', '删除活动', { type: 'error' })
  } catch {
    return
  }
  try {
    await removeActivity(activityId)
    ElMessage.success('已删除')
    router.push('/activities')
  } catch {
    // 拦截器已提示
  }
}
</script>

<template>
  <div class="page" v-loading="loading">
    <template v-if="activity">
      <el-card shadow="never" class="info-card">
        <div class="info-head">
          <h2 class="info-title">{{ activity.title }}</h2>
          <el-tag :type="STATE_TAG_TYPES[state]">{{ STATE_LABELS[state] }}</el-tag>
        </div>
        <div class="info-grid">
          <div>🕐 时间:{{ fmtDateTime(activity.start_time) }} ~ {{ fmtDateTime(activity.end_time) }}</div>
          <div>📍 地点:{{ activity.location }}</div>
          <div>
            👥 报名:
            <template v-if="activity.capacity > 0">
              {{ activity.signup_count }}/{{ activity.capacity }}
              <el-progress
                :percentage="Math.min(100, Math.round((activity.signup_count / activity.capacity) * 100))"
                :stroke-width="8"
                style="width: 160px; display: inline-block; vertical-align: middle; margin-left: 8px"
              />
            </template>
            <template v-else>{{ activity.signup_count }} / 不限</template>
          </div>
          <div>✍️ 发布:{{ activity.created_by_name }}</div>
        </div>
        <div v-if="activity.description" class="info-desc">{{ activity.description }}</div>
      </el-card>

      <!-- 我的操作区 -->
      <el-card shadow="never" class="my-card" header="我的操作">
        <div v-if="checkedIn" class="checked-banner">✅ 你已签到</div>
        <template v-else>
          <div class="my-actions">
            <el-button v-if="canSignup" type="primary" size="large" @click="onSignup">立即报名</el-button>
            <el-button v-if="canCancelSignup" type="warning" size="large" @click="onCancelSignup">取消报名</el-button>
            <div v-if="canCheckin" class="checkin-box">
              <span class="checkin-label">输入 6 位签到码:</span>
              <el-input
                v-model="codeInput"
                maxlength="6"
                size="large"
                placeholder="000000"
                class="code-input"
                @keyup.enter="onCheckin"
              />
              <el-button type="success" size="large" :loading="checking" @click="onCheckin">签到</el-button>
            </div>
            <span v-if="!canSignup && !canCancelSignup && !canCheckin" class="muted">
              {{ state === 'upcoming' ? '报名后可在开始前取消' : state === 'ended' ? '活动已结束' : state === 'cancelled' ? '活动已取消' : '' }}
            </span>
          </div>
          <div class="muted tip-line">也可现场扫描投屏二维码直达签到页</div>
        </template>
      </el-card>

      <!-- 管理区(管理层 / 创建部长) -->
      <template v-if="canManage">
        <el-card shadow="never" class="admin-card">
          <template #header>管理区</template>
          <div class="code-card">
            <div class="code-show">
              <span class="code-num">{{ qrCode }}</span>
              <span class="code-expire">{{ qrExpires }}s 后刷新</span>
            </div>
            <el-button type="primary" size="large" @click="codeDialogVisible = true">🖥 全屏投屏签到码</el-button>
          </div>
          <div class="admin-actions">
            <el-button :disabled="!canEdit" @click="openEdit">编辑活动</el-button>
            <el-button :disabled="!canCancelActivity" type="warning" @click="onCancelActivity">取消活动</el-button>
            <el-button v-if="isAdminRole" :disabled="!canDelete" type="danger" @click="onDeleteActivity">删除活动</el-button>
            <span v-if="isMinister && state !== 'upcoming'" class="muted">活动开始后部长不可编辑</span>
          </div>
        </el-card>

        <SignupRoster :activity-id="activityId" class="gap" />
      </template>

      <!-- 材料归档:列表全员可见(§14.6),上传表单仅管理者(组件内控) -->
      <MaterialPanel :activity="activity" class="gap" />
    </template>

    <CheckinCodeDialog v-model="codeDialogVisible" :activity-id="activityId" />
  </div>
</template>

<style scoped>
.info-card {
  margin-bottom: 12px;
}
.info-head {
  display: flex;
  align-items: center;
  gap: 12px;
}
.info-title {
  margin: 0;
  font-size: 20px;
}
.info-grid {
  margin-top: 12px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 8px 16px;
  color: #606266;
  font-size: 14px;
}
.info-desc {
  margin-top: 12px;
  padding: 10px 12px;
  background: #f5f7fa;
  border-radius: 6px;
  white-space: pre-wrap;
  word-break: break-word;
  color: #303133;
  line-height: 1.7;
}
.my-card {
  margin-bottom: 12px;
}
.my-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.checkin-box {
  display: flex;
  align-items: center;
  gap: 10px;
}
.checkin-label {
  color: #606266;
}
.code-input {
  width: 160px;
}
.code-input :deep(input) {
  font-size: 22px;
  letter-spacing: 8px;
  text-align: center;
  font-weight: 600;
}
.checked-banner {
  color: #67c23a;
  font-size: 20px;
  font-weight: 600;
}
.muted {
  color: #909399;
  font-size: 13px;
}
.tip-line {
  margin-top: 8px;
}
.admin-card {
  margin-bottom: 12px;
}
.code-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 10px 14px;
  background: #ecf5ff;
  border-radius: 8px;
  margin-bottom: 12px;
}
.code-show {
  display: flex;
  align-items: baseline;
  gap: 10px;
}
.code-num {
  font-family: 'Courier New', monospace;
  font-size: 34px;
  font-weight: 700;
  letter-spacing: 8px;
  color: #409eff;
}
.code-expire {
  color: #909399;
  font-size: 13px;
}
.admin-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.gap {
  margin-bottom: 12px;
}
</style>

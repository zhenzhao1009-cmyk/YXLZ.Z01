<script setup>
// 独立移动签到页:扫码直达 /checkin/:id?code=XXXXXX,不套 AppLayout
// 未登录由路由守卫跳 /login?redirect=...(登录后回跳)
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { activityDetail, checkinByCode } from '../api/activities'
import { STATE_LABELS, fmtDateTime } from '../utils/format'

const route = useRoute()
const router = useRouter()
const activityId = route.params.id
const urlCode = String(route.query.code || '')

const activity = ref(null)
const loadError = ref('')
const submitting = ref(false)
// result: null=未提交 / 'success' / 'fail'
const result = ref(null)
const failMsg = ref('')
const manualCode = ref('')
const checkedInAt = ref(null)

// 迟到判定用服务端记录的签到时刻:幂等重试(重复扫码)不会误标迟到
const isLate = computed(() => {
  if (!activity.value || !checkedInAt.value) return false
  const start = new Date(activity.value.start_time.replace(' ', 'T')).getTime()
  return new Date(checkedInAt.value.replace(' ', 'T')).getTime() > start + 60000
})

onMounted(async () => {
  try {
    activity.value = await activityDetail(activityId)
  } catch (e) {
    loadError.value = '活动信息加载失败,请刷新重试'
  }
})

async function doCheckin(code) {
  if (!/^\d{6}$/.test(code)) {
    ElMessage.warning('请输入 6 位数字签到码')
    return
  }
  submitting.value = true
  try {
    const data = await checkinByCode(activityId, code)
    checkedInAt.value = (data && data.signup && data.signup.checkin_at) || null
    result.value = 'success'
  } catch (e) {
    const msg = (e && e.response && e.response.data && e.response.data.message) || '签到失败'
    result.value = 'fail'
    failMsg.value = msg
  } finally {
    submitting.value = false
  }
}

function retryManual() {
  if (!/^\d{6}$/.test(manualCode.value)) {
    ElMessage.warning('请输入 6 位数字签到码')
    return
  }
  doCheckin(manualCode.value)
}
</script>

<template>
  <div class="checkin-page">
    <template v-if="activity">
      <div class="act-card">
        <div class="act-title">{{ activity.title }}</div>
        <div class="act-meta">🕐 {{ fmtDateTime(activity.start_time) }} ~ {{ fmtDateTime(activity.end_time) }}</div>
        <div class="act-meta">📍 {{ activity.location }}</div>
        <div class="act-meta">状态:{{ STATE_LABELS[activity.state] }}</div>
      </div>

      <!-- 结果态:成功 -->
      <div v-if="result === 'success'" class="result-box">
        <div class="big-check">✓</div>
        <div class="result-title">
          签到成功
          <span v-if="isLate" class="late-tag">迟到</span>
        </div>
        <el-button type="primary" size="large" round @click="router.push(`/activities/${activityId}`)">
          查看活动详情
        </el-button>
      </div>

      <!-- 结果态:失败 + 手动输码兜底 -->
      <div v-else-if="result === 'fail'" class="result-box">
        <div class="fail-icon">✕</div>
        <div class="result-title fail">签到失败</div>
        <div class="fail-msg">{{ failMsg }}</div>
        <div class="manual-box">
          <div class="manual-label">手动输入签到码重试:</div>
          <div class="manual-row">
            <input
              v-model="manualCode"
              class="manual-input"
              maxlength="6"
              inputmode="numeric"
              placeholder="000000"
              @keyup.enter="retryManual"
            />
            <button class="manual-btn" :disabled="submitting" @click="retryManual">重试</button>
          </div>
        </div>
      </div>

      <!-- 初始态:确认签到 -->
      <div v-else class="result-box">
        <button class="big-btn" :disabled="submitting || !urlCode" @click="doCheckin(urlCode)">
          {{ submitting ? '签到中…' : '确认签到' }}
        </button>
        <div v-if="!urlCode" class="fail-msg">链接缺少签到码,请在下方手动输入</div>
        <div v-else class="act-meta">点击即完成签到</div>
        <div class="manual-box">
          <div class="manual-label">扫码不畅?手动输入签到码:</div>
          <div class="manual-row">
            <input
              v-model="manualCode"
              class="manual-input"
              maxlength="6"
              inputmode="numeric"
              placeholder="000000"
              @keyup.enter="retryManual"
            />
            <button class="manual-btn" :disabled="submitting" @click="retryManual">签到</button>
          </div>
        </div>
      </div>
    </template>

    <div v-else-if="loadError" class="result-box">
      <div class="fail-msg">{{ loadError }}</div>
    </div>
    <div v-else class="result-box">
      <div class="act-meta">加载中…</div>
    </div>
  </div>
</template>

<style scoped>
.checkin-page {
  min-height: 100vh;
  max-width: 480px;
  margin: 0 auto;
  padding: 24px 20px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.act-card {
  background: #fff;
  border-radius: 14px;
  padding: 20px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.06);
}
.act-title {
  font-size: 22px;
  font-weight: 700;
  color: #303133;
  margin-bottom: 10px;
}
.act-meta {
  color: #606266;
  font-size: 14px;
  margin-top: 4px;
}
.result-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  background: #fff;
  border-radius: 14px;
  padding: 32px 20px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.06);
}
.big-btn {
  width: 100%;
  padding: 18px 0;
  font-size: 22px;
  font-weight: 700;
  color: #fff;
  background: #409eff;
  border: none;
  border-radius: 48px;
  cursor: pointer;
}
.big-btn:active {
  background: #3a8ee6;
}
.big-btn:disabled {
  background: #a0cfff;
}
.big-check {
  width: 96px;
  height: 96px;
  border-radius: 50%;
  background: #67c23a;
  color: #fff;
  font-size: 56px;
  line-height: 96px;
  text-align: center;
  font-weight: 700;
}
.result-title {
  font-size: 24px;
  font-weight: 700;
  color: #303133;
  display: flex;
  align-items: center;
  gap: 8px;
}
.late-tag {
  background: #e6a23c;
  color: #fff;
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 10px;
}
.fail-icon {
  width: 96px;
  height: 96px;
  border-radius: 50%;
  background: #f56c6c;
  color: #fff;
  font-size: 48px;
  line-height: 96px;
  text-align: center;
  font-weight: 700;
}
.result-title.fail {
  color: #f56c6c;
}
.fail-msg {
  color: #909399;
  font-size: 14px;
  text-align: center;
}
.manual-box {
  width: 100%;
  margin-top: 8px;
  border-top: 1px dashed #ebeef5;
  padding-top: 16px;
}
.manual-label {
  color: #606266;
  font-size: 13px;
  margin-bottom: 8px;
}
.manual-row {
  display: flex;
  gap: 8px;
}
.manual-input {
  flex: 1;
  padding: 12px;
  font-size: 24px;
  letter-spacing: 8px;
  text-align: center;
  font-weight: 700;
  border: 1px solid #dcdfe6;
  border-radius: 10px;
  outline: none;
}
.manual-input:focus {
  border-color: #409eff;
}
.manual-btn {
  padding: 0 22px;
  font-size: 16px;
  background: #409eff;
  color: #fff;
  border: none;
  border-radius: 10px;
  cursor: pointer;
}
.manual-btn:disabled {
  background: #a0cfff;
}
</style>

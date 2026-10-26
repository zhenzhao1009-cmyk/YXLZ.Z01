<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import QRCode from 'qrcode'
import { getCheckinQr } from '../api/activities'

const props = defineProps({
  activityId: { type: [Number, String], required: true },
  modelValue: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue'])

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const qrDataUrl = ref('')
const code = ref('')
const expiresIn = ref(0)
const isFullscreen = ref(false)

let pollTimer = null
let tickTimer = null

async function refresh() {
  try {
    const data = await getCheckinQr(props.activityId)
    code.value = data.code
    expiresIn.value = data.expires_in
    qrDataUrl.value = await QRCode.toDataURL(data.url, { width: 300, margin: 1 })
  } catch {
    // 拦截器已提示
  }
}

function start() {
  if (pollTimer) return // watch 与 @open 都会触发,避免重复定时器
  refresh()
  pollTimer = setInterval(refresh, 30000) // 每 30 秒轮询刷新
  tickTimer = setInterval(() => {
    if (expiresIn.value > 0) expiresIn.value -= 1
  }, 1000)
}

function stop() {
  clearInterval(pollTimer)
  clearInterval(tickTimer)
  pollTimer = tickTimer = null
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
  isFullscreen.value = false
}

watch(visible, (v) => (v ? start() : stop()))
onMounted(() => {
  document.addEventListener('fullscreenchange', onFsChange)
})
onBeforeUnmount(() => {
  stop()
  document.removeEventListener('fullscreenchange', onFsChange)
})

function onFsChange() {
  isFullscreen.value = !!document.fullscreenElement
}

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen()
    } else {
      await document.documentElement.requestFullscreen()
    }
  } catch {
    // 部分浏览器/iframe 中不可用,忽略
  }
}
</script>

<template>
  <el-dialog v-model="visible" title="现场签到 · 投屏展示" fullscreen @closed="stop">
    <div class="qr-stage" :class="{ fs: isFullscreen }">
      <div class="qr-title">扫码签到</div>
      <img v-if="qrDataUrl" :src="qrDataUrl" alt="签到二维码" class="qr-img" />
      <div class="code-line">
        <span class="code">{{ code }}</span>
      </div>
      <div class="expire">本码 {{ expiresIn }} 秒后刷新 · 每 60 秒轮换 · 截图 2 分钟内失效</div>
      <div class="fs-bar">
        <el-button type="primary" size="large" @click="toggleFullscreen">
          {{ isFullscreen ? '退出全屏' : '🌐 浏览器全屏' }}
        </el-button>
        <el-button size="large" @click="visible = false">关闭</el-button>
      </div>
    </div>
  </el-dialog>
</template>

<style scoped>
.qr-stage {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 18px;
  padding: 20px;
  min-height: 80vh;
}
.qr-title {
  font-size: 30px;
  font-weight: 600;
}
.qr-img {
  width: 300px;
  height: 300px;
  border: 8px solid #fff;
  border-radius: 12px;
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.15);
}
.code {
  font-family: 'Courier New', monospace;
  font-size: 56px;
  font-weight: 700;
  letter-spacing: 16px;
  color: #409eff;
}
.expire {
  color: #909399;
  font-size: 14px;
}
/* 浏览器全屏时黑底大字,教室后排也看得清 */
.fs {
  background: #000;
  min-height: 100vh;
}
.fs .qr-title,
.fs .expire {
  color: #fff;
}
.fs .qr-img {
  width: 420px;
  height: 420px;
}
.fs .code {
  font-size: 96px;
  color: #fff;
}
</style>

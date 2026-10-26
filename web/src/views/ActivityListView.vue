<script setup>
import { computed, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { listActivities, createActivity } from '../api/activities'
import { auth } from '../store/auth'
import ActivityCard from '../components/ActivityCard.vue'

const TABS = [
  { label: '全部', value: '' },
  { label: '即将开始', value: 'upcoming' },
  { label: '进行中', value: 'ongoing' },
  { label: '已结束', value: 'ended' },
  { label: '已取消', value: 'cancelled' },
]

const ADMIN = ['president', 'advisor', 'super_admin']
const canPublish = computed(() => {
  const r = auth.user && auth.user.role
  return ADMIN.includes(r) || r === 'minister'
})

const activeTab = ref('')
const keyword = ref('')
const items = ref([])
const loading = ref(false)

async function load() {
  loading.value = true
  try {
    const params = {}
    if (activeTab.value) params.state = activeTab.value
    if (keyword.value.trim()) params.q = keyword.value.trim()
    items.value = await listActivities(params)
  } catch {
    // 拦截器已提示
  } finally {
    loading.value = false
  }
}
load()

// 发布活动表单
const dialogVisible = ref(false)
const submitting = ref(false)
const form = reactive({
  title: '',
  location: '',
  range: [],
  capacity: 0,
  description: '',
})

function openPublish() {
  form.title = ''
  form.location = ''
  form.range = []
  form.capacity = 0
  form.description = ''
  dialogVisible.value = true
}

async function submitPublish() {
  if (!form.title.trim() || !form.location.trim()) {
    ElMessage.warning('请填写标题与地点')
    return
  }
  if (!form.range || form.range.length !== 2) {
    ElMessage.warning('请选择开始与结束时间')
    return
  }
  submitting.value = true
  try {
    await createActivity({
      title: form.title.trim(),
      location: form.location.trim(),
      start_time: form.range[0],
      end_time: form.range[1],
      capacity: form.capacity,
      description: form.description,
    })
    ElMessage.success('活动已发布')
    dialogVisible.value = false
    load()
  } catch {
    // 拦截器已提示
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="page">
    <div class="toolbar">
      <el-tabs v-model="activeTab" @tab-change="load" style="flex: 1">
        <el-tab-pane v-for="t in TABS" :key="t.value" :label="t.label" :name="t.value" />
      </el-tabs>
      <div class="toolbar-right">
        <el-input
          v-model="keyword"
          placeholder="搜索活动标题"
          clearable
          style="width: 200px"
          @keyup.enter="load"
          @clear="load"
        />
        <el-button v-if="canPublish" type="primary" @click="openPublish">＋ 发布活动</el-button>
      </div>
    </div>

    <div v-loading="loading" class="card-list">
      <template v-if="items.length">
        <ActivityCard v-for="a in items" :key="a.id" :activity="a" />
      </template>
      <el-empty v-else description="没有符合条件的活动" />
    </div>

    <el-dialog v-model="dialogVisible" title="发布活动" width="520px">
      <el-form label-width="90px">
        <el-form-item label="标题" required>
          <el-input v-model="form.title" maxlength="60" placeholder="如:第11届校园健康跑" />
        </el-form-item>
        <el-form-item label="地点" required>
          <el-input v-model="form.location" maxlength="50" />
        </el-form-item>
        <el-form-item label="起止时间" required>
          <el-date-picker
            v-model="form.range"
            type="datetimerange"
            range-separator="至"
            start-placeholder="开始时间"
            end-placeholder="结束时间"
            format="YYYY-MM-DD HH:mm"
            value-format="YYYY-MM-DD HH:mm"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="容量">
          <el-input-number v-model="form.capacity" :min="0" :max="9999" />
          <span class="tip">0 = 不限名额</span>
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" :rows="4" maxlength="500" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitPublish">发布</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-bottom: 8px;
}
.tip {
  margin-left: 10px;
  color: #909399;
  font-size: 12px;
}
</style>

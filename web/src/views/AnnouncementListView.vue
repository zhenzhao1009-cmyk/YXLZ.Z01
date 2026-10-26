<script setup>
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  listAnnouncements, announcementDetail, createAnnouncement, updateAnnouncement, removeAnnouncement,
} from '../api/announcements'
import { auth } from '../store/auth'
import { fmtDateTime } from '../utils/format'

const router = useRouter()

const ADMIN = ['president', 'advisor', 'super_admin']
const isAdmin = computed(() => ADMIN.includes(auth.user && auth.user.role))

const items = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = 20
const loading = ref(false)

async function load() {
  loading.value = true
  try {
    const data = await listAnnouncements({ page: page.value, pageSize })
    items.value = data.items
    total.value = data.total
  } catch {
    // 拦截器已提示
  } finally {
    loading.value = false
  }
}
load()

function openDetail(row) {
  router.push(`/announcements/${row.id}`)
}

// 发布 / 编辑
const dialogVisible = ref(false)
const editingId = ref(null)
const submitting = ref(false)
const form = reactive({ title: '', content: '', pinned: false, require_confirm: false })

function openCreate() {
  editingId.value = null
  form.title = ''
  form.content = ''
  form.pinned = false
  form.require_confirm = false
  dialogVisible.value = true
}

function openEdit(row) {
  editingId.value = row.id
  form.title = row.title
  form.content = ''
  form.pinned = !!row.pinned
  form.require_confirm = !!row.require_confirm
  // 列表接口无 content,先拉详情补全;迟到响应不得覆盖已切换的编辑目标
  const targetId = row.id
  announcementDetail(targetId)
    .then((data) => {
      if (editingId.value === targetId) form.content = data.announcement.content
    })
    .catch(() => {
      // 拦截器已提示
    })
  dialogVisible.value = true
}

async function submit() {
  if (!form.title.trim() || !form.content.trim()) {
    ElMessage.warning('请填写标题与内容')
    return
  }
  submitting.value = true
  try {
    const payload = {
      title: form.title.trim(),
      content: form.content,
      pinned: form.pinned,
      require_confirm: form.require_confirm,
    }
    if (editingId.value) {
      await updateAnnouncement(editingId.value, payload)
      ElMessage.success('已保存')
    } else {
      await createAnnouncement(payload)
      ElMessage.success('公告已发布')
    }
    dialogVisible.value = false
    load()
  } catch {
    // 拦截器已提示
  } finally {
    submitting.value = false
  }
}

async function togglePin(row) {
  try {
    await updateAnnouncement(row.id, { pinned: row.pinned ? 0 : 1 })
    ElMessage.success(row.pinned ? '已取消置顶' : '已置顶')
    load()
  } catch {
    // 拦截器已提示
  }
}

async function onDelete(row) {
  try {
    await ElMessageBox.confirm(`确认删除公告「${row.title}」?`, '删除确认', { type: 'warning' })
  } catch {
    return
  }
  try {
    await removeAnnouncement(row.id)
    ElMessage.success('已删除')
    load()
  } catch {
    // 拦截器已提示
  }
}
</script>

<template>
  <div class="page">
    <div class="toolbar">
      <h2 class="page-title">公告</h2>
      <el-button v-if="isAdmin" type="primary" @click="openCreate">＋ 发布公告</el-button>
    </div>

    <div v-loading="loading" class="card-list">
      <template v-if="items.length">
        <el-card
          v-for="a in items"
          :key="a.id"
          shadow="hover"
          class="ann-card"
          @click="openDetail(a)"
        >
          <div class="ann-head">
            <el-tag v-if="a.pinned" type="danger" size="small" effect="dark">置顶</el-tag>
            <span v-if="a.my_unread" class="dot" />
            <span class="ann-title">{{ a.title }}</span>
            <el-tag v-if="a.require_confirm" type="warning" size="small" effect="plain">需确认</el-tag>
          </div>
          <div class="ann-meta">{{ a.published_by_name }} · {{ fmtDateTime(a.created_at) }}</div>
          <div v-if="isAdmin" class="ann-ops" @click.stop>
            <el-button size="small" link type="primary" @click="openEdit(a)">编辑</el-button>
            <el-button size="small" link type="primary" @click="togglePin(a)">
              {{ a.pinned ? '取消置顶' : '置顶' }}
            </el-button>
            <el-button size="small" link type="danger" @click="onDelete(a)">删除</el-button>
          </div>
        </el-card>
      </template>
      <el-empty v-else description="暂无公告" />
    </div>

    <el-pagination
      v-if="total > pageSize"
      v-model:current-page="page"
      :page-size="pageSize"
      :total="total"
      layout="prev, pager, next, total"
      style="margin-top: 12px; justify-content: center"
      @current-change="load"
    />

    <el-dialog v-model="dialogVisible" :title="editingId ? '编辑公告' : '发布公告'" width="560px">
      <el-form label-width="90px">
        <el-form-item label="标题" required>
          <el-input v-model="form.title" maxlength="80" />
        </el-form-item>
        <el-form-item label="内容" required>
          <el-input v-model="form.content" type="textarea" :rows="8" maxlength="2000" placeholder="纯文本,支持换行" />
        </el-form-item>
        <el-form-item label="置顶">
          <el-switch v-model="form.pinned" />
        </el-form-item>
        <el-form-item label="需确认">
          <el-switch v-model="form.require_confirm" />
          <span class="tip">开启后会员需点"我已知晓"才算已读</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submit">
          {{ editingId ? '保存' : '发布' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.page-title {
  margin: 0;
  font-size: 18px;
}
.ann-card {
  cursor: pointer;
  margin-bottom: 12px;
}
.ann-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #f56c6c;
  flex-shrink: 0;
}
.ann-title {
  font-weight: 600;
  font-size: 15px;
  color: #303133;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ann-meta {
  margin-top: 6px;
  color: #909399;
  font-size: 13px;
}
.ann-ops {
  margin-top: 8px;
}
.tip {
  margin-left: 10px;
  color: #909399;
  font-size: 12px;
}
</style>

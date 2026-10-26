<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  announcementDetail, confirmAnnouncement, updateAnnouncement, removeAnnouncement, listAnnouncementReads,
} from '../api/announcements'
import { auth } from '../store/auth'
import { fmtDateTime } from '../utils/format'

const route = useRoute()
const router = useRouter()
const announcementId = route.params.id

const announcement = ref(null)
const loading = ref(false)

const ADMIN = ['president', 'advisor', 'super_admin']
const isAdmin = computed(() => ADMIN.includes(auth.user && auth.user.role))

async function load() {
  loading.value = true
  try {
    const data = await announcementDetail(announcementId)
    announcement.value = data.announcement
  } catch {
    // 拦截器已提示
  } finally {
    loading.value = false
  }
}
onMounted(load)

const confirming = ref(false)

async function onConfirm() {
  confirming.value = true
  try {
    await confirmAnnouncement(announcementId)
    ElMessage.success('已确认')
    load()
  } catch {
    // 拦截器已提示
  } finally {
    confirming.value = false
  }
}

// 已读统计抽屉(管理层)
const drawerVisible = ref(false)
const reads = ref({ read: [], unread: [] })
const readsLoading = ref(false)

async function openReads() {
  drawerVisible.value = true
  readsLoading.value = true
  try {
    reads.value = await listAnnouncementReads(announcementId)
  } catch {
    // 拦截器已提示
  } finally {
    readsLoading.value = false
  }
}

async function copyUnread() {
  const text = reads.value.unread.map((u) => `${u.name}(${u.student_no})`).join('\n')
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success('未读名单已复制')
  } catch {
    ElMessage.error('复制失败,请手动选择复制')
  }
}

// 管理层编辑 / 删除
const editVisible = ref(false)
const editSubmitting = ref(false)
const form = reactive({ title: '', content: '', pinned: false, require_confirm: false })

function openEdit() {
  const a = announcement.value
  form.title = a.title
  form.content = a.content
  form.pinned = !!a.pinned
  form.require_confirm = !!a.require_confirm
  editVisible.value = true
}

async function submitEdit() {
  if (!form.title.trim() || !form.content.trim()) {
    ElMessage.warning('请填写标题与内容')
    return
  }
  editSubmitting.value = true
  try {
    await updateAnnouncement(announcementId, {
      title: form.title.trim(),
      content: form.content,
      pinned: form.pinned,
      require_confirm: form.require_confirm,
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

async function onDelete() {
  try {
    await ElMessageBox.confirm('确认删除该公告?', '删除确认', { type: 'warning' })
  } catch {
    return
  }
  try {
    await removeAnnouncement(announcementId)
    ElMessage.success('已删除')
    router.push('/announcements')
  } catch {
    // 拦截器已提示
  }
}
</script>

<template>
  <div class="page" v-loading="loading">
    <template v-if="announcement">
      <el-card shadow="never">
        <div class="detail-head">
          <div class="head-left">
            <el-tag v-if="announcement.pinned" type="danger" size="small" effect="dark">置顶</el-tag>
            <h2 class="detail-title">{{ announcement.title }}</h2>
          </div>
          <div v-if="isAdmin" class="head-ops">
            <el-button size="small" @click="openReads">已读统计</el-button>
            <el-button size="small" type="primary" @click="openEdit">编辑</el-button>
            <el-button size="small" type="danger" @click="onDelete">删除</el-button>
          </div>
        </div>
        <div class="detail-meta">
          {{ announcement.published_by_name }} · {{ fmtDateTime(announcement.created_at) }}
        </div>

        <el-alert
          v-if="announcement.require_confirm"
          :title="announcement.my_read ? '你已确认知晓此公告' : '此公告需要全体成员确认,阅读后请点击下方按钮'"
          :type="announcement.my_read ? 'success' : 'warning'"
          :closable="false"
          style="margin: 12px 0"
        />

        <div class="detail-content">{{ announcement.content }}</div>

        <div v-if="announcement.require_confirm" style="margin-top: 20px; text-align: center">
          <el-button
            v-if="!announcement.my_read"
            type="primary"
            size="large"
            :loading="confirming"
            @click="onConfirm"
          >我已知晓</el-button>
          <el-button v-else type="info" size="large" plain disabled>
            已知晓{{ announcement.my_read_at ? `(${fmtDateTime(announcement.my_read_at)})` : '' }}
          </el-button>
        </div>
      </el-card>
    </template>
    <el-empty v-else-if="!loading" description="公告不存在" />

    <!-- 已读统计抽屉 -->
    <el-drawer v-model="drawerVisible" title="已读统计" size="420px">
      <div v-loading="readsLoading">
        <div class="reads-summary">
          已读 {{ reads.read.length }} 人 / 未读 {{ reads.unread.length }} 人
          <el-button
            v-if="reads.unread.length"
            size="small"
            type="primary"
            style="margin-left: 12px"
            @click="copyUnread"
          >📋 一键复制未读名单</el-button>
        </div>
        <el-tabs>
          <el-tab-pane :label="`未读(${reads.unread.length})`">
            <el-table :data="reads.unread" size="small">
              <el-table-column prop="name" label="姓名" width="90" />
              <el-table-column prop="student_no" label="学号" width="110" />
              <el-table-column label="部门">
                <template #default="{ row }">{{ row.dept_name || '未分配' }}</template>
              </el-table-column>
              <template #empty>
                <el-empty description="全部已读 🎉" :image-size="60" />
              </template>
            </el-table>
          </el-tab-pane>
          <el-tab-pane :label="`已读(${reads.read.length})`">
            <el-table :data="reads.read" size="small">
              <el-table-column prop="name" label="姓名" width="90" />
              <el-table-column prop="student_no" label="学号" width="110" />
              <el-table-column label="部门">
                <template #default="{ row }">{{ row.dept_name || '未分配' }}</template>
              </el-table-column>
              <el-table-column label="时间" width="150">
                <template #default="{ row }">{{ fmtDateTime(row.read_at) }}</template>
              </el-table-column>
            </el-table>
          </el-tab-pane>
        </el-tabs>
      </div>
    </el-drawer>

    <!-- 编辑弹层 -->
    <el-dialog v-model="editVisible" title="编辑公告" width="560px">
      <el-form label-width="90px">
        <el-form-item label="标题" required>
          <el-input v-model="form.title" maxlength="80" />
        </el-form-item>
        <el-form-item label="内容" required>
          <el-input v-model="form.content" type="textarea" :rows="8" maxlength="2000" />
        </el-form-item>
        <el-form-item label="置顶">
          <el-switch v-model="form.pinned" />
        </el-form-item>
        <el-form-item label="需确认">
          <el-switch v-model="form.require_confirm" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" :loading="editSubmitting" @click="submitEdit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.detail-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.head-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.detail-title {
  margin: 0;
  font-size: 20px;
}
.detail-meta {
  margin-top: 8px;
  color: #909399;
  font-size: 13px;
}
.detail-content {
  margin-top: 16px;
  padding: 14px 16px;
  background: #f5f7fa;
  border-radius: 8px;
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.8;
  color: #303133;
}
.reads-summary {
  display: flex;
  align-items: center;
  margin-bottom: 12px;
  color: #606266;
}
</style>

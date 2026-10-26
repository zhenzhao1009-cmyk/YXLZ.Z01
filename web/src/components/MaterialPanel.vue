<script setup>
import { computed, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { listMaterials, uploadMaterial, materialDownloadUrl, removeMaterial } from '../api/activities'
import { downloadUrl } from '../utils/csvClient'
import { auth } from '../store/auth'
import { fmtDateTime } from '../utils/format'

const props = defineProps({
  activity: { type: Object, required: true }, // 含 id 与 can_manage
})

const ADMIN = ['president', 'advisor', 'super_admin']
const isAdmin = computed(() => ADMIN.includes(auth.user && auth.user.role))
const canManage = computed(() => !!props.activity.can_manage)

const CATEGORIES = ['策划书', '签到表', '照片', '总结', '其他']
const EXT_WHITELIST = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'zip', 'rar', 'txt', 'md']

const items = ref([])
const loading = ref(false)

async function load() {
  loading.value = true
  try {
    items.value = await listMaterials(props.activity.id)
  } catch {
    // 拦截器已提示
  } finally {
    loading.value = false
  }
}
load()

// 上传表单
const form = ref({ category: '其他', title: '', note: '' })
const fileRef = ref(null)
const fileInput = ref(null)
const uploading = ref(false)

function pickFile() {
  fileInput.value && fileInput.value.click()
}

function onFileChange(e) {
  const f = e.target.files && e.target.files[0]
  if (!f) return
  const ext = (f.name.split('.').pop() || '').toLowerCase()
  if (!EXT_WHITELIST.includes(ext)) {
    ElMessage.error(`不支持的文件类型 .${ext}`)
    e.target.value = ''
    return
  }
  if (f.size > 20 * 1024 * 1024) {
    ElMessage.error('文件大小不能超过 20MB')
    e.target.value = ''
    return
  }
  fileRef.value = f
}

function removeFile() {
  fileRef.value = null
  if (fileInput.value) fileInput.value.value = ''
}

async function submit() {
  if (!form.value.title.trim()) {
    ElMessage.warning('请填写材料标题')
    return
  }
  uploading.value = true
  try {
    const fd = new FormData()
    fd.append('category', form.value.category)
    fd.append('title', form.value.title.trim())
    if (form.value.note) fd.append('note', form.value.note)
    if (fileRef.value) fd.append('file', fileRef.value)
    await uploadMaterial(props.activity.id, fd)
    ElMessage.success('材料已归档')
    form.value = { category: '其他', title: '', note: '' }
    removeFile()
    load()
  } catch {
    // 拦截器已提示
  } finally {
    uploading.value = false
  }
}

function canDelete(m) {
  return isAdmin.value || (auth.user && m.uploader_id === auth.user.id)
}

async function onDelete(m) {
  try {
    await ElMessageBox.confirm(`确认删除材料「${m.title}」?附件文件将一并删除。`, '删除确认', { type: 'warning' })
  } catch {
    return
  }
  try {
    await removeMaterial(m.id)
    ElMessage.success('已删除')
    load()
  } catch {
    // 拦截器已提示
  }
}

async function download(m) {
  try {
    await downloadUrl(materialDownloadUrl(m.id), m.file_name || '附件')
  } catch (e) {
    ElMessage.error(e && e.message ? e.message : '下载失败')
  }
}

function fmtSize(n) {
  if (!n) return ''
  if (n >= 1048576) return `${(n / 1048576).toFixed(1)}MB`
  return `${Math.round(n / 1024)}KB`
}
</script>

<template>
  <el-card shadow="never">
    <template #header>活动材料归档</template>

    <div v-loading="loading">
      <div v-if="!items.length" class="empty-tip">暂无归档材料</div>
      <div v-for="m in items" :key="m.id" class="material-item">
        <div class="m-line">
          <el-tag size="small" effect="plain">{{ m.category }}</el-tag>
          <span class="m-title">{{ m.title }}</span>
          <el-tag v-if="!m.file_path" size="small" type="info" effect="plain">文字记录</el-tag>
        </div>
        <div v-if="m.note" class="m-note">{{ m.note }}</div>
        <div class="m-meta">
          {{ m.uploader_name }} · {{ fmtDateTime(m.created_at) }}
          <template v-if="m.file_name"> · {{ m.file_name }}<template v-if="m.file_size"> ({{ fmtSize(m.file_size) }})</template></template>
          <span class="m-ops">
            <el-button v-if="m.file_path" type="primary" size="small" link @click="download(m)">下载</el-button>
            <el-button v-if="canDelete(m)" type="danger" size="small" link @click="onDelete(m)">删除</el-button>
          </span>
        </div>
      </div>
    </div>

    <div v-if="canManage" class="upload-form">
      <el-divider content-position="left">上传 / 登记材料</el-divider>
      <el-form label-width="70px" size="default">
        <el-form-item label="类别">
          <el-select v-model="form.category" style="width: 160px">
            <el-option v-for="c in CATEGORIES" :key="c" :label="c" :value="c" />
          </el-select>
        </el-form-item>
        <el-form-item label="标题">
          <el-input v-model="form.title" placeholder="如:活动总结、签到表扫描件" maxlength="60" />
        </el-form-item>
        <el-form-item label="说明">
          <el-input v-model="form.note" type="textarea" :rows="2" placeholder="可选,文字说明或纯文字记录内容" />
        </el-form-item>
        <el-form-item label="附件">
          <input ref="fileInput" type="file" style="display: none" @change="onFileChange" />
          <div v-if="fileRef" class="file-chip">
            📎 {{ fileRef.name }}
            <el-button link type="danger" size="small" @click="removeFile">移除</el-button>
          </div>
          <el-button v-else @click="pickFile">📎 选择文件(可选,≤20MB)</el-button>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="uploading" @click="submit">提交归档</el-button>
        </el-form-item>
      </el-form>
    </div>
  </el-card>
</template>

<style scoped>
.empty-tip {
  color: #909399;
  padding: 8px 0;
  font-size: 13px;
}
.material-item {
  padding: 10px 0;
  border-bottom: 1px dashed #ebeef5;
}
.m-line {
  display: flex;
  align-items: center;
  gap: 8px;
}
.m-title {
  font-weight: 500;
  color: #303133;
}
.m-note {
  margin: 6px 0 0;
  color: #606266;
  font-size: 13px;
  white-space: pre-wrap;
  word-break: break-word;
}
.m-meta {
  margin-top: 4px;
  color: #909399;
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.m-ops {
  margin-left: auto;
}
.file-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: #f4f4f5;
  border-radius: 4px;
  padding: 4px 10px;
  font-size: 13px;
}
</style>

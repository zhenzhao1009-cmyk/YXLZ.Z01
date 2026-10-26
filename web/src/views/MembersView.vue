<template>
  <div class="page">
    <el-tabs v-model="tab">
      <el-tab-pane label="会员" name="members">
        <div class="toolbar">
          <el-input
            v-model="q"
            placeholder="学号/姓名/手机"
            clearable
            style="width: 200px"
            @keyup.enter="search"
            @clear="search"
          />
          <el-select v-if="!isMinister" v-model="deptId" clearable filterable placeholder="部门" style="width: 150px" @change="search">
            <el-option v-for="d in depts" :key="d.id" :label="d.name" :value="d.id" />
          </el-select>
          <el-select v-model="status" clearable placeholder="状态" style="width: 120px" @change="search">
            <el-option label="待审核" value="pending" />
            <el-option label="在册" value="active" />
            <el-option label="离会" value="quit" />
          </el-select>
          <el-button type="primary" plain @click="search">搜索</el-button>
          <div class="spacer" />
          <el-button type="primary" @click="openAdd">新增会员</el-button>
          <el-upload
            v-if="isAdminLayer"
            ref="uploadRef"
            :auto-upload="false"
            :show-file-list="false"
            accept=".csv"
            :on-change="onCsvChange"
          >
            <el-button>CSV 导入</el-button>
          </el-upload>
          <el-button @click="exportCsv">导出名册</el-button>
        </div>

        <el-table :data="items" v-loading="loading">
          <el-table-column prop="student_no" label="学号" width="110" />
          <el-table-column prop="name" label="姓名" width="90" />
          <el-table-column prop="gender" label="性别" width="60" />
          <el-table-column prop="college" label="学院" min-width="120" show-overflow-tooltip />
          <el-table-column prop="grade" label="年级" width="90" />
          <el-table-column prop="dept_name" label="部门" width="100">
            <template #default="{ row }">{{ row.dept_name || '未分配' }}</template>
          </el-table-column>
          <el-table-column label="角色" width="100">
            <template #default="{ row }">{{ ROLE_LABELS[row.role] || row.role }}</template>
          </el-table-column>
          <el-table-column label="状态" width="80">
            <template #default="{ row }">
              <el-tag :type="STATUS_TAG_TYPES[row.status] || 'info'" size="small">{{ MEMBER_STATUS_LABELS[row.status] || row.status }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="phone" label="电话" width="120" />
          <el-table-column label="入会日期" width="100">
            <template #default="{ row }">{{ fmtDate(row.joined_at) }}</template>
          </el-table-column>
          <el-table-column label="操作" :width="isSuperAdmin ? 300 : isAdminLayer ? 240 : 160" fixed="right">
            <template #default="{ row }">
              <template v-if="row.status === 'pending'">
                <el-button link type="success" @click="askApprove(row)">通过</el-button>
                <el-button link type="danger" @click="askReject(row)">拒绝</el-button>
              </template>
              <el-button v-if="canEdit(row)" link type="primary" @click="openEdit(row)">编辑</el-button>
              <el-button v-if="isAdminLayer" link type="warning" @click="askResetPwd(row)">重置密码</el-button>
              <el-button v-if="isSuperAdmin" link type="danger" @click="askRemove(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
        <div class="pager">
          <el-pagination
            layout="total, prev, pager, next"
            :total="total"
            :page-size="pageSize"
            :current-page="page"
            @current-change="onPageChange"
          />
        </div>
      </el-tab-pane>

      <el-tab-pane v-if="isAdminLayer" label="部门" name="depts" lazy>
        <DeptPanel @changed="loadDepts" />
      </el-tab-pane>
    </el-tabs>

    <!-- 新增/编辑会员 -->
    <MemberFormDialog
      v-model:visible="formVisible"
      :member="editingMember"
      :is-minister="isMinister"
      :role-of-operator="role"
      @saved="load"
    />

    <!-- 管理层通过时可重指部门 -->
    <el-dialog v-model="approveDlgVisible" title="通过注册" width="400px" :close-on-click-modal="false">
      <p class="dlg-tip">通过「{{ approveRow && approveRow.name }}」的注册申请,可重新指定部门(可选):</p>
      <el-select v-model="approveDeptId" clearable filterable placeholder="保留原意向部门" style="width: 100%">
        <el-option v-for="d in depts" :key="d.id" :label="d.name" :value="d.id" />
      </el-select>
      <template #footer>
        <el-button @click="approveDlgVisible = false">取消</el-button>
        <el-button type="primary" :loading="approving" @click="doApprove">确认通过</el-button>
      </template>
    </el-dialog>

    <!-- CSV 导入预览 -->
    <el-dialog v-model="importVisible" title="CSV 导入预览" width="720px" :close-on-click-modal="false">
      <p class="dlg-tip">共解析出 {{ importRows.length }} 条数据,仅展示前 10 行:</p>
      <el-table :data="importRows.slice(0, 10)" size="small" max-height="320">
        <el-table-column prop="student_no" label="学号" width="110" />
        <el-table-column prop="name" label="姓名" width="90" />
        <el-table-column prop="college" label="学院" min-width="120" />
        <el-table-column prop="grade" label="年级" width="90" />
        <el-table-column prop="phone" label="手机" width="120" />
        <el-table-column prop="dept_name" label="部门" width="100" />
      </el-table>
      <template #footer>
        <el-button @click="importVisible = false">取消</el-button>
        <el-button type="primary" :loading="importing" @click="doImport">确认导入</el-button>
      </template>
    </el-dialog>

    <!-- 导入结果 -->
    <el-dialog v-model="resultVisible" title="导入结果" width="480px">
      <p class="dlg-tip">成功 {{ importResult.inserted }} 条</p>
      <template v-if="importResult.skipped.length">
        <p class="dlg-tip">跳过 {{ importResult.skipped.length }} 条:</p>
        <div class="skip-list">
          <div v-for="s in importResult.skipped" :key="s.student_no" class="skip-row">
            {{ s.student_no }} - {{ s.reason }}
          </div>
        </div>
      </template>
      <template #footer>
        <el-button type="primary" @click="resultVisible = false">知道了</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  listMembers, addMember, updateMember, reviewMember, removeMember,
  resetMemberPassword, importMembers, membersExportUrl
} from '../api/members'
import { listDepartments } from '../api/departments'
import { readCsvFile, parseImportRows, downloadUrl } from '../utils/csvClient'
import { auth } from '../store/auth'
import { fmtDate, ROLE_LABELS, MEMBER_STATUS_LABELS } from '../utils/format'
import MemberFormDialog from '../components/MemberFormDialog.vue'
import DeptPanel from '../components/DeptPanel.vue'

const STATUS_TAG_TYPES = { pending: 'warning', active: 'success', quit: 'info' }

const role = computed(() => (auth.user ? auth.user.role : 'member'))
const isAdminLayer = computed(() => ['president', 'advisor', 'super_admin'].includes(role.value))
const isMinister = computed(() => role.value === 'minister')
const isSuperAdmin = computed(() => role.value === 'super_admin')

const tab = ref('members')
const q = ref('')
const deptId = ref(null)
const status = ref(null)
const items = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const loading = ref(false)
const depts = ref([])

// 新增/编辑弹层
const formVisible = ref(false)
const editingMember = ref(null)

// 审核通过弹层(管理层)
const approveDlgVisible = ref(false)
const approveRow = ref(null)
const approveDeptId = ref(null)
const approving = ref(false)

// CSV 导入
const uploadRef = ref(null)
const importVisible = ref(false)
const importing = ref(false)
const importRows = ref([])
const resultVisible = ref(false)
const importResult = ref({ inserted: 0, skipped: [] })

onMounted(() => {
  load()
  loadDepts()
})

function filterParams() {
  const params = {}
  if (q.value) params.q = q.value
  if (deptId.value) params.dept_id = deptId.value
  if (status.value) params.status = status.value
  return params
}

async function load() {
  loading.value = true
  try {
    const data = await listMembers({ ...filterParams(), page: page.value, pageSize: pageSize.value })
    items.value = data.items || []
    total.value = data.total || 0
  } catch {
    // 拦截器已提示
  } finally {
    loading.value = false
  }
}

async function loadDepts() {
  try {
    depts.value = await listDepartments()
  } catch {
    // 拦截器已提示
  }
}

function search() {
  page.value = 1
  load()
}

function onPageChange(p) {
  page.value = p
  load()
}

async function exportCsv() {
  try {
    await downloadUrl(membersExportUrl(filterParams()), '会员名册.csv')
  } catch (e) {
    ElMessage.error(e && e.message ? e.message : '导出失败')
  }
}

// 新增 / 编辑
function openAdd() {
  editingMember.value = null
  formVisible.value = true
}

function canEdit(row) {
  if (isAdminLayer.value) return true
  return isMinister.value && row.dept_id === auth.user.dept_id && row.role === 'member'
}

function openEdit(row) {
  editingMember.value = row
  formVisible.value = true
}

// 审核
function askApprove(row) {
  if (isAdminLayer.value) {
    approveRow.value = row
    approveDeptId.value = null
    approveDlgVisible.value = true
    return
  }
  ElMessageBox.confirm(`确定通过「${row.name}」的注册申请?`, '通过注册', { type: 'warning' })
    .then(async () => {
      await reviewMember(row.id, 'approve')
      ElMessage.success('已通过')
      load()
    })
    .catch(() => {})
}

async function doApprove() {
  approving.value = true
  try {
    await reviewMember(approveRow.value.id, 'approve', approveDeptId.value || undefined)
    ElMessage.success('已通过')
    approveDlgVisible.value = false
    load()
  } catch {
    // 拦截器已提示
  } finally {
    approving.value = false
  }
}

function askReject(row) {
  ElMessageBox.confirm(`确定拒绝「${row.name}」的注册申请?该记录将被删除`, '拒绝注册', { type: 'warning' })
    .then(async () => {
      await reviewMember(row.id, 'reject')
      ElMessage.success('已拒绝')
      load()
    })
    .catch(() => {})
}

// 危险操作
function askResetPwd(row) {
  ElMessageBox.confirm(`确定将「${row.name}」的密码重置为 123456?`, '重置密码', { type: 'warning' })
    .then(async () => {
      await resetMemberPassword(row.id)
      ElMessage.success('密码已重置为 123456')
    })
    .catch(() => {})
}

function askRemove(row) {
  ElMessageBox.confirm(
    `确定删除「${row.name}」?仅待审核人员或无任何报名/回执记录者可删除,离会请在编辑中改为「离会」`,
    '删除会员',
    { type: 'warning' }
  )
    .then(async () => {
      await removeMember(row.id)
      ElMessage.success('已删除')
      load()
    })
    .catch(() => {})
}

// CSV 导入
async function onCsvChange(file) {
  try {
    const rows = parseImportRows(await readCsvFile(file.raw))
    if (!rows.length) {
      ElMessage.warning('未解析到可导入的数据行')
      return
    }
    importRows.value = rows
    importVisible.value = true
  } catch (e) {
    ElMessage.error(e && e.message ? e.message : 'CSV 解析失败')
  } finally {
    if (uploadRef.value) uploadRef.value.clearFiles()
  }
}

async function doImport() {
  importing.value = true
  try {
    const data = await importMembers(importRows.value)
    importResult.value = { inserted: data.inserted || 0, skipped: data.skipped || [] }
    importVisible.value = false
    resultVisible.value = true
    page.value = 1
    load()
  } catch {
    // 拦截器已提示
  } finally {
    importing.value = false
  }
}
</script>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.spacer {
  flex: 1;
}
.pager {
  margin-top: 12px;
  display: flex;
  justify-content: flex-end;
}
.dlg-tip {
  margin: 0 0 10px;
  color: #606266;
  font-size: 13px;
}
.skip-list {
  max-height: 240px;
  overflow: auto;
  border: 1px solid #ebeef5;
  border-radius: 4px;
  padding: 8px 12px;
}
.skip-row {
  font-size: 13px;
  color: #e6a23c;
  line-height: 1.8;
}
</style>

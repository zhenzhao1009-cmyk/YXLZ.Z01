<template>
  <div class="page">
    <el-card class="block-card">
      <template #header>个人资料</template>
      <el-descriptions :column="2" border class="profile-desc">
        <el-descriptions-item label="学号">{{ auth.user && auth.user.student_no }}</el-descriptions-item>
        <el-descriptions-item label="姓名">{{ auth.user && auth.user.name }}</el-descriptions-item>
        <el-descriptions-item label="部门">{{ (auth.user && auth.user.dept_name) || '未分配' }}</el-descriptions-item>
        <el-descriptions-item label="角色">{{ roleText }}</el-descriptions-item>
      </el-descriptions>
      <el-form :model="profileForm" label-width="80px" class="profile-form">
        <el-form-item label="性别">
          <el-radio-group v-model="profileForm.gender">
            <el-radio value="男">男</el-radio>
            <el-radio value="女">女</el-radio>
            <el-radio value="保密">保密</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="手机">
          <el-input v-model="profileForm.phone" placeholder="选填" style="max-width: 280px" />
        </el-form-item>
        <el-form-item label="学院">
          <el-input v-model="profileForm.college" placeholder="选填" style="max-width: 280px" />
        </el-form-item>
        <el-form-item label="年级">
          <el-input v-model="profileForm.grade" placeholder="选填,如 2025级" style="max-width: 280px" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="profileSaving" @click="saveProfile">保存资料</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card class="block-card">
      <template #header>修改密码</template>
      <el-form ref="pwdFormRef" :model="pwdForm" :rules="pwdRules" label-width="100px" style="max-width: 400px">
        <el-form-item label="旧密码" prop="old_password">
          <el-input v-model="pwdForm.old_password" type="password" show-password placeholder="请输入旧密码" />
        </el-form-item>
        <el-form-item label="新密码" prop="new_password">
          <el-input v-model="pwdForm.new_password" type="password" show-password placeholder="至少 6 位" />
        </el-form-item>
        <el-form-item label="确认新密码" prop="confirm_password">
          <el-input v-model="pwdForm.confirm_password" type="password" show-password placeholder="请再次输入新密码" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="pwdSaving" @click="savePassword">修改密码</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card class="block-card">
      <template #header>我的参与记录</template>
      <template v-if="participated.length">
        <el-timeline>
          <el-timeline-item
            v-for="a in participated"
            :key="a.id"
            :timestamp="fmtDateTime(a.start_time)"
            :type="timelineType(a)"
          >
            <div class="tl-row">
              <span class="tl-title" @click="router.push(`/activities/${a.id}`)">{{ a.title }}</span>
              <el-tag :type="statusTagType(a)" size="small">{{ statusText(a) }}</el-tag>
            </div>
          </el-timeline-item>
        </el-timeline>
      </template>
      <el-empty v-else description="暂无参与记录" :image-size="80" />
    </el-card>

    <el-card class="block-card">
      <el-button type="danger" plain class="logout-btn" @click="handleLogout">退出登录</el-button>
    </el-card>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { updateMeApi, updatePasswordApi } from '../api/auth'
import { listActivities } from '../api/activities'
import { auth, fetchMe, logout } from '../store/auth'
import { fmtDateTime, ROLE_LABELS } from '../utils/format'

const router = useRouter()

const profileForm = reactive({ gender: '保密', phone: '', college: '', grade: '' })
const profileSaving = ref(false)
const pwdFormRef = ref()
const pwdSaving = ref(false)
const pwdForm = reactive({ old_password: '', new_password: '', confirm_password: '' })
const pwdRules = {
  old_password: [{ required: true, message: '请输入旧密码', trigger: 'blur' }],
  new_password: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 6, message: '新密码至少 6 位', trigger: 'blur' },
  ],
  confirm_password: [
    { required: true, message: '请再次输入新密码', trigger: 'blur' },
    {
      validator: (rule, value, callback) => {
        if (value !== pwdForm.new_password) callback(new Error('两次输入的密码不一致'))
        else callback()
      },
      trigger: 'blur',
    },
  ],
}
const participated = ref([])

const roleText = computed(() => (auth.user ? ROLE_LABELS[auth.user.role] || auth.user.role : ''))

onMounted(async () => {
  const u = auth.user || {}
  profileForm.gender = u.gender || '保密'
  profileForm.phone = u.phone || ''
  profileForm.college = u.college || ''
  profileForm.grade = u.grade || ''
  try {
    const list = await listActivities()
    participated.value = (list || [])
      .filter((a) => a.my_status !== 'none')
      .sort((a, b) => (a.start_time < b.start_time ? 1 : -1))
  } catch {
    // 拦截器已提示
  }
})

async function saveProfile() {
  profileSaving.value = true
  try {
    await updateMeApi({
      gender: profileForm.gender,
      phone: profileForm.phone,
      college: profileForm.college,
      grade: profileForm.grade,
    })
    await fetchMe()
    ElMessage.success('资料已保存')
  } catch {
    // 拦截器已提示
  } finally {
    profileSaving.value = false
  }
}

async function savePassword() {
  const ok = await pwdFormRef.value.validate().catch(() => false)
  if (!ok) return
  pwdSaving.value = true
  try {
    await updatePasswordApi(pwdForm.old_password, pwdForm.new_password)
    ElMessage.success('密码修改成功')
    pwdFormRef.value.resetFields()
  } catch {
    // 拦截器已提示
  } finally {
    pwdSaving.value = false
  }
}

function statusText(a) {
  if (a.cancelled) return '已取消'
  if (a.my_status === 'checked_in') return '已签到'
  if (a.state === 'ended') return '缺席'
  return '已报名'
}

function statusTagType(a) {
  if (a.cancelled) return 'info'
  if (a.my_status === 'checked_in') return 'success'
  if (a.state === 'ended') return 'danger'
  return 'primary'
}

function timelineType(a) {
  if (a.cancelled) return 'info'
  if (a.my_status === 'checked_in') return 'success'
  if (a.state === 'ended') return 'danger'
  return 'primary'
}

function handleLogout() {
  logout()
  router.push('/login')
}
</script>

<style scoped>
.block-card {
  margin-bottom: 12px;
}
.profile-desc {
  margin-bottom: 16px;
}
.tl-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.tl-title {
  color: #303133;
  cursor: pointer;
}
.tl-title:hover {
  color: #409eff;
}
.logout-btn {
  width: 100%;
}
</style>

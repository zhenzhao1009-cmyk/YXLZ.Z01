<template>
  <div class="login-page">
    <div class="login-box">
      <h2 class="login-title">大学生健康协会管理系统</h2>
      <el-tabs v-model="activeTab" stretch>
        <el-tab-pane label="登录" name="login">
          <el-form ref="loginFormRef" :model="loginForm" :rules="loginRules" label-position="top" @keyup.enter="handleLogin">
            <el-form-item label="学号" prop="student_no">
              <el-input v-model="loginForm.student_no" placeholder="请输入学号" size="large" />
            </el-form-item>
            <el-form-item label="密码" prop="password">
              <el-input v-model="loginForm.password" type="password" show-password placeholder="请输入密码" size="large" />
            </el-form-item>
            <el-button type="primary" size="large" class="login-btn" :loading="loginLoading" @click="handleLogin">登 录</el-button>
          </el-form>
          <el-alert type="info" :closable="false" class="demo-card">
            <template #title>演示账号(初始密码均为 123456)</template>
            <div class="demo-line">会长:20240002</div>
            <div class="demo-line">部长:20240101</div>
            <div class="demo-line">普通会员:20240201</div>
            <div class="demo-tip">演示账号请登录后立即在『我的』页修改密码</div>
          </el-alert>
        </el-tab-pane>
        <el-tab-pane label="注册" name="register">
          <el-form ref="regFormRef" :model="regForm" :rules="regRules" label-position="top">
            <el-form-item label="学号" prop="student_no">
              <el-input v-model="regForm.student_no" placeholder="请输入学号" />
            </el-form-item>
            <el-form-item label="姓名" prop="name">
              <el-input v-model="regForm.name" placeholder="请输入姓名" />
            </el-form-item>
            <el-form-item label="意向部门" prop="dept_id">
              <el-select v-model="regForm.dept_id" placeholder="请选择意向部门" style="width: 100%">
                <el-option v-for="d in departments" :key="d.id" :label="d.name" :value="d.id" />
              </el-select>
            </el-form-item>
            <el-form-item label="手机" prop="phone">
              <el-input v-model="regForm.phone" placeholder="选填" />
            </el-form-item>
            <el-form-item label="学院" prop="college">
              <el-input v-model="regForm.college" placeholder="选填" />
            </el-form-item>
            <el-form-item label="年级" prop="grade">
              <el-input v-model="regForm.grade" placeholder="选填,如 2025级" />
            </el-form-item>
            <el-form-item label="密码" prop="password">
              <el-input v-model="regForm.password" type="password" show-password placeholder="至少 6 位" />
            </el-form-item>
            <el-form-item label="确认密码" prop="confirm_password">
              <el-input v-model="regForm.confirm_password" type="password" show-password placeholder="请再次输入密码" />
            </el-form-item>
            <el-button type="primary" class="login-btn" :loading="regLoading" @click="handleRegister">提交注册申请</el-button>
          </el-form>
        </el-tab-pane>
      </el-tabs>
    </div>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { registerApi } from '../api/auth'
import { listDepartments } from '../api/departments'
import { login } from '../store/auth'

const route = useRoute()
const router = useRouter()

const activeTab = ref('login')
const loginFormRef = ref()
const regFormRef = ref()
const loginLoading = ref(false)
const regLoading = ref(false)
const departments = ref([])

const loginForm = reactive({ student_no: '', password: '' })
const loginRules = {
  student_no: [{ required: true, message: '请输入学号', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
}

const regForm = reactive({
  student_no: '',
  name: '',
  dept_id: null,
  phone: '',
  college: '',
  grade: '',
  password: '',
  confirm_password: '',
})
const regRules = {
  student_no: [{ required: true, message: '请输入学号', trigger: 'blur' }],
  name: [{ required: true, message: '请输入姓名', trigger: 'blur' }],
  dept_id: [{ required: true, message: '请选择意向部门', trigger: 'change' }],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, message: '密码至少 6 位', trigger: 'blur' },
  ],
  confirm_password: [
    { required: true, message: '请再次输入密码', trigger: 'blur' },
    {
      validator: (rule, value, callback) => {
        if (value !== regForm.password) callback(new Error('两次输入的密码不一致'))
        else callback()
      },
      trigger: 'blur',
    },
  ],
}

onMounted(async () => {
  try {
    departments.value = await listDepartments()
  } catch {
    // 拦截器已提示
  }
})

async function handleLogin() {
  const ok = await loginFormRef.value.validate().catch(() => false)
  if (!ok) return
  loginLoading.value = true
  try {
    await login(loginForm.student_no, loginForm.password)
    router.push(route.query.redirect || '/')
  } catch {
    // 拦截器已提示
  } finally {
    loginLoading.value = false
  }
}

async function handleRegister() {
  const ok = await regFormRef.value.validate().catch(() => false)
  if (!ok) return
  regLoading.value = true
  try {
    await registerApi({
      student_no: regForm.student_no,
      name: regForm.name,
      dept_id: regForm.dept_id,
      phone: regForm.phone,
      college: regForm.college,
      grade: regForm.grade,
      password: regForm.password,
    })
    ElMessage.success('已提交申请,待干部审核')
    regFormRef.value.resetFields()
    activeTab.value = 'login'
  } catch {
    // 拦截器已提示
  } finally {
    regLoading.value = false
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.login-box {
  width: 400px;
  max-width: 100%;
  background: #fff;
  border-radius: 8px;
  padding: 24px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
}
.login-title {
  text-align: center;
  margin: 0 0 16px;
  color: #303133;
  font-size: 18px;
}
.login-btn {
  width: 100%;
}
.demo-card {
  margin-top: 16px;
}
.demo-line {
  line-height: 1.8;
}
.demo-tip {
  margin-top: 4px;
  color: #e6a23c;
  font-size: 12px;
}
@media (max-width: 768px) {
  .login-box {
    width: 100%;
    padding: 16px;
  }
}
</style>

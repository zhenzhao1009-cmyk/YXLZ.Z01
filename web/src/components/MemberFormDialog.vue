<template>
  <el-dialog
    :model-value="visible"
    :title="isEdit ? '编辑会员' : '新增会员'"
    width="480px"
    :close-on-click-modal="false"
    @update:model-value="(v) => emit('update:visible', v)"
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-width="80px">
      <el-form-item label="学号" prop="student_no">
        <el-input v-model="form.student_no" :disabled="isEdit" placeholder="学号即登录账号" />
      </el-form-item>
      <el-form-item label="姓名" prop="name">
        <el-input v-model="form.name" :disabled="isEdit && !isAdminLayer" />
      </el-form-item>
      <el-form-item label="部门" prop="dept_id">
        <el-select
          v-model="form.dept_id"
          :disabled="isMinister"
          clearable
          filterable
          placeholder="选择部门"
          style="width: 100%"
        >
          <el-option v-for="d in depts" :key="d.id" :label="d.name" :value="d.id" />
        </el-select>
        <div v-if="isMinister" class="field-tip">部长仅能操作本部门会员</div>
      </el-form-item>
      <el-form-item label="性别">
        <el-select v-model="form.gender" style="width: 100%">
          <el-option label="男" value="男" />
          <el-option label="女" value="女" />
          <el-option label="保密" value="保密" />
        </el-select>
      </el-form-item>
      <el-form-item label="学院">
        <el-input v-model="form.college" />
      </el-form-item>
      <el-form-item label="年级">
        <el-input v-model="form.grade" placeholder="如 2025级" />
      </el-form-item>
      <el-form-item label="手机">
        <el-input v-model="form.phone" />
      </el-form-item>
      <el-form-item v-if="isEdit" label="状态">
        <el-select v-model="form.status" style="width: 100%">
          <el-option v-for="s in statusOptions" :key="s" :label="MEMBER_STATUS_LABELS[s]" :value="s" />
        </el-select>
        <div v-if="isMinister" class="field-tip">部长仅可将状态改为「离会」</div>
      </el-form-item>
      <el-form-item v-if="showRole" label="角色">
        <el-select v-model="form.role" style="width: 100%">
          <el-option v-for="r in roleOptions" :key="r" :label="ROLE_LABELS[r]" :value="r" />
        </el-select>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="emit('update:visible', false)">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="submit">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { addMember, updateMember } from '../api/members'
import { listDepartments } from '../api/departments'
import { auth } from '../store/auth'
import { ROLE_LABELS, MEMBER_STATUS_LABELS } from '../utils/format'

const props = defineProps({
  visible: Boolean,
  member: { type: Object, default: null },
  isMinister: { type: Boolean, default: false },
  roleOfOperator: { type: String, default: 'member' }
})
const emit = defineEmits(['update:visible', 'saved'])

const formRef = ref(null)
const submitting = ref(false)
const depts = ref([])
const form = ref(emptyForm())

function emptyForm() {
  return { student_no: '', name: '', dept_id: null, gender: '保密', college: '', grade: '', phone: '', status: 'active', role: 'member' }
}

const isEdit = computed(() => !!props.member)
const isAdminLayer = computed(() => ['president', 'advisor', 'super_admin'].includes(props.roleOfOperator))

// §14.1:super_admin 可设全部角色;president 仅 member/minister;advisor 不能设置角色
const roleOptions = computed(() => {
  if (props.roleOfOperator === 'super_admin') return Object.keys(ROLE_LABELS)
  if (props.roleOfOperator === 'president') return ['member', 'minister']
  return []
})
const showRole = computed(() => isEdit.value && isAdminLayer.value && roleOptions.value.length > 0)

// 部长编辑:仅可在现有状态与「离会」间选择
const statusOptions = computed(() => {
  if (!isEdit.value) return []
  if (props.isMinister) {
    return props.member.status === 'quit' ? ['quit'] : [props.member.status, 'quit']
  }
  return ['pending', 'active', 'quit']
})

const rules = {
  student_no: [{ required: true, message: '请输入学号', trigger: 'blur' }],
  name: [{ required: true, message: '请输入姓名', trigger: 'blur' }]
}

watch(
  () => props.visible,
  (v) => {
    if (!v) return
    form.value = props.member
      ? {
          student_no: props.member.student_no,
          name: props.member.name,
          dept_id: props.isMinister ? auth.user.dept_id : (props.member.dept_id ?? null),
          gender: props.member.gender || '保密',
          college: props.member.college || '',
          grade: props.member.grade || '',
          phone: props.member.phone || '',
          status: props.member.status || 'active',
          role: props.member.role || 'member'
        }
      : emptyForm()
    loadDepts()
  }
)

async function loadDepts() {
  if (depts.value.length) return
  try {
    depts.value = await listDepartments()
  } catch {
    // 拦截器已提示
  }
}

async function submit() {
  try {
    await formRef.value.validate()
  } catch {
    return
  }
  submitting.value = true
  try {
    if (isEdit.value) {
      const payload = { gender: form.value.gender, phone: form.value.phone, college: form.value.college, grade: form.value.grade }
      if (isAdminLayer.value) {
        payload.name = form.value.name
        payload.dept_id = form.value.dept_id || null
        payload.status = form.value.status
        if (form.value.role) payload.role = form.value.role
      } else if (form.value.status !== props.member.status) {
        payload.status = form.value.status
      }
      await updateMember(props.member.id, payload)
      ElMessage.success('已保存')
    } else {
      const payload = {
        student_no: form.value.student_no,
        name: form.value.name,
        gender: form.value.gender,
        college: form.value.college,
        grade: form.value.grade,
        phone: form.value.phone
      }
      payload.dept_id = props.isMinister ? auth.user.dept_id : (form.value.dept_id || null)
      await addMember(payload)
      ElMessage.success('已新增,初始密码 123456')
    }
    emit('saved')
    emit('update:visible', false)
  } catch {
    // 拦截器已提示
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.field-tip {
  font-size: 12px;
  color: #909399;
  line-height: 1.4;
  margin-top: 2px;
}
</style>

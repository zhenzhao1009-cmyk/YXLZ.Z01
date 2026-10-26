<template>
  <div>
    <div class="toolbar">
      <el-button type="primary" @click="openAdd">新增部门</el-button>
    </div>
    <el-table :data="items" v-loading="loading">
      <el-table-column prop="name" label="名称" min-width="120" />
      <el-table-column prop="description" label="简介" min-width="200" show-overflow-tooltip />
      <el-table-column prop="sort" label="排序" width="80" />
      <el-table-column prop="member_count" label="在册人数" width="100" />
      <el-table-column label="操作" width="140">
        <template #default="{ row }">
          <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
          <el-button link type="danger" @click="del(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dlgVisible" :title="form.id ? '编辑部门' : '新增部门'" width="440px" :close-on-click-modal="false">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="80px">
        <el-form-item label="名称" prop="name">
          <el-input v-model="form.name" maxlength="20" />
        </el-form-item>
        <el-form-item label="简介">
          <el-input v-model="form.description" type="textarea" :rows="2" maxlength="100" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="form.sort" :min="0" :max="999" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dlgVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { listDepartments, createDepartment, updateDepartment, removeDepartment } from '../api/departments'

const emit = defineEmits(['changed'])

const items = ref([])
const loading = ref(false)
const dlgVisible = ref(false)
const submitting = ref(false)
const formRef = ref(null)
const form = ref({ id: null, name: '', description: '', sort: 0 })

const rules = {
  name: [{ required: true, message: '请输入部门名称', trigger: 'blur' }]
}

onMounted(load)

async function load() {
  loading.value = true
  try {
    items.value = await listDepartments()
  } catch {
    // 拦截器已提示
  } finally {
    loading.value = false
  }
}

function openAdd() {
  form.value = { id: null, name: '', description: '', sort: items.value.length + 1 }
  dlgVisible.value = true
}

function openEdit(row) {
  form.value = { id: row.id, name: row.name, description: row.description || '', sort: row.sort }
  dlgVisible.value = true
}

async function submit() {
  try {
    await formRef.value.validate()
  } catch {
    return
  }
  submitting.value = true
  try {
    const payload = { name: form.value.name, description: form.value.description, sort: form.value.sort }
    if (form.value.id) {
      await updateDepartment(form.value.id, payload)
      ElMessage.success('已保存')
    } else {
      await createDepartment(payload)
      ElMessage.success('已新增')
    }
    dlgVisible.value = false
    await load()
    emit('changed')
  } catch {
    // 拦截器已提示
  } finally {
    submitting.value = false
  }
}

function del(row) {
  ElMessageBox.confirm(`确定删除部门「${row.name}」?仍有在册会员时无法删除`, '删除部门', { type: 'warning' })
    .then(async () => {
      await removeDepartment(row.id)
      ElMessage.success('已删除')
      await load()
      emit('changed')
    })
    .catch(() => {})
}
</script>

<style scoped>
.toolbar {
  margin-bottom: 12px;
}
</style>

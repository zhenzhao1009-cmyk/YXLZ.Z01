<template>
  <div class="notfound-page">
    <div class="notfound-code">404</div>
    <div class="notfound-text">页面不存在</div>
    <el-button type="primary" @click="router.push('/')">返回首页</el-button>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'

const router = useRouter()
</script>

<style scoped>
.notfound-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
}
.notfound-code {
  font-size: 72px;
  font-weight: 700;
  color: #409eff;
}
.notfound-text {
  font-size: 18px;
  color: #909399;
  margin-bottom: 8px;
}
</style>

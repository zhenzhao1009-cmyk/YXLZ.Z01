<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { meApi } from '../api/auth';
import { auth, logout } from '../store/auth';
import { ROLE_LABELS } from '../utils/format';

const route = useRoute();
const router = useRouter();

const ADMIN = ['president', 'advisor', 'super_admin'];
const isAdmin = computed(() => ADMIN.includes(auth.user && auth.user.role));
const isMinister = computed(() => auth.user && auth.user.role === 'minister');

const menus = computed(() => {
  const list = [
    { path: '/', label: '首页', show: true },
    { path: '/activities', label: '活动大厅', show: true },
    { path: '/announcements', label: '公告', show: true, badge: true },
    { path: '/members', label: '会员管理', show: isAdmin.value || isMinister.value },
    { path: '/stats', label: '统计看板', show: isAdmin.value },
    { path: '/me', label: '我的', show: true },
  ];
  return list.filter((m) => m.show);
});

const unreadCount = ref(0);
async function loadUnread() {
  try {
    const data = await meApi();
    unreadCount.value = data.unread_count;
  } catch { /* 拦截器已提示 */ }
}
onMounted(loadUnread);
watch(() => route.path, loadUnread);

const deptText = computed(() => (auth.user && auth.user.dept_name) || '未分配部门');
const identity = computed(() => {
  const u = auth.user || {};
  return `${u.name || ''} · ${ROLE_LABELS[u.role] || ''} · ${deptText.value}`;
});

const drawerVisible = ref(false);
const isMobile = ref(window.innerWidth < 768);
const onResize = () => { isMobile.value = window.innerWidth < 768; };
onMounted(() => window.addEventListener('resize', onResize));
onUnmounted(() => window.removeEventListener('resize', onResize));

watch(() => route.fullPath, () => { drawerVisible.value = false; });

async function onLogout() {
  logout();
  ElMessage.success('已退出登录');
  router.push('/login');
}
</script>

<template>
  <el-container style="height: 100vh">
    <el-header class="layout-header" height="56px">
      <div style="display: flex; align-items: center; gap: 12px">
        <el-button v-if="isMobile" text @click="drawerVisible = true">
          <el-icon><i class="el-icon-menu" /></el-icon>
          <span style="font-size: 20px">☰</span>
        </el-button>
        <span class="layout-title">大学生健康协会管理系统</span>
      </div>
      <el-dropdown @command="(cmd) => cmd === 'me' ? router.push('/me') : onLogout()">
        <span style="cursor: pointer; color: #303133">{{ identity }}</span>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="me">我的</el-dropdown-item>
            <el-dropdown-item command="logout" divided>退出登录</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </el-header>

    <el-container>
      <el-aside v-if="!isMobile" width="200px" class="layout-aside">
        <el-menu :default-active="route.path" router>
          <el-menu-item v-for="m in menus" :key="m.path" :index="m.path">
            <el-badge v-if="m.badge && unreadCount > 0" :value="unreadCount" :max="99" class="menu-badge">
              {{ m.label }}
            </el-badge>
            <template v-else>{{ m.label }}</template>
          </el-menu-item>
        </el-menu>
      </el-aside>

      <el-drawer v-model="drawerVisible" direction="ltr" size="200px" :with-header="false">
        <el-menu :default-active="route.path" router>
          <el-menu-item v-for="m in menus" :key="m.path" :index="m.path">
            <el-badge v-if="m.badge && unreadCount > 0" :value="unreadCount" :max="99" class="menu-badge">
              {{ m.label }}
            </el-badge>
            <template v-else>{{ m.label }}</template>
          </el-menu-item>
        </el-menu>
      </el-drawer>

      <el-main style="padding: 0; overflow-y: auto">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<style scoped>
.menu-badge :deep(.el-badge__content) {
  position: relative;
  top: -2px;
  margin-left: 4px;
  transform: none;
}
</style>

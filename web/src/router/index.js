import { createRouter, createWebHistory } from 'vue-router';
import { auth } from '../store/auth';

// 可见角色:'admin' 代表管理层(president / advisor / super_admin)
const ADMIN = ['president', 'advisor', 'super_admin'];

const routes = [
  { path: '/login', component: () => import('../views/LoginView.vue'), meta: { public: true } },
  // 独立移动签到页(扫码直达,不套 AppLayout)
  { path: '/checkin/:id', component: () => import('../views/CheckinView.vue') },
  {
    path: '/',
    component: () => import('../layout/AppLayout.vue'),
    children: [
      { path: '', component: () => import('../views/HomeView.vue') },
      { path: 'activities', component: () => import('../views/ActivityListView.vue') },
      { path: 'activities/:id', component: () => import('../views/ActivityDetailView.vue') },
      { path: 'announcements', component: () => import('../views/AnnouncementListView.vue') },
      { path: 'announcements/:id', component: () => import('../views/AnnouncementDetailView.vue') },
      { path: 'members', component: () => import('../views/MembersView.vue'), meta: { roles: [...ADMIN, 'minister'] } },
      { path: 'stats', component: () => import('../views/StatsView.vue'), meta: { roles: ADMIN } },
      { path: 'me', component: () => import('../views/MeView.vue') },
    ],
  },
  { path: '/:pathMatch(.*)*', component: () => import('../views/NotFoundView.vue') },
];

const router = createRouter({ history: createWebHistory(), routes });

// 守卫:白名单 /login;未登录跳登录(带 redirect);角色不符跳首页(体验层,真正防线在 API)
router.beforeEach((to) => {
  if (to.path === '/login') {
    if (auth.token) return { path: '/' };
    return true;
  }
  if (!auth.token) {
    return { path: '/login', query: { redirect: to.fullPath } };
  }
  if (to.meta.roles && !to.meta.roles.includes(auth.user && auth.user.role)) {
    return { path: '/' };
  }
  return true;
});

export default router;

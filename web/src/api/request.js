import axios from 'axios';
import { ElMessage } from 'element-plus';

export const STORAGE_KEY = 'club_auth';

const request = axios.create({ baseURL: '/api', timeout: 15000 });

request.interceptors.request.use((cfg) => {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (saved && saved.token) cfg.headers.Authorization = `Bearer ${saved.token}`;
  } catch { /* 未登录 */ }
  return cfg;
});

request.interceptors.response.use(
  (resp) => resp.data.data ?? {}, // 解开统一信封;无业务数据的成功响应返回空对象
  (err) => {
    const status = err.response && err.response.status;
    const msg = (err.response && err.response.data && err.response.data.message) || '网络异常,请稍后重试';
    ElMessage.error(msg);
    if (status === 401) {
      localStorage.removeItem(STORAGE_KEY);
      if (!location.pathname.startsWith('/login')) {
        location.href = `/login?redirect=${encodeURIComponent(location.pathname + location.search)}`;
      }
    }
    return Promise.reject(err);
  }
);

export default request;

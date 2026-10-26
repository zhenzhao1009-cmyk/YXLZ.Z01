import { reactive } from 'vue';
import { loginApi, meApi } from '../api/auth';

const STORAGE_KEY = 'club_auth';

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || { token: '', user: null };
  } catch {
    return { token: '', user: null };
  }
}

// 模块级 reactive(不用 Pinia),localStorage 持久化
export const auth = reactive({ token: '', user: null, ...load() });

export function isLoggedIn() {
  return !!auth.token;
}

export function saveAuth(token, user) {
  auth.token = token;
  auth.user = user;
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, user }));
}

export function clearAuth() {
  auth.token = '';
  auth.user = null;
  localStorage.removeItem(STORAGE_KEY);
}

export async function login(studentNo, password) {
  const data = await loginApi(studentNo, password);
  saveAuth(data.token, data.member);
}

export async function fetchMe() {
  const data = await meApi();
  saveAuth(auth.token, data.member);
  return data;
}

export function logout() {
  clearAuth();
}

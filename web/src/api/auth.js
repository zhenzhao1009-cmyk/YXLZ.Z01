import request from './request';

export const registerApi = (payload) => request.post('/auth/register', payload);
export const loginApi = (student_no, password) => request.post('/auth/login', { student_no, password });
export const meApi = () => request.get('/auth/me');
export const updateMeApi = (payload) => request.put('/auth/me', payload);
export const updatePasswordApi = (old_password, new_password) => request.put('/auth/password', { old_password, new_password });

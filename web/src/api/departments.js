import request from './request';

export const listDepartments = () => request.get('/departments');
export const createDepartment = (payload) => request.post('/departments', payload);
export const updateDepartment = (id, payload) => request.put(`/departments/${id}`, payload);
export const removeDepartment = (id) => request.delete(`/departments/${id}`);

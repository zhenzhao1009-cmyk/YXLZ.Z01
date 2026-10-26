import request from './request';

export const listMembers = (params) => request.get('/members', { params });
export const addMember = (payload) => request.post('/members', payload);
export const updateMember = (id, payload) => request.put(`/members/${id}`, payload);
export const reviewMember = (id, action, dept_id) => request.put(`/members/${id}/review`, dept_id ? { action, dept_id } : { action });
export const removeMember = (id) => request.delete(`/members/${id}`);
export const resetMemberPassword = (id) => request.put(`/members/${id}/password`);
export const importMembers = (rows) => request.post('/members/import', rows);
export const membersExportUrl = (params) => {
  const qs = new URLSearchParams(params || {}).toString();
  return `/api/members/export${qs ? `?${qs}` : ''}`;
};

import request from './request';

export const listActivities = (params) => request.get('/activities', { params });
export const activityDetail = (id) => request.get(`/activities/${id}`);
export const createActivity = (payload) => request.post('/activities', payload);
export const updateActivity = (id, payload) => request.put(`/activities/${id}`, payload);
export const cancelActivity = (id) => request.post(`/activities/${id}/cancel`);
export const removeActivity = (id) => request.delete(`/activities/${id}`);
export const signupActivity = (id, payload) => request.post(`/activities/${id}/signup`, payload || {});
export const cancelSignup = (id, memberId) => request.delete(`/activities/${id}/signup`, memberId ? { params: { member_id: memberId } } : {});
export const listSignups = (id) => request.get(`/activities/${id}/signups`);
export const signupsExportUrl = (id) => `/api/activities/${id}/signups/export`;
export const checkinByCode = (id, code) => request.post(`/activities/${id}/checkin`, { code });
export const getCheckinCode = (id) => request.get(`/activities/${id}/checkin-code`);
export const getCheckinQr = (id) => request.get(`/activities/${id}/checkin-qr`);
export const manualCheckin = (id, member_id) => request.post(`/activities/${id}/manual-checkin`, { member_id });
export const undoCheckin = (id, memberId) => request.delete(`/activities/${id}/checkin`, memberId ? { params: { member_id: memberId } } : {});

export const listMaterials = (id) => request.get(`/activities/${id}/materials`);
export const uploadMaterial = (id, formData) => request.post(`/activities/${id}/materials`, formData, {
  headers: { 'Content-Type': 'multipart/form-data' },
});
export const materialDownloadUrl = (id) => `/api/materials/${id}/download`;
export const removeMaterial = (id) => request.delete(`/materials/${id}`);

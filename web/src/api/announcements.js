import request from './request';

export const listAnnouncements = (params) => request.get('/announcements', { params });
export const announcementDetail = (id) => request.get(`/announcements/${id}`);
export const confirmAnnouncement = (id) => request.post(`/announcements/${id}/confirm`);
export const createAnnouncement = (payload) => request.post('/announcements', payload);
export const updateAnnouncement = (id, payload) => request.put(`/announcements/${id}`, payload);
export const removeAnnouncement = (id) => request.delete(`/announcements/${id}`);
export const listAnnouncementReads = (id) => request.get(`/announcements/${id}/reads`);

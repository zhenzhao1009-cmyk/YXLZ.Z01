// 时间展示与状态文案(活动 state 由后端推导)
export function fmtDateTime(s) {
  return s ? String(s).replace('T', ' ').slice(0, 16) : '';
}

export function fmtDate(s) {
  return s ? String(s).slice(0, 10) : '';
}

export const STATE_LABELS = { upcoming: '即将开始', ongoing: '进行中', ended: '已结束', cancelled: '已取消' };
export const STATE_TAG_TYPES = { upcoming: 'primary', ongoing: 'success', ended: 'info', cancelled: 'danger' };

export const MY_STATUS_LABELS = { none: '', registered: '已报名', checked_in: '已签到' };

export const SIGNUP_STATUS_LABELS = { registered: '已报名', checked_in: '已签到', cancelled: '已取消' };

export const ROLE_LABELS = { super_admin: '超级管理员', president: '会长', advisor: '指导老师', minister: '部长', member: '会员' };

export const MEMBER_STATUS_LABELS = { pending: '待审核', active: '在册', quit: '离会' };

// 容量文案('x/容量',0=不限)
export function capacityText(activity) {
  return `${activity.signup_count}/${activity.capacity > 0 ? activity.capacity : '不限'}`;
}

// 签到方式
export function checkinMethod(row) {
  if (row.status !== 'checked_in') return '';
  return row.checkin_by ? '补签' : '本人';
}

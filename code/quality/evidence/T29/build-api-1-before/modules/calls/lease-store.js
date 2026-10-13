"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.liveLease = liveLease;
async function liveLease(db, id) {
    return (await db.query(`SELECT a.id,m.user_id,a.session_id,m.call_group_id,m.room_id,
  'fg-call_'||m.call_group_id AS room_name,s.expires_at AT TIME ZONE 'UTC' AS session_expires_at
  FROM call_admissions a JOIN call_members m ON m.id=a.call_member_id
  JOIN call_groups c ON c.id=m.call_group_id AND c.room_id=m.room_id
  JOIN room_members rm ON rm.room_id=m.room_id AND rm.user_id=m.user_id
  JOIN session s ON s.id=a.session_id AND s.user_id=m.user_id
  JOIN profiles p ON p.user_id=m.user_id
  WHERE a.id=$1 AND a.revoked_at IS NULL AND a.expires_at>clock_timestamp()
  AND m.left_at IS NULL AND c.state='OPEN' AND s.expires_at>clock_timestamp() AT TIME ZONE 'UTC'
  AND (a.disconnected_at IS NULL OR a.disconnected_at>clock_timestamp()-interval '30 seconds')
  AND EXISTS(SELECT 1 FROM game_interests g WHERE g.user_id=m.user_id)
  AND COALESCE((SELECT action FROM admin_actions WHERE target_user_id=m.user_id AND action IN('BAN','UNBAN') ORDER BY created_at DESC,id DESC LIMIT 1),'UNBAN')<>'BAN'`, [id])).rows[0];
}
//# sourceMappingURL=lease-store.js.map
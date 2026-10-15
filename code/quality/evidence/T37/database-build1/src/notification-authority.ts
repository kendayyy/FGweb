// T33: existing private authority copied byte-for-byte; protocol/encryption unchanged.
export const privateNotificationSourceAuthority=`m.sender_id<>n.user_id AND m.encryption_mode='E2EE' AND s.mode='E2EE' AND s.migration_state='RECONCILED'
   AND ((n.type='DM' AND c.kind='DM' AND n.dedup_key='crypto-dm:'||m.id) OR (n.type='MENTION' AND n.dedup_key='crypto-mention:'||m.id||':'||n.user_id AND EXISTS(SELECT 1 FROM mentions WHERE message_id=m.id AND mentioned_user_id=n.user_id)))
   AND ((c.kind='DM' AND (c.user1_id=n.user_id OR c.user2_id=n.user_id)) OR (c.kind<>'LOBBY' AND c.kind<>'DM' AND (EXISTS(SELECT 1 FROM rooms r JOIN room_members rm ON rm.room_id=r.id WHERE r.conversation_id=c.id AND rm.user_id=n.user_id) OR (NOT EXISTS(SELECT 1 FROM rooms r WHERE r.conversation_id=c.id) AND EXISTS(SELECT 1 FROM conversation_members cm WHERE cm.conversation_id=c.id AND cm.user_id=n.user_id)))))
   AND EXISTS(SELECT 1 FROM chat_crypto_membership_intervals i WHERE i.conversation_id=c.id AND i.user_id=n.user_id AND i.start_revision<=m.crypto_revision AND (i.end_revision IS NULL OR m.crypto_revision<i.end_revision))
   AND NOT EXISTS(SELECT 1 FROM chat_crypto_legacy_migrations lm WHERE lm.message_id=m.id)
   AND NOT EXISTS(SELECT 1 FROM blocks WHERE (blocker_id=n.user_id AND blocked_id=m.sender_id) OR (blocker_id=m.sender_id AND blocked_id=n.user_id))
   AND NOT EXISTS(SELECT 1 FROM notification_preferences WHERE user_id=n.user_id AND notification_type=n.type AND in_app=false)
   AND COALESCE((SELECT action FROM admin_actions WHERE target_user_id=n.user_id AND action IN ('BAN','UNBAN') ORDER BY created_at DESC,id DESC LIMIT 1),'UNBAN')<>'BAN'`;

/** Fixed SQL aliases only. No input is interpolated into this authority predicate. */
export function notificationAuthoritySql(cryptoReady:boolean,channel:'IN_APP'|'PUSH'|'EMAIL'='IN_APP'):string {
 const preferenceColumn=channel==='IN_APP'?'in_app':channel==='PUSH'?'push':'email';
 if(!['IN_APP','PUSH','EMAIL'].includes(channel))throw new Error('Invalid notification channel');
 const privateAuthority=channel==='IN_APP'?privateNotificationSourceAuthority:privateNotificationSourceAuthority.replace('notification_type=n.type AND in_app=false','notification_type=n.type AND '+preferenceColumn+'=false');
 const data="(CASE WHEN pg_input_is_valid(n.data,'jsonb') THEN n.data::jsonb ELSE '{}'::jsonb END)";
 const value=(key:string)=>`${data}->>'${key}'`;
 const strings=(...keys:string[])=>keys.map(key=>`jsonb_typeof(${data}->'${key}')='string' AND length(${value(key)})>0`).join(' AND ');
 const unblocked=(sender:string)=>`NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=n.user_id AND b.blocked_id=${sender}) OR (b.blocker_id=${sender} AND b.blocked_id=n.user_id))`;
 const privateSource=cryptoReady?`EXISTS(SELECT 1 FROM messages m JOIN conversations c ON c.id=m.conversation_id JOIN chat_crypto_state s ON s.conversation_id=c.id WHERE m.id=${value('messageId')} AND c.id=${value('conversationId')} AND m.sender_id=CASE WHEN n.type='DM' THEN ${value('senderId')} ELSE ${value('mentionerId')} END AND ${privateAuthority})`:'FALSE';
 const lobbySource=cryptoReady?`EXISTS(SELECT 1 FROM messages m JOIN conversations c ON c.id=m.conversation_id JOIN chat_crypto_state s ON s.conversation_id=c.id WHERE m.id=${value('messageId')} AND c.id=${value('conversationId')} AND c.kind='LOBBY' AND m.sender_id=${value('mentionerId')} AND m.sender_id<>n.user_id AND m.encryption_mode='LOBBY_AEAD' AND s.mode='LOBBY_AEAD' AND s.migration_state='RECONCILED' AND n.dedup_key='lobby-mention:'||m.id||':'||n.user_id AND EXISTS(SELECT 1 FROM mentions mm WHERE mm.message_id=m.id AND mm.mentioned_user_id=n.user_id) AND ${unblocked('m.sender_id')})`:'FALSE';
 const invites=`EXISTS(SELECT 1 FROM invitations i JOIN rooms r ON r.id=i.room_id WHERE i.id=${value('invitationId')} AND i.room_id=${value('roomId')} AND i.sender_id=${value('senderId')} AND ((n.type='ROOM_INVITE' AND i.target_type='ROOM') OR (n.type='TEAM_INVITE' AND i.target_type='PLAY_SESSION' AND i.play_session_id=${value('playSessionId')} AND EXISTS(SELECT 1 FROM play_sessions ps WHERE ps.id=i.play_session_id AND ps.room_id=i.room_id AND ps.state<>'ENDED'))) AND EXISTS(SELECT 1 FROM room_members rm WHERE rm.room_id=i.room_id AND rm.user_id=i.sender_id) AND ${unblocked('i.sender_id')} AND (
  (n.dedup_key='invitation:'||i.id||':created' AND i.receiver_id=n.user_id AND i.status='PENDING') OR
  (n.dedup_key='invitation:'||i.id||':consented' AND i.status='PENDING' AND i.recipient_accepted_at IS NOT NULL AND EXISTS(SELECT 1 FROM room_members rm WHERE rm.room_id=i.room_id AND rm.user_id=n.user_id AND (rm.user_id=r.owner_id OR (rm.role='HELPER' AND EXISTS(SELECT 1 FROM permission_grants g WHERE g.room_id=rm.room_id AND g.user_id=rm.user_id AND g.permission=CASE WHEN i.target_type='ROOM' THEN 'MANAGE_MEMBERS' ELSE 'MANAGE_RECRUITMENT' END))))) OR
  (n.dedup_key='invitation:'||i.id||':'||i.status AND i.status IN ('ACCEPTED','REJECTED') AND n.user_id IN (i.sender_id,i.receiver_id))
 ))`;
 const join=`EXISTS(SELECT 1 FROM join_requests j JOIN recruitments rc ON rc.id=j.recruitment_id JOIN rooms r ON r.id=rc.room_id WHERE j.id=${value('requestId')} AND j.recruitment_id=${value('recruitmentId')} AND ${unblocked('j.applicant_id')} AND (
  (n.type='JOIN_REQUEST' AND j.status='PENDING' AND rc.state='OPEN' AND j.applicant_id=${value('applicantId')} AND n.dedup_key='join:'||j.id||':pending' AND r.owner_id=n.user_id AND EXISTS(SELECT 1 FROM room_members rm WHERE rm.room_id=r.id AND rm.user_id=n.user_id)) OR
  (n.type='JOIN_REQUEST_RESULT' AND j.applicant_id=n.user_id AND j.status IN ('ACCEPTED','REJECTED') AND j.status=${value('result')} AND n.dedup_key='join:'||j.id||':'||j.status AND ${unblocked('r.owner_id')} AND (j.status='REJECTED' OR EXISTS(SELECT 1 FROM room_members rm WHERE rm.room_id=r.id AND rm.user_id=n.user_id)))
 ))`;
 return `jsonb_typeof(${data})='object'
 AND EXISTS(SELECT 1 FROM "user" u WHERE u.id=n.user_id)
 AND COALESCE((SELECT action FROM admin_actions WHERE target_user_id=n.user_id AND action IN ('BAN','UNBAN') ORDER BY created_at DESC,id DESC LIMIT 1),'UNBAN')<>'BAN'
 AND NOT EXISTS(SELECT 1 FROM notification_preferences p WHERE p.user_id=n.user_id AND p.notification_type=n.type AND p.${preferenceColumn}=false)
 AND EXISTS(SELECT 1 FROM notification_outbox o WHERE o.notification_id=n.id AND o.user_id=n.user_id AND o.channel='${channel}' AND o.dedup_key=n.dedup_key AND o.scheduled_at<=clock_timestamp())
 AND CASE n.type
 WHEN 'DM' THEN ${strings('conversationId','messageId','senderId')} AND ${privateSource}
 WHEN 'MENTION' THEN ${strings('conversationId','messageId','mentionerId')} AND (${privateSource} OR ${lobbySource})
 WHEN 'FRIEND_INVITE' THEN ${strings('requestId','senderId')} AND EXISTS(SELECT 1 FROM friend_requests f WHERE f.id=${value('requestId')} AND f.sender_id=${value('senderId')} AND f.receiver_id=n.user_id AND f.sender_id<>n.user_id AND f.status='PENDING' AND n.dedup_key='friend:'||f.id AND ${unblocked('f.sender_id')})
 WHEN 'ROOM_INVITE' THEN ${strings('invitationId','roomId','senderId')} AND ${invites}
 WHEN 'TEAM_INVITE' THEN ${strings('invitationId','roomId','playSessionId','senderId')} AND ${invites}
 WHEN 'JOIN_REQUEST' THEN ${strings('requestId','recruitmentId','applicantId')} AND ${join}
 WHEN 'JOIN_REQUEST_RESULT' THEN ${strings('requestId','recruitmentId','result')} AND ${join}
 WHEN 'REMINDER_10MIN' THEN ${strings('playSessionId','roomId','scheduledAt')} AND EXISTS(SELECT 1 FROM play_sessions ps JOIN room_members rm ON rm.room_id=ps.room_id AND rm.user_id=n.user_id JOIN team_members tm ON tm.play_session_id=ps.id AND tm.user_id=n.user_id WHERE ps.id=${value('playSessionId')} AND ps.room_id=${value('roomId')} AND ps.timing_type='scheduledAt' AND ps.state='SCHEDULED' AND ps.scheduled_at>clock_timestamp() AND ps.scheduled_at=CASE WHEN pg_input_is_valid(${value('scheduledAt')},'timestamptz') THEN (${value('scheduledAt')})::timestamptz ELSE NULL END)
 ELSE FALSE END`;
}

/** Exact existing read-only crypto boot table list, no protocol changes. */
export async function notificationCryptoSchemaAvailable(db:{query:(sql:string,values:unknown[])=>Promise<{rows:Array<Record<string,unknown>>}>}){
 const tables=['chat_crypto_cohort_members','chat_crypto_devices','chat_crypto_history_cohorts','chat_crypto_identity_keys','chat_crypto_legacy_attestations','chat_crypto_legacy_candidate_images','chat_crypto_legacy_candidates','chat_crypto_legacy_migrations','chat_crypto_legacy_stage_objects','chat_crypto_legacy_stage_sources','chat_crypto_legacy_stages','chat_crypto_membership_intervals','chat_crypto_one_time_keys','chat_crypto_outbound_sessions','chat_crypto_protocol_events','chat_crypto_protocol_outbox','chat_crypto_recovery_backups','chat_crypto_report_audit','chat_crypto_report_evidence','chat_crypto_report_upload_sources','chat_crypto_state','chat_crypto_to_device_events','chat_crypto_upload_drafts'];
 return (await db.query('SELECT bool_and(to_regclass(name) IS NOT NULL) AS available FROM unnest($1::text[]) AS names(name)',[tables])).rows[0]?.available===true;
}

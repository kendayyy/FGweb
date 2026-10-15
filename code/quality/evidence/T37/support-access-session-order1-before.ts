import type {PoolClient} from 'pg';import {ErrorCode} from '@fg/contracts';import {ChatActor,chatError} from '../chat/chat.service.js';import {soleAdminUserId} from '../auth/auth-admin.js';
export async function currentSupportActor(db:PoolClient,actor:ChatActor,admin=false):Promise<NonNullable<ChatActor>>{
 if(!actor)chatError(ErrorCode.LOGIN_REQUIRED,'Login required');
 if(!(await db.query('SELECT id FROM "user" WHERE id=$1 FOR SHARE',[actor.userId])).rowCount)chatError(ErrorCode.LOGIN_REQUIRED,'Account unavailable');
 const session=(await db.query(`SELECT s.id,COALESCE((SELECT action='BAN' FROM admin_actions WHERE target_user_id=s.user_id AND action IN('BAN','UNBAN') ORDER BY created_at DESC,id DESC LIMIT 1),false) AS banned FROM session s WHERE s.id=$1 AND s.user_id=$2 AND s.expires_at>clock_timestamp() FOR SHARE OF s`,[actor.sessionId,actor.userId])).rows[0];
 if(!session)chatError(ErrorCode.LOGIN_REQUIRED,'Session expired or revoked');if(session.banned)chatError(ErrorCode.FORBIDDEN,'Account banned');
 if(admin){if(soleAdminUserId()!==actor.userId)chatError(ErrorCode.FORBIDDEN,'Admin required');const identity=(await db.query(`SELECT u.id FROM "user" u WHERE u.id=$1 AND u.name='kingame' AND u.email_verified=true AND EXISTS(SELECT 1 FROM account a WHERE a.user_id=u.id AND a.account_id=u.id AND a.provider_id='credential')`,[actor.userId])).rows[0];if(!identity||soleAdminUserId()!==actor.userId)chatError(ErrorCode.FORBIDDEN,'Admin identity unavailable');}
 return actor;
}

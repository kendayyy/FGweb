import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const source='apps/web/src/features/calls/media.ts',target='quality/evidence/T30/audio-rollback-proposed.ts',original=fs.readFileSync(source,'utf8');
const marker='          } catch (err) {\n            const vTarget = videoPub.track ?? videoTrack;';assert.equal(original.split(marker).length,2);
const replacement=`          } catch (err) {
            // A failed optional audio publication still owns a live capture.
            // Stop both inputs regardless of whether the SDK emitted an unpublish event.
            audioTrack.stop();
            videoTrack.stop();
            try {
              await room.localParticipant.unpublishTrack(audioTrack);
            } catch {
              // Roll back video independently even if audio was never registered.
            }
            const vTarget = videoPub.track ?? videoTrack;`;
const proposed=original.replace(marker,replacement);fs.writeFileSync(target,proposed,{flag:'wx'});
const hash=s=>createHash('sha256').update(s).digest('hex');fs.writeFileSync('quality/evidence/T30/audio-rollback-review.json',JSON.stringify({recordedAt:new Date().toISOString(),reviewer:'Codex',source,beforeSha256:hash(original),proposed:target,afterSha256:hash(proposed),redEvidence:'quality/evidence/T30/codex-t30-live-components-1.json',actualResult:'32/33 pass, optional screen audio rollback stop assertion failed',reason:'Stop both owned raw captures and attempt audio/video native rollback independently before clearing handles. Keep all33 cases/assertions unchanged. Capture provider mock getTracks omits added audio, so this assertion also proves media-session rollback independently of caller cleanup.',applicationAdopted:false},null,2)+'\n',{flag:'wx'});console.log('Prepared exact audio rollback correction; no application write.');

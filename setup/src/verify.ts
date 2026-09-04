/** Read back the live server state and assert it matches what step 1 intended. */
import 'dotenv/config';
import { StreamClient } from '@stream-io/node-sdk';

const c = new StreamClient(process.env.STREAM_API_KEY!, process.env.STREAM_API_SECRET!, {
  timeout: 30_000,
});
let fails = 0;
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) fails++;
};
const same = (a: string[] = [], b: string[] = []) =>
  a.length === b.length && [...a].sort().join() === [...b].sort().join();

const { app } = await c.getApp();
console.log('\nApp-level grants');
check('proctor has exactly create-call', same(app.grants['proctor'], ['create-call']), JSON.stringify(app.grants['proctor']));
check('student has no call capabilities', !app.grants['student']?.length, JSON.stringify(app.grants['student'] ?? null));
check('permission checks are enforced', app.disable_permissions_checks === false, `disable_permissions_checks=${app.disable_permissions_checks}`);

const exam = await c.video.getCallType({ name: 'default' });
console.log("\nCall type 'default' (exam)");
check('call_member_student can join + publish', same(exam.grants['call_member_student'], ['join-call','read-call','send-audio','send-video','screenshare']));
check('call_member_proctor adds record/captions/end', same(exam.grants['call_member_proctor'], ['join-call','read-call','send-audio','send-video','screenshare','start-recording','stop-recording','start-closed-captions','stop-closed-captions','end-call']));
check('app-level roles grant nothing in-call', !exam.grants['student']?.length && !exam.grants['proctor']?.length);
check('built-in user role untouched', (exam.grants['user']?.length ?? 0) > 0, `${exam.grants['user']?.length} caps`);
check('recording available', exam.settings.recording.mode === 'available');
check('captions available', exam.settings.transcription.closed_caption_mode === 'available');
check('backstage off', exam.settings.backstage.enabled === false);
check('camera off by default', exam.settings.video.camera_default_on === false);
check('mic off by default', exam.settings.audio.mic_default_on === false);
check('target resolution 1280x720', exam.settings.video.target_resolution.width === 1280 && exam.settings.video.target_resolution.height === 720);

const whisper = await c.video.getCallType({ name: 'audio_room' });
console.log("\nCall type 'audio_room' (whisper)");
check('only call_member_proctor can join', same(whisper.grants['call_member_proctor'], ['join-call','read-call','send-audio','end-call']));
check('call_member_student cannot join', !whisper.grants['call_member_student']?.length);
check('recording auto-on', whisper.settings.recording.mode === 'auto-on');
check('audio only recording', whisper.settings.recording.audio_only === true);
check('backstage off (no goLive needed)', whisper.settings.backstage.enabled === false);
check('video disabled', whisper.settings.video.enabled === false);
check('screensharing disabled', whisper.settings.screensharing.enabled === false);
check('no request-to-speak flow', whisper.settings.audio.access_request_enabled === false);

const chat = await c.chat.getChannelType({ name: 'messaging' });
console.log("\nChat channel type 'messaging'");
check('proctor has chat grants', (chat.grants?.['proctor']?.length ?? 0) > 0, `${chat.grants?.['proctor']?.length} grants`);
check('student has chat grants', (chat.grants?.['student']?.length ?? 0) > 0, `${chat.grants?.['student']?.length} grants`);

const { users } = await c.queryUsers({ payload: { filter_conditions: { role: { $in: ['proctor','student'] } }, limit: 30 } });
console.log('\nSeeded users');
const proctors = users.filter((u) => u.role === 'proctor');
const students = users.filter((u) => u.role === 'student');
check('4 proctors with role=proctor', proctors.length === 4, proctors.map((u) => u.id).join(', '));
check('10 students with role=student', students.length === 10, `${students.length} found`);
check('all ids prefixed by role', users.every((u) => u.id.startsWith(`${u.role}-`)));
check('display names set', users.every((u) => !!u.name));

console.log(fails ? `\n\x1b[31m${fails} check(s) failed\x1b[0m\n` : '\n\x1b[32mAll checks passed\x1b[0m\n');
process.exitCode = fails ? 1 : 0;

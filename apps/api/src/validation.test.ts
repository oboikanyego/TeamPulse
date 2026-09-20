import assert from 'node:assert/strict';
import test from 'node:test';
import { assistantSchema, automationRunSchema, capacitySchema, credentialsSchema, githubRepositorySchema, githubTaskLinkSchema, invitationSchema, notificationPreferencesSchema, roleUpdateSchema, slackIntegrationSchema, taskSchema, timeEntrySchema, workspaceSettingsSchema } from './validation.js';

test('credentials normalise email', () => {
  const value = credentialsSchema.parse({ email: 'ADMIN@TeamPulse.Demo', password: 'Demo123!' });
  assert.equal(value.email, 'admin@teampulse.demo');
});

test('task validation rejects unsupported state', () => {
  assert.throws(() => taskSchema.parse({ title: 'Test', status: 'Unknown' }));
});


test('time entry validation enforces positive bounded minutes', () => {
  assert.equal(timeEntrySchema.parse({ minutes: 90, note: 'Implementation' }).minutes, 90);
  assert.throws(() => timeEntrySchema.parse({ minutes: 0 }));
  assert.throws(() => timeEntrySchema.parse({ minutes: 1441 }));
});

test('capacity validation enforces a sensible weekly range', () => {
  assert.equal(capacitySchema.parse({ weeklyMinutes: 1800 }).weeklyMinutes, 1800);
  assert.throws(() => capacitySchema.parse({ weeklyMinutes: 30 }));
});


test('GitHub repository validation requires owner and repo', () => {
  assert.equal(githubRepositorySchema.parse({ owner: 'oboikanyego', repo: 'TeamPulse' }).repo, 'TeamPulse');
  assert.throws(() => githubRepositorySchema.parse({ owner: '', repo: 'TeamPulse' }));
});

test('GitHub task link validation requires a positive pull request number', () => {
  assert.equal(githubTaskLinkSchema.parse({ owner: 'oboikanyego', repo: 'TeamPulse', pullNumber: 3 }).pullNumber, 3);
  assert.throws(() => githubTaskLinkSchema.parse({ owner: 'oboikanyego', repo: 'TeamPulse', pullNumber: 0 }));
});


test('notification preferences provide safe defaults', () => {
  const value = notificationPreferencesSchema.parse({});
  assert.equal(value.taskAssigned, true);
  assert.equal(value.ciFailed, true);
  assert.equal(value.slackEnabled, false);
});

test('Slack integration accepts Slack incoming webhook URLs only', () => {
  const value = slackIntegrationSchema.parse({ webhookUrl: 'https://hooks.slack.com/services/T000/B000/secret', enabled: true });
  assert.equal(value.enabled, true);
  assert.throws(() => slackIntegrationSchema.parse({ webhookUrl: 'https://example.com/hook', enabled: true }));
});

test('automation run can request a digest', () => {
  assert.equal(automationRunSchema.parse({ includeDigest: true }).includeDigest, true);
});


test('advanced RBAC includes the read-only viewer role', () => {
  assert.equal(roleUpdateSchema.parse({ role: 'viewer' }).role, 'viewer');
});

test('workspace invitation validation normalises email and supports viewer', () => {
  const value=invitationSchema.parse({email:'VIEWER@Example.com',role:'viewer'});
  assert.equal(value.email,'viewer@example.com');
});

test('workspace settings provide SaaS-safe defaults', () => {
  const value=workspaceSettingsSchema.parse({name:'Engineering',description:''});
  assert.equal(value.timezone,'Africa/Johannesburg');
  assert.equal(value.weekStartsOn,'monday');
});

test('delivery assistant validation bounds the prompt and focus', () => {
  assert.equal(assistantSchema.parse({focus:'risks',question:'What is blocked?'}).focus,'risks');
  assert.throws(()=>assistantSchema.parse({focus:'unknown'}));
});

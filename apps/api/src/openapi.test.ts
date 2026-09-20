import assert from 'node:assert/strict';
import test from 'node:test';
import { openApiSpec } from './openapi.js';

test('OpenAPI documents core delivery, GitHub, notifications, Slack and automation endpoints', () => {
  assert.equal(openApiSpec.openapi, '3.0.3');
  assert.ok(openApiSpec.paths['/auth/login']);
  assert.ok(openApiSpec.paths['/workspaces/{workspaceId}/planning']);
  assert.ok(openApiSpec.paths['/sprints/{sprintId}/status']);
  assert.ok(openApiSpec.paths['/tasks/{taskId}/sprint']);
  assert.ok(openApiSpec.paths['/tasks/{taskId}/time']);
  assert.ok(openApiSpec.paths['/workspaces/{workspaceId}/analytics']);
  assert.ok(openApiSpec.paths['/workspaces/{workspaceId}/capacity/{userId}']);
  assert.ok(openApiSpec.paths['/workspaces/{workspaceId}/github/repositories']);
  assert.ok(openApiSpec.paths['/workspaces/{workspaceId}/github/insights']);
  assert.ok(openApiSpec.paths['/tasks/{taskId}/github-link']);
  assert.ok(openApiSpec.paths['/tasks/{taskId}/github-links']);
  assert.ok(openApiSpec.paths['/system/ready']);
  assert.ok(openApiSpec.paths['/workspaces/{workspaceId}/notification-settings']);
  assert.ok(openApiSpec.paths['/workspaces/{workspaceId}/notification-preferences']);
  assert.ok(openApiSpec.paths['/workspaces/{workspaceId}/slack']);
  assert.ok(openApiSpec.paths['/workspaces/{workspaceId}/slack/test']);
  assert.ok(openApiSpec.paths['/workspaces/{workspaceId}/automations/run']);
  assert.ok(openApiSpec.paths['/workspaces/{workspaceId}/automation-history']);
  assert.ok(openApiSpec.paths['/notifications/{notificationId}/read']);
});

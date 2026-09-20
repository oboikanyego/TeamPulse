import assert from 'node:assert/strict';
import test from 'node:test';
import { openApiSpec } from './openapi.js';

test('OpenAPI documents core and sprint endpoints', () => {
  assert.equal(openApiSpec.openapi, '3.0.3');
  assert.ok(openApiSpec.paths['/auth/login']);
  assert.ok(openApiSpec.paths['/workspaces/{workspaceId}/planning']);
  assert.ok(openApiSpec.paths['/sprints/{sprintId}/status']);
  assert.ok(openApiSpec.paths['/tasks/{taskId}/sprint']);
});

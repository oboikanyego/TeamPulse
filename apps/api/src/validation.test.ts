import assert from 'node:assert/strict';
import test from 'node:test';
import { credentialsSchema, taskSchema } from './validation.js';

test('credentials normalise email', () => {
  const value = credentialsSchema.parse({ email: 'ADMIN@TeamPulse.Demo', password: 'Demo123!' });
  assert.equal(value.email, 'admin@teampulse.demo');
});

test('task validation rejects unsupported state', () => {
  assert.throws(() => taskSchema.parse({ title: 'Test', status: 'Unknown' }));
});

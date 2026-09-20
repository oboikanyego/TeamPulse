import { z } from 'zod';

export const credentialsSchema = z.object({
  email: z.string().email().transform((value) => value.toLowerCase()),
  password: z.string().min(8)
});

export const registerSchema = credentialsSchema.extend({
  name: z.string().min(2).max(80)
});

export const workspaceSchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().max(500).default('')
});

export const projectSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(1000).default(''),
  status: z.enum(['Planning', 'Active', 'At Risk', 'Completed', 'Archived']).default('Planning'),
  priority: z.enum(['Low', 'Medium', 'High', 'Critical']).default('Medium'),
  startDate: z.string().nullable().optional(),
  targetDate: z.string().nullable().optional()
});

export const taskSchema = z.object({
  title: z.string().min(2).max(160),
  description: z.string().max(3000).default(''),
  type: z.enum(['Feature', 'Bug', 'Task', 'Improvement', 'Spike']).default('Task'),
  status: z.enum(['Backlog', 'To Do', 'In Progress', 'Blocked', 'Review', 'Done']).default('Backlog'),
  priority: z.enum(['Low', 'Medium', 'High', 'Critical']).default('Medium'),
  assigneeId: z.string().uuid().nullable().optional(),
  storyPoints: z.number().int().min(1).max(21).nullable().optional(),
  dueDate: z.string().nullable().optional(),
  labels: z.array(z.string().max(30)).max(10).default([])
});

export const taskPatchSchema = taskSchema.partial();

export const memberSchema = z.object({
  email: z.string().email().transform((value) => value.toLowerCase()),
  role: z.enum(['admin', 'manager', 'member'])
});

export const commentSchema = z.object({
  body: z.string().min(1).max(2000)
});


export const sprintSchema = z.object({
  name: z.string().min(2).max(120),
  goal: z.string().max(1000).default(''),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional()
});

export const sprintStatusSchema = z.object({
  status: z.enum(['Planned', 'Active', 'Completed'])
});

export const taskSprintSchema = z.object({
  sprintId: z.string().uuid().nullable()
});


export const timeEntrySchema = z.object({
  minutes: z.number().int().min(1).max(1440),
  note: z.string().max(500).default(''),
  spentAt: z.string().nullable().optional()
});

export const capacitySchema = z.object({
  weeklyMinutes: z.number().int().min(60).max(10080)
});


export const githubRepositorySchema = z.object({
  owner: z.string().min(1).max(100),
  repo: z.string().min(1).max(100)
});

export const githubTaskLinkSchema = z.object({
  owner: z.string().min(1).max(100),
  repo: z.string().min(1).max(100),
  pullNumber: z.number().int().positive()
});

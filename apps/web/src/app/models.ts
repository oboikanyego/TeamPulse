export interface User {
  id: string;
  name: string;
  email: string;
  avatar_url?: string | null;
}

export interface Workspace {
  id: string;
  name: string;
  description: string;
  role: 'admin' | 'manager' | 'member';
  project_count?: number;
}

export interface Project {
  id: string;
  workspace_id: string;
  name: string;
  description: string;
  status: 'Planning' | 'Active' | 'At Risk' | 'Completed' | 'Archived';
  priority: 'Low' | 'Medium' | 'High' | 'Critical';
  task_count?: number;
  done_count?: number;
  blocked_count?: number;
}

export type TaskStatus = 'Backlog' | 'To Do' | 'In Progress' | 'Blocked' | 'Review' | 'Done';

export interface Task {
  id: string;
  project_id: string;
  title: string;
  description: string;
  type: 'Feature' | 'Bug' | 'Task' | 'Improvement' | 'Spike';
  status: TaskStatus;
  priority: 'Low' | 'Medium' | 'High' | 'Critical';
  assignee_id?: string | null;
  assignee_name?: string | null;
  reporter_name?: string | null;
  story_points?: number | null;
  due_date?: string | null;
  labels: string[];
  updated_at: string;
}

export interface Member extends User {
  role: 'admin' | 'manager' | 'member';
  active_tasks: number;
}

export interface Activity {
  id: string;
  action: string;
  actor_name: string;
  entity_type: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface Dashboard {
  stats: {
    total: number;
    in_progress: number;
    blocked: number;
    completed_week: number;
    overdue: number;
  };
  projects: Array<{
    id: string;
    name: string;
    status: string;
    priority: string;
    total: number;
    done: number;
    blocked: number;
  }>;
  workload: Array<{ id: string; name: string; active: number }>;
}

export interface Comment {
  id: string;
  task_id?: string;
  user_id: string;
  user_name: string;
  body: string;
  created_at: string;
}

export interface SearchResult {
  kind: 'project' | 'task' | 'member';
  id: string;
  title: string;
  subtitle: string;
}

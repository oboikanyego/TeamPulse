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
  role: 'admin' | 'manager' | 'member' | 'viewer';
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
  sprint_id?: string | null;
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
  role: 'admin' | 'manager' | 'member' | 'viewer';
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


export interface Sprint {
  id: string;
  workspace_id: string;
  name: string;
  goal: string;
  status: 'Planned' | 'Active' | 'Completed';
  start_date: string | null;
  end_date: string | null;
  task_count: number;
  completed_count: number;
  blocked_count: number;
  total_points: number;
  completed_points: number;
  created_at: string;
}

export interface PlanningBoard {
  sprints: Sprint[];
  backlog: Array<Task & { project_name: string }>;
}


export interface TimeEntry {
  id: string;
  task_id: string;
  user_id: string;
  user_name: string;
  minutes: number;
  note: string;
  spent_at: string;
  created_at: string;
}

export interface DeliveryAnalytics {
  summary: {
    total_logged_minutes: number;
    completed_tasks: number;
    average_cycle_hours: number;
    active_sprint: string | null;
  };
  velocity: Array<{ sprint: string; planned: number; delivered: number }>;
  sprints: Array<Sprint & {
    planned_points: number;
    delivered_points: number;
    logged_minutes: number;
    ideal_remaining: number;
    actual_remaining: number;
  }>;
  capacity: Array<{
    id: string;
    name: string;
    role: string;
    weekly_minutes: number;
    logged_minutes: number;
    active_tasks: number;
    planned_points: number;
    utilization: number;
  }>;
}


export interface GitHubRepository {
  id: string;
  workspace_id: string;
  owner: string;
  repo: string;
  created_at: string;
}

export interface GitHubPullRequest {
  number: number;
  title: string;
  state: string;
  merged_at: string | null;
  user: string;
  url: string;
  created_at: string;
  updated_at: string;
}

export interface GitHubInsights {
  summary: {
    repositories: number;
    open_pull_requests: number;
    ci_success_rate: number;
    median_pr_lead_hours: number;
  };
  repositories: Array<{
    repository_id: string;
    full_name: string;
    url?: string;
    default_branch?: string;
    open_pull_requests?: number;
    merged_pull_requests?: number;
    median_pr_lead_hours?: number;
    ci_success_rate?: number;
    commit_count?: number;
    latest_commit?: { sha:string; message:string; author:string; date:string } | null;
    latest_ci?: { status:string; conclusion:string|null; name:string; updated_at:string } | null;
    pull_requests?: GitHubPullRequest[];
    recent_runs?: Array<{ id:number; name:string; status:string; conclusion:string|null; branch:string; url:string; updated_at:string }>;
    error?: string;
  }>;
}

export interface GitHubTaskLink {
  task_id: string;
  repository_id: string;
  pull_number: number;
  repository: string;
  title: string;
  state: string;
  merged: boolean;
  url: string;
  author?: string;
}


export interface NotificationPreferences {
  workspace_id: string;
  task_assigned: boolean;
  task_blocked: boolean;
  task_overdue: boolean;
  sprint_changed: boolean;
  ci_failed: boolean;
  daily_digest: boolean;
  slack_enabled: boolean;
}

export interface NotificationSettings {
  preferences: NotificationPreferences;
  slack: {
    configured: boolean;
    enabled: boolean;
    channel_name: string | null;
    updated_at: string | null;
  };
}

export interface TeamPulseNotification {
  id: string;
  user_id: string;
  workspace_id?: string | null;
  kind?: string;
  message: string;
  read_at: string | null;
  created_at?: string;
}

export interface AutomationEvent {
  id: string;
  workspace_id: string;
  key: string;
  kind: string;
  message: string;
  created_at: string;
}


export interface PermissionProfile { role:'admin'|'manager'|'member'|'viewer'; permissions:string[]; }
export interface AuditEntry { id:string; workspace_id:string; actor_id:string|null; actor_name:string; entity_type:string; entity_id:string|null; action:string; metadata:Record<string,unknown>; created_at:string; }
export interface ExecutiveReport {
  generated_at:string;
  summary:{total_tasks:number;completed_tasks:number;blocked_tasks:number;overdue_tasks:number;planned_points:number;delivered_points:number;delivery_rate:number;logged_hours:number;active_sprint:string|null};
  by_priority:Array<{priority:string;count:number}>;
  by_status:Array<{status:string;count:number}>;
  risks:Array<{id:string;title:string;status:string;priority:string;due_date:string|null}>;
}
export interface AssistantResponse { generated_at:string;focus:string;question:string;mode:string;summary:string;insights:string[];recommendations:string[];metrics:{total:number;blocked:number;overdue:number;in_review:number;unassigned:number}; }
export interface OnboardingState { steps:Array<{key:string;label:string;complete:boolean}>;completed:number;total:number;percent:number; }
export interface Invitation { id:string;workspace_id:string;email:string;role:string;status:string;invited_by:string;created_at:string;accepted_at:string|null; }
export interface WorkspaceAdminSettings {
  workspace:{id:string;name:string;description:string;owner_id:string};
  settings:{workspace_id:string;timezone:string;week_starts_on:'monday'|'sunday';updated_at:string};
  plan:{workspace_id:string;plan:'free'|'team'|'business';seats:number;status:'active'|'trial';trial_ends_at:string|null;updated_at:string};
}
export interface BillingState { workspace_id:string;plan:string;seats:number;status:string;trial_ends_at:string|null;seats_used:number;features:Record<string,boolean>;checkout_enabled:boolean; }

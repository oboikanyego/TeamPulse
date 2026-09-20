import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from '../../environments/environment';
import type { Activity, AssistantResponse, AuditEntry, AutomationEvent, BillingState, Comment, Dashboard, DeliveryAnalytics, ExecutiveReport, GitHubInsights, GitHubRepository, GitHubTaskLink, Invitation, Member, NotificationPreferences, NotificationSettings, OnboardingState, PermissionProfile, PlanningBoard, Project, SearchResult, Sprint, Task, TaskStatus, TeamPulseNotification, TimeEntry, Workspace, WorkspaceAdminSettings } from '../models';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  workspaces() {
    return this.http.get<Workspace[]>(`${this.base}/workspaces`);
  }

  createWorkspace(body: { name: string; description: string }) {
    return this.http.post<Workspace>(`${this.base}/workspaces`, body);
  }

  projects(workspaceId: string) {
    return this.http.get<Project[]>(`${this.base}/workspaces/${workspaceId}/projects`);
  }

  createProject(workspaceId: string, body: { name: string; description: string; status: string; priority: string }) {
    return this.http.post<Project>(`${this.base}/workspaces/${workspaceId}/projects`, body);
  }

  dashboard(workspaceId: string) {
    return this.http.get<Dashboard>(`${this.base}/workspaces/${workspaceId}/dashboard`);
  }

  activity(workspaceId: string) {
    return this.http.get<Activity[]>(`${this.base}/workspaces/${workspaceId}/activity`);
  }

  members(workspaceId: string) {
    return this.http.get<Member[]>(`${this.base}/workspaces/${workspaceId}/members`);
  }

  addMember(workspaceId: string, body: { email: string; role: string }) {
    return this.http.post<Member>(`${this.base}/workspaces/${workspaceId}/members`, body);
  }

  tasks(projectId: string) {
    return this.http.get<Task[]>(`${this.base}/projects/${projectId}/tasks`);
  }

  createTask(projectId: string, body: {
    title: string;
    description: string;
    type: string;
    status: TaskStatus;
    priority: string;
    assigneeId?: string | null;
    storyPoints?: number | null;
    dueDate?: string | null;
    labels?: string[];
  }) {
    return this.http.post<Task>(`${this.base}/projects/${projectId}/tasks`, body);
  }

  updateTask(taskId: string, body: Partial<Task> & { status?: TaskStatus }) {
    const mapped = {
      ...body,
      assigneeId: body.assignee_id,
      storyPoints: body.story_points,
      dueDate: body.due_date
    } as Record<string, unknown>;
    delete mapped['assignee_id'];
    delete mapped['assignee_name'];
    delete mapped['reporter_name'];
    delete mapped['story_points'];
    delete mapped['due_date'];
    delete mapped['updated_at'];
    delete mapped['project_id'];
    delete mapped['id'];
    return this.http.patch<Task>(`${this.base}/tasks/${taskId}`, mapped);
  }

  comments(taskId: string) {
    return this.http.get<Comment[]>(`${this.base}/tasks/${taskId}/comments`);
  }

  addComment(taskId: string, body: string) {
    return this.http.post<Comment>(`${this.base}/tasks/${taskId}/comments`, { body });
  }

  search(workspaceId: string, q: string) {
    return this.http.get<SearchResult[]>(`${this.base}/workspaces/${workspaceId}/search`, {
      params: new HttpParams().set('q', q)
    });
  }

  planning(workspaceId: string) {
    return this.http.get<PlanningBoard>(`${this.base}/workspaces/${workspaceId}/planning`);
  }

  createSprint(workspaceId: string, body: { name: string; goal: string; startDate: string | null; endDate: string | null }) {
    return this.http.post<Sprint>(`${this.base}/workspaces/${workspaceId}/sprints`, body);
  }

  setSprintStatus(sprintId: string, status: Sprint['status']) {
    return this.http.patch<Sprint>(`${this.base}/sprints/${sprintId}/status`, { status });
  }

  assignTaskToSprint(taskId: string, sprintId: string | null) {
    return this.http.patch<Task>(`${this.base}/tasks/${taskId}/sprint`, { sprintId });
  }

  timeEntries(taskId: string) {
    return this.http.get<TimeEntry[]>(`${this.base}/tasks/${taskId}/time`);
  }

  logTime(taskId: string, body: { minutes: number; note: string; spentAt: string | null }) {
    return this.http.post<TimeEntry>(`${this.base}/tasks/${taskId}/time`, body);
  }

  analytics(workspaceId: string) {
    return this.http.get<DeliveryAnalytics>(`${this.base}/workspaces/${workspaceId}/analytics`);
  }

  updateCapacity(workspaceId: string, userId: string, weeklyMinutes: number) {
    return this.http.patch<{user_id:string;weekly_minutes:number}>(`${this.base}/workspaces/${workspaceId}/capacity/${userId}`, { weeklyMinutes });
  }

  githubRepositories(workspaceId: string) {
    return this.http.get<GitHubRepository[]>(`${this.base}/workspaces/${workspaceId}/github/repositories`);
  }

  connectGitHubRepository(workspaceId: string, owner: string, repo: string) {
    return this.http.post<GitHubRepository>(`${this.base}/workspaces/${workspaceId}/github/repositories`, { owner, repo });
  }

  githubInsights(workspaceId: string) {
    return this.http.get<GitHubInsights>(`${this.base}/workspaces/${workspaceId}/github/insights`);
  }

  githubTaskLinks(taskId: string) {
    return this.http.get<GitHubTaskLink[]>(`${this.base}/tasks/${taskId}/github-links`);
  }

  linkGitHubPullRequest(taskId: string, body: { owner:string; repo:string; pullNumber:number }) {
    return this.http.post<GitHubTaskLink>(`${this.base}/tasks/${taskId}/github-link`, body);
  }

  permissions(workspaceId: string) { return this.http.get<PermissionProfile>(`${this.base}/workspaces/${workspaceId}/permissions`); }
  updateMemberRole(workspaceId:string,userId:string,role:'admin'|'manager'|'member'|'viewer'){ return this.http.patch(`${this.base}/workspaces/${workspaceId}/members/${userId}/role`,{role}); }
  audit(workspaceId:string){ return this.http.get<AuditEntry[]>(`${this.base}/workspaces/${workspaceId}/audit`); }
  executiveReport(workspaceId:string){ return this.http.get<ExecutiveReport>(`${this.base}/workspaces/${workspaceId}/reports/executive`); }
  exportReportUrl(workspaceId:string){ return `${this.base}/workspaces/${workspaceId}/reports/export.csv`; }
  assistant(workspaceId:string,body:{focus:string;question:string}){ return this.http.post<AssistantResponse>(`${this.base}/workspaces/${workspaceId}/assistant`,body); }
  onboarding(workspaceId:string){ return this.http.get<OnboardingState>(`${this.base}/workspaces/${workspaceId}/onboarding`); }
  invitations(workspaceId:string){ return this.http.get<Invitation[]>(`${this.base}/workspaces/${workspaceId}/invitations`); }
  invite(workspaceId:string,email:string,role:string){ return this.http.post<Invitation>(`${this.base}/workspaces/${workspaceId}/invitations`,{email,role}); }
  workspaceSettings(workspaceId:string){ return this.http.get<WorkspaceAdminSettings>(`${this.base}/workspaces/${workspaceId}/settings`); }
  updateWorkspaceSettings(workspaceId:string,body:{name:string;description:string;timezone:string;weekStartsOn:'monday'|'sunday'}){ return this.http.patch<WorkspaceAdminSettings>(`${this.base}/workspaces/${workspaceId}/settings`,body); }
  billing(workspaceId:string){ return this.http.get<BillingState>(`${this.base}/workspaces/${workspaceId}/billing`); }

  notificationSettings(workspaceId: string) {
    return this.http.get<NotificationSettings>(`${this.base}/workspaces/${workspaceId}/notification-settings`);
  }

  updateNotificationPreferences(workspaceId: string, body: {
    taskAssigned:boolean; taskBlocked:boolean; taskOverdue:boolean; sprintChanged:boolean;
    ciFailed:boolean; dailyDigest:boolean; slackEnabled:boolean;
  }) {
    return this.http.patch<NotificationPreferences>(`${this.base}/workspaces/${workspaceId}/notification-preferences`, body);
  }

  configureSlack(workspaceId: string, body: { webhookUrl?:string|null; channelName?:string|null; enabled:boolean }) {
    return this.http.put<NotificationSettings['slack']>(`${this.base}/workspaces/${workspaceId}/slack`, body);
  }

  testSlack(workspaceId: string) {
    return this.http.post<{sent:boolean}>(`${this.base}/workspaces/${workspaceId}/slack/test`, {});
  }

  runAutomations(workspaceId: string, includeDigest = false) {
    return this.http.post<{alerts:number;digest:boolean}>(`${this.base}/workspaces/${workspaceId}/automations/run`, { includeDigest });
  }

  automationHistory(workspaceId: string) {
    return this.http.get<AutomationEvent[]>(`${this.base}/workspaces/${workspaceId}/automation-history`);
  }

  notifications() {
    return this.http.get<TeamPulseNotification[]>(`${this.base}/notifications`);
  }

  markNotificationRead(notificationId: string) {
    return this.http.patch<TeamPulseNotification>(`${this.base}/notifications/${notificationId}/read`, {});
  }
}

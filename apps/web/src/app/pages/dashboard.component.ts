import { DatePipe } from '@angular/common';
import { Component, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { ApiService } from '../core/api.service';
import { SocketService } from '../core/socket.service';
import { WorkspaceStore } from '../core/workspace.store';
import type { Activity, Dashboard } from '../models';

@Component({
  standalone: true,
  imports: [DatePipe, RouterLink],
  template: `
    <div class="page-head">
      <div><p class="eyebrow">WORKSPACE OVERVIEW</p><h1>{{ store.current()?.name || 'TeamPulse' }}</h1><p class="muted">{{ store.current()?.description }}</p></div>
      <div class="head-meta"><span class="badge">{{ store.current()?.role }}</span><span class="muted">Live delivery signals</span></div>
    </div>

    @if (loading()) {
      <div class="skeleton-grid">@for (_ of [1,2,3,4]; track $index) { <div class="skeleton"></div> }</div>
    } @else if (dashboard(); as data) {
      <div class="metrics-grid">
        <article class="metric card"><span>Active work</span><strong>{{ data.stats.total }}</strong><small>Across all projects</small></article>
        <article class="metric card"><span>In progress</span><strong>{{ data.stats.in_progress }}</strong><small>Moving right now</small></article>
        <article class="metric card danger"><span>Blocked</span><strong>{{ data.stats.blocked }}</strong><small>Needs attention</small></article>
        <article class="metric card"><span>Completed</span><strong>{{ data.stats.completed_week }}</strong><small>Last 7 days</small></article>
        <article class="metric card warning"><span>Overdue</span><strong>{{ data.stats.overdue }}</strong><small>Open past due date</small></article>
      </div>

      <div class="dashboard-grid">
        <section class="card panel projects-panel">
          <div class="panel-head"><div><p class="eyebrow">DELIVERY HEALTH</p><h2>Projects</h2></div><span class="muted">{{ data.projects.length }} active streams</span></div>
          <div class="project-health">
            @for (project of data.projects; track project.id) {
              <a class="health-row" [routerLink]="['/project', project.id]">
                <div class="health-main"><strong>{{ project.name }}</strong><span class="badge" [class.risk]="project.status === 'At Risk'">{{ project.status }}</span></div>
                <div class="progress-track"><span [style.width.%]="progress(project.done, project.total)"></span></div>
                <div class="health-meta"><span>{{ project.done }}/{{ project.total }} done</span><span [class.text-danger]="project.blocked > 0">{{ project.blocked }} blocked</span><span>{{ progress(project.done, project.total) }}%</span></div>
              </a>
            } @empty { <p class="empty">Create your first project from the sidebar.</p> }
          </div>
        </section>

        <section class="card panel">
          <div class="panel-head"><div><p class="eyebrow">CAPACITY</p><h2>Team workload</h2></div></div>
          <div class="workload-list">
            @for (person of data.workload; track person.id) {
              <div class="workload-row">
                <div class="avatar">{{ initials(person.name) }}</div>
                <div class="grow"><div class="row-between"><strong>{{ person.name }}</strong><span>{{ person.active }} active</span></div><div class="progress-track small"><span [style.width.%]="workloadPercent(person.active, data.workload)"></span></div></div>
              </div>
            }
          </div>
        </section>

        <section class="card panel activity-panel">
          <div class="panel-head"><div><p class="eyebrow">ACTIVITY</p><h2>What changed</h2></div><span class="live-pill"><i></i>Realtime</span></div>
          <div class="timeline">
            @for (item of activity(); track item.id) {
              <div class="timeline-row"><div class="timeline-dot"></div><div><p><strong>{{ item.actor_name }}</strong> {{ item.action }}</p><small>{{ item.created_at | date:'MMM d, HH:mm' }}</small></div></div>
            } @empty { <p class="empty">Activity will appear as the team works.</p> }
          </div>
        </section>
      </div>
    }
  `
})
export class DashboardComponent {
  readonly api = inject(ApiService);
  readonly store = inject(WorkspaceStore);
  private readonly socket = inject(SocketService);

  readonly dashboard = signal<Dashboard | null>(null);
  readonly activity = signal<Activity[]>([]);
  readonly loading = signal(true);

  constructor() {
    effect(() => {
      const workspace = this.store.current();
      if (workspace) this.load(workspace.id);
    });

    this.socket.on('task.updated').subscribe(() => this.reloadCurrent());
    this.socket.on('task.created').subscribe(() => this.reloadCurrent());
    this.socket.on('comment.created').subscribe(() => this.reloadCurrent());
  }

  progress(done: number, total: number): number {
    return total ? Math.round((done / total) * 100) : 0;
  }

  workloadPercent(active: number, people: Array<{ active: number }>): number {
    const max = Math.max(1, ...people.map((person) => person.active));
    return Math.max(8, Math.round((active / max) * 100));
  }

  initials(name: string): string {
    return name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  }

  private reloadCurrent(): void {
    const workspace = this.store.current();
    if (workspace) this.load(workspace.id, false);
  }

  private load(workspaceId: string, showLoading = true): void {
    if (showLoading) this.loading.set(true);
    forkJoin({ dashboard: this.api.dashboard(workspaceId), activity: this.api.activity(workspaceId) }).subscribe({
      next: ({ dashboard, activity }) => {
        this.dashboard.set(dashboard);
        this.activity.set(activity);
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }
}

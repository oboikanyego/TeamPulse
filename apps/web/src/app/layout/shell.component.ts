import { Component, effect, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { debounceTime, distinctUntilChanged, of, switchMap } from 'rxjs';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { SocketService } from '../core/socket.service';
import { WorkspaceStore } from '../core/workspace.store';
import type { Project, SearchResult, Workspace } from '../models';

@Component({
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <div class="app-shell">
      <aside class="sidebar" [class.open]="mobileOpen()">
        <div class="brand-row"><div class="brand-mark small">TP</div><div><strong>TeamPulse</strong><small>Delivery operations</small></div></div>

        <div class="workspace-picker">
          <span class="eyebrow">WORKSPACE</span>
          <select [value]="store.current()?.id || ''" (change)="selectWorkspace($any($event.target).value)">
            @for (workspace of workspaces(); track workspace.id) {
              <option [value]="workspace.id">{{ workspace.name }}</option>
            }
          </select>
          <button class="text-btn" (click)="workspaceModal.set(true)">+ New workspace</button>
        </div>

        <nav class="nav">
          <a routerLink="/dashboard" routerLinkActive="active"><span>⌂</span>Overview</a>
          <a routerLink="/team" routerLinkActive="active"><span>◎</span>Team</a>
          <a routerLink="/planning" routerLinkActive="active"><span>◫</span>Sprints</a>
          <a routerLink="/analytics" routerLinkActive="active"><span>◒</span>Analytics</a>
        </nav>

        <div class="sidebar-section">
          <div class="section-label"><span>PROJECTS</span><button (click)="projectModal.set(true)">+</button></div>
          <div class="project-links">
            @for (project of store.projects(); track project.id) {
              <a [routerLink]="['/project', project.id]" routerLinkActive="active">
                <span class="project-dot"></span><span>{{ project.name }}</span>
              </a>
            } @empty {
              <p class="sidebar-empty">No projects yet.</p>
            }
          </div>
        </div>

        <div class="sidebar-footer">
          <div class="avatar">{{ initials(auth.user()?.name || 'User') }}</div>
          <div class="user-meta"><strong>{{ auth.user()?.name || 'Loading…' }}</strong><small>{{ auth.user()?.email }}</small></div>
          <button class="icon-btn" title="Sign out" (click)="auth.logout()">↗</button>
        </div>
      </aside>

      <main class="main">
        <header class="topbar">
          <button class="menu-btn" (click)="mobileOpen.set(!mobileOpen())">☰</button>
          <div class="search-wrap">
            <span>⌕</span>
            <input [formControl]="searchControl" placeholder="Search tasks, projects, people…">
            @if (searchResults().length) {
              <div class="search-results card">
                @for (item of searchResults(); track item.kind + item.id) {
                  <button (click)="openResult(item)">
                    <span class="result-kind">{{ item.kind }}</span>
                    <span><strong>{{ item.title }}</strong><small>{{ item.subtitle }}</small></span>
                  </button>
                }
              </div>
            }
          </div>
          <div class="top-actions">
            <span class="live-pill"><i></i>Live</span>
            <button class="icon-btn" title="Notifications">♢<b class="notif">{{ unread() }}</b></button>
          </div>
        </header>
        <section class="page"><router-outlet /></section>
      </main>
    </div>

    @if (workspaceModal()) {
      <div class="modal-backdrop" (click)="workspaceModal.set(false)">
        <section class="modal card" (click)="$event.stopPropagation()">
          <div class="modal-head"><div><p class="eyebrow">NEW WORKSPACE</p><h3>Create a team space</h3></div><button class="icon-btn" (click)="workspaceModal.set(false)">×</button></div>
          <label>Name<input #workspaceName placeholder="e.g. Product Engineering"></label>
          <label>Description<textarea #workspaceDescription placeholder="What does this team own?"></textarea></label>
          <button class="btn primary" (click)="createWorkspace(workspaceName.value, workspaceDescription.value)">Create workspace</button>
        </section>
      </div>
    }

    @if (projectModal()) {
      <div class="modal-backdrop" (click)="projectModal.set(false)">
        <section class="modal card" (click)="$event.stopPropagation()">
          <div class="modal-head"><div><p class="eyebrow">NEW PROJECT</p><h3>Start a delivery stream</h3></div><button class="icon-btn" (click)="projectModal.set(false)">×</button></div>
          <label>Name<input #projectName placeholder="e.g. Customer Portal"></label>
          <label>Description<textarea #projectDescription placeholder="Outcome and scope"></textarea></label>
          <div class="form-grid">
            <label>Status<select #projectStatus><option>Planning</option><option>Active</option><option>At Risk</option></select></label>
            <label>Priority<select #projectPriority><option>Medium</option><option>High</option><option>Critical</option><option>Low</option></select></label>
          </div>
          <button class="btn primary" (click)="createProject(projectName.value, projectDescription.value, projectStatus.value, projectPriority.value)">Create project</button>
        </section>
      </div>
    }
  `
})
export class ShellComponent {
  readonly api = inject(ApiService);
  readonly auth = inject(AuthService);
  readonly store = inject(WorkspaceStore);
  private readonly socket = inject(SocketService);
  private readonly router = inject(Router);

  readonly workspaces = signal<Workspace[]>([]);
  readonly unread = signal(0);
  readonly workspaceModal = signal(false);
  readonly projectModal = signal(false);
  readonly mobileOpen = signal(false);
  readonly searchResults = signal<SearchResult[]>([]);
  readonly searchControl = new FormControl('', { nonNullable: true });

  constructor() {
    this.loadWorkspaces();
    this.api.notifications().subscribe((items) => this.unread.set(items.filter((item) => !item.read_at).length));

    this.searchControl.valueChanges.pipe(
      debounceTime(250),
      distinctUntilChanged(),
      switchMap((query) => {
        const workspace = this.store.current();
        return workspace && query.trim().length >= 2 ? this.api.search(workspace.id, query.trim()) : of([]);
      })
    ).subscribe((results) => this.searchResults.set(results));

    effect(() => {
      const workspace = this.store.current();
      if (workspace) this.socket.connect(workspace.id);
    });
  }

  selectWorkspace(id: string): void {
    const workspace = this.workspaces().find((item) => item.id === id);
    if (!workspace) return;
    this.store.setCurrent(workspace);
    this.loadProjects(workspace.id);
    void this.router.navigateByUrl('/dashboard');
  }

  createWorkspace(name: string, description: string): void {
    if (name.trim().length < 2) return;
    this.api.createWorkspace({ name: name.trim(), description: description.trim() }).subscribe((workspace) => {
      this.workspaces.update((items) => [...items, workspace]);
      this.workspaceModal.set(false);
      this.selectWorkspace(workspace.id);
    });
  }

  createProject(name: string, description: string, status: string, priority: string): void {
    const workspace = this.store.current();
    if (!workspace || name.trim().length < 2) return;
    this.api.createProject(workspace.id, { name: name.trim(), description: description.trim(), status, priority })
      .subscribe((project) => {
        this.store.setProjects([project, ...this.store.projects()]);
        this.projectModal.set(false);
        void this.router.navigate(['/project', project.id]);
      });
  }

  openResult(result: SearchResult): void {
    this.searchResults.set([]);
    this.searchControl.setValue('', { emitEvent: false });
    if (result.kind === 'project') {
      void this.router.navigate(['/project', result.id]);
    } else if (result.kind === 'member') {
      void this.router.navigateByUrl('/team');
    } else {
      void this.router.navigateByUrl('/dashboard');
    }
  }

  initials(name: string): string {
    return name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  }

  private loadWorkspaces(): void {
    this.api.workspaces().subscribe((workspaces) => {
      this.workspaces.set(workspaces);
      const selected = workspaces.find((item) => item.id === this.store.preferredId()) ?? workspaces[0];
      if (selected) {
        this.store.setCurrent(selected);
        this.loadProjects(selected.id);
      }
    });
  }

  private loadProjects(workspaceId: string): void {
    this.api.projects(workspaceId).subscribe((projects: Project[]) => this.store.setProjects(projects));
  }
}

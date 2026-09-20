import { Injectable, signal } from '@angular/core';
import type { Project, Workspace } from '../models';

@Injectable({ providedIn: 'root' })
export class WorkspaceStore {
  private readonly currentState = signal<Workspace | null>(null);
  private readonly projectsState = signal<Project[]>([]);

  readonly current = this.currentState.asReadonly();
  readonly projects = this.projectsState.asReadonly();

  setCurrent(workspace: Workspace): void {
    this.currentState.set(workspace);
    localStorage.setItem('teampulse_workspace', workspace.id);
  }

  setProjects(projects: Project[]): void {
    this.projectsState.set(projects);
  }

  preferredId(): string | null {
    return localStorage.getItem('teampulse_workspace');
  }
}

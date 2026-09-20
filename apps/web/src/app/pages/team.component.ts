import { Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { WorkspaceStore } from '../core/workspace.store';
import type { Member } from '../models';

@Component({
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="page-head">
      <div><p class="eyebrow">PEOPLE & OWNERSHIP</p><h1>Team</h1><p class="muted">Roles and current workload for {{ store.current()?.name }}.</p></div>
      @if (store.current()?.role !== 'member') { <button class="btn primary" (click)="inviteOpen.set(true)">+ Add member</button> }
    </div>

    <section class="card panel">
      <div class="team-table">
        <div class="table-row table-head"><span>Person</span><span>Role</span><span>Active work</span><span>Status</span></div>
        @for (member of members(); track member.id) {
          <div class="table-row">
            <div class="person-cell"><div class="avatar">{{ initials(member.name) }}</div><div><strong>{{ member.name }}</strong><small>{{ member.email }}</small></div></div>
            <span><span class="badge">{{ member.role }}</span></span>
            <span>{{ member.active_tasks }} tasks</span>
            <span class="status-online"><i></i>Available</span>
          </div>
        }
      </div>
    </section>

    @if (inviteOpen()) {
      <div class="modal-backdrop" (click)="inviteOpen.set(false)">
        <section class="modal card" (click)="$event.stopPropagation()">
          <div class="modal-head"><div><p class="eyebrow">ADD MEMBER</p><h3>Add a registered user</h3></div><button class="icon-btn" (click)="inviteOpen.set(false)">×</button></div>
          <p class="muted">For v1, the person registers first, then an admin or manager adds their email to the workspace.</p>
          <label>Email<input [(ngModel)]="inviteEmail" type="email" placeholder="person@company.com"></label>
          <label>Role<select [(ngModel)]="inviteRole"><option value="member">Member</option><option value="manager">Manager</option><option value="admin">Admin</option></select></label>
          @if (inviteError()) { <p class="form-error">{{ inviteError() }}</p> }
          <button class="btn primary" (click)="addMember()">Add to workspace</button>
        </section>
      </div>
    }
  `
})
export class TeamComponent {
  readonly api = inject(ApiService);
  readonly store = inject(WorkspaceStore);
  readonly members = signal<Member[]>([]);
  readonly inviteOpen = signal(false);
  readonly inviteError = signal('');
  inviteEmail = '';
  inviteRole = 'member';

  constructor() {
    effect(() => {
      const workspace = this.store.current();
      if (workspace) this.load(workspace.id);
    });
  }

  addMember(): void {
    const workspace = this.store.current();
    if (!workspace || !this.inviteEmail.trim()) return;
    this.inviteError.set('');
    this.api.addMember(workspace.id, { email: this.inviteEmail.trim(), role: this.inviteRole }).subscribe({
      next: () => {
        this.inviteOpen.set(false);
        this.inviteEmail = '';
        this.load(workspace.id);
      },
      error: (err) => this.inviteError.set(err.error?.message || 'Unable to add member')
    });
  }

  initials(name: string): string {
    return name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  }

  private load(workspaceId: string): void {
    this.api.members(workspaceId).subscribe((members) => this.members.set(members));
  }
}

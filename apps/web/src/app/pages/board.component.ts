import { DatePipe } from '@angular/common';
import { Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { switchMap } from 'rxjs';
import { ApiService } from '../core/api.service';
import { SocketService } from '../core/socket.service';
import { WorkspaceStore } from '../core/workspace.store';
import type { Comment, Member, Task, TaskStatus, TimeEntry } from '../models';

@Component({
  standalone: true,
  imports: [FormsModule, DatePipe],
  template: `
    <div class="page-head board-head">
      <div>
        <p class="eyebrow">PROJECT BOARD</p>
        <h1>{{ projectName() }}</h1>
        <p class="muted">Move work through the system. Updates sync to everyone in the workspace.</p>
      </div>
      <button class="btn primary" (click)="taskModal.set(true)">+ New task</button>
    </div>

    <div class="board-toolbar card">
      <div class="filter-set">
        <button [class.active]="priorityFilter() === 'All'" (click)="priorityFilter.set('All')">All</button>
        <button [class.active]="priorityFilter() === 'High'" (click)="priorityFilter.set('High')">High priority</button>
        <button [class.active]="priorityFilter() === 'Critical'" (click)="priorityFilter.set('Critical')">Critical</button>
      </div>
      <span class="muted">{{ filteredTasks().length }} work items</span>
    </div>

    <div class="kanban">
      @for (status of statuses; track status) {
        <section class="kanban-column" (dragover)="$event.preventDefault()" (drop)="drop(status)">
          <div class="column-head"><span><i [class]="statusClass(status)"></i>{{ status }}</span><b>{{ tasksFor(status).length }}</b></div>
          <div class="cards">
            @for (task of tasksFor(status); track task.id) {
              <article class="task-card card" draggable="true" (dragstart)="dragStart(task)" (click)="openTask(task)">
                <div class="task-top"><span class="task-type">{{ task.type }}</span><span class="priority" [class.critical]="task.priority === 'Critical'" [class.high]="task.priority === 'High'">{{ task.priority }}</span></div>
                <h3>{{ task.title }}</h3>
                <p>{{ task.description || 'No description yet.' }}</p>
                <div class="task-labels">@for (label of task.labels; track label) { <span>#{{ label }}</span> }</div>
                <div class="task-foot">
                  <div class="avatar small-avatar">{{ initials(task.assignee_name || 'Unassigned') }}</div>
                  <div class="task-meta">
                    @if (task.story_points) { <span>◈ {{ task.story_points }}</span> }
                    @if (task.due_date) { <span [class.text-danger]="isOverdue(task)">◷ {{ task.due_date | date:'MMM d' }}</span> }
                  </div>
                </div>
              </article>
            } @empty { <div class="drop-empty">Drop work here</div> }
          </div>
        </section>
      }
    </div>

    @if (taskModal()) {
      <div class="modal-backdrop" (click)="taskModal.set(false)">
        <section class="modal card wide" (click)="$event.stopPropagation()">
          <div class="modal-head"><div><p class="eyebrow">NEW WORK ITEM</p><h3>Add task</h3></div><button class="icon-btn" (click)="taskModal.set(false)">×</button></div>
          <label>Title<input [(ngModel)]="newTask.title" placeholder="What needs to happen?"></label>
          <label>Description<textarea [(ngModel)]="newTask.description" placeholder="Context, outcome and acceptance notes"></textarea></label>
          <div class="form-grid three">
            <label>Type<select [(ngModel)]="newTask.type"><option>Feature</option><option>Bug</option><option>Task</option><option>Improvement</option><option>Spike</option></select></label>
            <label>Priority<select [(ngModel)]="newTask.priority"><option>Medium</option><option>High</option><option>Critical</option><option>Low</option></select></label>
            <label>Points<input [(ngModel)]="newTask.storyPoints" type="number" min="1" max="21"></label>
          </div>
          <div class="form-grid">
            <label>Assignee<select [(ngModel)]="newTask.assigneeId"><option [ngValue]="null">Unassigned</option>@for (member of members(); track member.id) { <option [value]="member.id">{{ member.name }}</option> }</select></label>
            <label>Due date<input [(ngModel)]="newTask.dueDate" type="date"></label>
          </div>
          <button class="btn primary" (click)="createTask()">Create task</button>
        </section>
      </div>
    }

    @if (selectedTask(); as task) {
      <div class="modal-backdrop detail-backdrop" (click)="selectedTask.set(null)">
        <section class="task-detail card" (click)="$event.stopPropagation()">
          <div class="modal-head"><div><p class="eyebrow">{{ task.type }} · {{ task.priority }}</p><h2>{{ task.title }}</h2></div><button class="icon-btn" (click)="selectedTask.set(null)">×</button></div>
          <p class="detail-copy">{{ task.description || 'No description yet.' }}</p>
          <div class="detail-grid">
            <div><span>Status</span><strong>{{ task.status }}</strong></div>
            <div><span>Assignee</span><strong>{{ task.assignee_name || 'Unassigned' }}</strong></div>
            <div><span>Story points</span><strong>{{ task.story_points || '—' }}</strong></div>
            <div><span>Due</span><strong>{{ task.due_date ? (task.due_date | date:'MMM d, y') : '—' }}</strong></div>
          </div>
          <div class="time-section">
            <div class="panel-head"><div><p class="eyebrow">TIME TRACKING</p><h3>Work log</h3></div><strong>{{totalLoggedHours()}}h</strong></div>
            <div class="time-entry-form">
              <label>Minutes<input [(ngModel)]="timeMinutes" type="number" min="1" max="1440" placeholder="60"></label>
              <label>Work date<input [(ngModel)]="timeDate" type="date"></label>
              <label class="time-note">Note<input [(ngModel)]="timeNote" placeholder="What did you work on?"></label>
              <button class="btn secondary" (click)="logTime()">Log time</button>
            </div>
            <div class="time-list">
              @for (entry of timeEntries(); track entry.id) {
                <div class="time-row"><div><strong>{{ entry.user_name }}</strong><small>{{ entry.spent_at | date:'MMM d, y' }}</small></div><p>{{ entry.note || 'Work logged' }}</p><b>{{ entry.minutes }}m</b></div>
              } @empty { <p class="empty">No time logged yet.</p> }
            </div>
          </div>

          <div class="comment-section">
            <div class="panel-head"><div><p class="eyebrow">DISCUSSION</p><h3>Comments</h3></div></div>
            <div class="comments">
              @for (comment of comments(); track comment.id) {
                <div class="comment"><div class="avatar small-avatar">{{ initials(comment.user_name) }}</div><div><div class="row-gap"><strong>{{ comment.user_name }}</strong><small>{{ comment.created_at | date:'MMM d, HH:mm' }}</small></div><p>{{ comment.body }}</p></div></div>
              } @empty { <p class="empty">No comments yet.</p> }
            </div>
            <div class="comment-box"><input [(ngModel)]="commentBody" placeholder="Add context or an update…"><button class="btn primary" (click)="addComment()">Send</button></div>
          </div>
        </section>
      </div>
    }
  `
})
export class BoardComponent {
  private readonly route = inject(ActivatedRoute);
  readonly api = inject(ApiService);
  readonly store = inject(WorkspaceStore);
  private readonly socket = inject(SocketService);

  readonly statuses: TaskStatus[] = ['Backlog', 'To Do', 'In Progress', 'Blocked', 'Review', 'Done'];
  readonly tasks = signal<Task[]>([]);
  readonly members = signal<Member[]>([]);
  readonly taskModal = signal(false);
  readonly selectedTask = signal<Task | null>(null);
  readonly comments = signal<Comment[]>([]);
  readonly timeEntries = signal<TimeEntry[]>([]);
  readonly priorityFilter = signal('All');
  readonly projectName = signal('Project');
  private readonly dragged = signal<Task | null>(null);
  private projectId = '';
  commentBody = '';
  timeMinutes: number | null = 60;
  timeDate = new Date().toISOString().slice(0,10);
  timeNote = '';
  newTask: {
    title: string; description: string; type: string; priority: string;
    storyPoints: number | null; assigneeId: string | null; dueDate: string | null;
  } = { title: '', description: '', type: 'Task', priority: 'Medium', storyPoints: null, assigneeId: null, dueDate: null };

  constructor() {
    this.route.paramMap.pipe(
      switchMap((params) => {
        this.projectId = params.get('projectId') || '';
        this.projectName.set(this.store.projects().find((project) => project.id === this.projectId)?.name || 'Project');
        return this.api.tasks(this.projectId);
      })
    ).subscribe((tasks) => this.tasks.set(tasks));

    effect(() => {
      const workspace = this.store.current();
      const projects = this.store.projects();
      this.projectName.set(projects.find((project) => project.id === this.projectId)?.name || 'Project');
      if (workspace) this.api.members(workspace.id).subscribe((members) => this.members.set(members));
    });

    this.socket.on<Task>('task.created').subscribe((task) => {
      if (task.project_id === this.projectId) this.upsert(task);
    });
    this.socket.on<Task>('task.updated').subscribe((task) => {
      if (task.project_id === this.projectId) this.upsert(task);
    });
  }

  filteredTasks(): Task[] {
    const filter = this.priorityFilter();
    return filter === 'All' ? this.tasks() : this.tasks().filter((task) => task.priority === filter);
  }

  tasksFor(status: TaskStatus): Task[] {
    return this.filteredTasks().filter((task) => task.status === status);
  }

  dragStart(task: Task): void {
    this.dragged.set(task);
  }

  drop(status: TaskStatus): void {
    const task = this.dragged();
    if (!task || task.status === status) return;
    const previous = task.status;
    this.upsert({ ...task, status });
    this.api.updateTask(task.id, { status }).subscribe({
      next: (updated) => this.upsert(updated),
      error: () => this.upsert({ ...task, status: previous })
    });
  }

  openTask(task: Task): void {
    this.selectedTask.set(task);
    this.api.comments(task.id).subscribe((comments) => this.comments.set(comments));
    this.api.timeEntries(task.id).subscribe((entries) => this.timeEntries.set(entries));
  }

  createTask(): void {
    if (this.newTask.title.trim().length < 2) return;
    this.api.createTask(this.projectId, {
      title: this.newTask.title.trim(),
      description: this.newTask.description.trim(),
      type: this.newTask.type,
      status: 'Backlog',
      priority: this.newTask.priority,
      assigneeId: this.newTask.assigneeId,
      storyPoints: this.newTask.storyPoints,
      dueDate: this.newTask.dueDate,
      labels: []
    }).subscribe((task) => {
      this.upsert(task);
      this.taskModal.set(false);
      this.newTask = { title: '', description: '', type: 'Task', priority: 'Medium', storyPoints: null, assigneeId: null, dueDate: null };
    });
  }

  totalLoggedHours(): number {
    return Math.round((this.timeEntries().reduce((sum,entry)=>sum+entry.minutes,0)/60)*10)/10;
  }

  logTime(): void {
    const task=this.selectedTask();
    if(!task || !this.timeMinutes || this.timeMinutes<1) return;
    this.api.logTime(task.id,{minutes:this.timeMinutes,note:this.timeNote.trim(),spentAt:this.timeDate||null}).subscribe((entry)=>{
      this.timeEntries.update(items=>[entry,...items]);
      this.timeMinutes=60;
      this.timeNote='';
    });
  }

  addComment(): void {
    const task = this.selectedTask();
    if (!task || !this.commentBody.trim()) return;
    this.api.addComment(task.id, this.commentBody.trim()).subscribe((comment) => {
      this.comments.update((items) => [...items, comment]);
      this.commentBody = '';
    });
  }

  initials(name: string): string {
    return name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  }

  isOverdue(task: Task): boolean {
    return !!task.due_date && task.status !== 'Done' && new Date(task.due_date + 'T23:59:59') < new Date();
  }

  statusClass(status: TaskStatus): string {
    return 'status-dot ' + status.toLowerCase().replaceAll(' ', '-');
  }

  private upsert(task: Task): void {
    this.tasks.update((items) => {
      const index = items.findIndex((item) => item.id === task.id);
      if (index === -1) return [task, ...items];
      const copy = [...items];
      copy[index] = { ...copy[index], ...task };
      return copy;
    });
    if (this.selectedTask()?.id === task.id) this.selectedTask.update((current) => current ? { ...current, ...task } : current);
  }
}

import { DatePipe } from '@angular/common';
import { Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { WorkspaceStore } from '../core/workspace.store';
import type { PlanningBoard, Sprint, Task } from '../models';

@Component({
  standalone:true,
  imports:[FormsModule,DatePipe],
  template:`
    <div class="page-head">
      <div>
        <p class="eyebrow">DELIVERY PLANNING</p>
        <h1>Sprints</h1>
        <p class="muted">Plan upcoming work, track active delivery and close completed cycles.</p>
      </div>
      @if (canManage()) { <button class="btn primary" (click)="modal.set(true)">+ New sprint</button> }
    </div>

    @if(activeSprint(); as sprint){
      <section class="planning-hero card">
        <div>
          <p class="eyebrow">ACTIVE SPRINT</p>
          <h2>{{sprint.name}}</h2>
          <p>{{sprint.goal || 'No sprint goal set.'}}</p>
          <div class="planning-meta">
            <span>{{sprint.start_date ? (sprint.start_date | date:'MMM d') : 'No start'}}</span>
            <span>→</span>
            <span>{{sprint.end_date ? (sprint.end_date | date:'MMM d, y') : 'No end'}}</span>
          </div>
        </div>
        <div class="sprint-score">
          <strong>{{progress(sprint)}}%</strong>
          <span>{{sprint.completed_points}} / {{sprint.total_points}} points</span>
          <div class="progress"><span [style.width.%]="progress(sprint)"></span></div>
        </div>
      </section>
    }

    <section class="planning-grid">
      <div class="planning-column">
        <div class="panel-head"><div><p class="eyebrow">SPRINTS</p><h2>Delivery cycles</h2></div></div>
        <div class="sprint-list">
          @for(sprint of planning()?.sprints || []; track sprint.id){
            <article class="sprint-card card" [class.active-sprint]="sprint.status==='Active'">
              <div class="sprint-title-row"><div><span class="pill">{{sprint.status}}</span><h3>{{sprint.name}}</h3></div><strong>{{progress(sprint)}}%</strong></div>
              <p>{{sprint.goal || 'No sprint goal set.'}}</p>
              <div class="mini-stats">
                <span><b>{{sprint.task_count}}</b> tasks</span>
                <span><b>{{sprint.completed_count}}</b> done</span>
                <span><b>{{sprint.blocked_count}}</b> blocked</span>
                <span><b>{{sprint.total_points}}</b> pts</span>
              </div>
              @if(canManage()){
                <div class="row-gap">
                  @if(sprint.status==='Planned'){<button class="btn secondary" (click)="setStatus(sprint,'Active')">Start sprint</button>}
                  @if(sprint.status==='Active'){<button class="btn secondary" (click)="setStatus(sprint,'Completed')">Complete sprint</button>}
                  @if(sprint.status==='Completed'){<button class="btn secondary" (click)="setStatus(sprint,'Planned')">Reopen</button>}
                </div>
              }
            </article>
          } @empty { <div class="empty card">No sprints yet.</div> }
        </div>
      </div>

      <div class="planning-column">
        <div class="panel-head"><div><p class="eyebrow">BACKLOG</p><h2>Ready for planning</h2></div><span class="muted">{{planning()?.backlog?.length || 0}} items</span></div>
        <div class="backlog-list">
          @for(task of planning()?.backlog || []; track task.id){
            <article class="backlog-item card">
              <div><span class="task-type">{{task.project_name}}</span><h3>{{task.title}}</h3><p>{{task.description || 'No description.'}}</p></div>
              <div class="backlog-actions">
                <span class="priority" [class.critical]="task.priority==='Critical'" [class.high]="task.priority==='High'">{{task.priority}}</span>
                @if(canManage() && availableSprints().length){
                  <select #sprintSelect (change)="assign(task,sprintSelect.value); sprintSelect.value=''">
                    <option value="">Add to sprint…</option>
                    @for(sprint of availableSprints(); track sprint.id){<option [value]="sprint.id">{{sprint.name}}</option>}
                  </select>
                }
              </div>
            </article>
          } @empty { <div class="empty card">Backlog is clear.</div> }
        </div>
      </div>
    </section>

    @if(modal()){
      <div class="modal-backdrop" (click)="modal.set(false)">
        <section class="modal card" (click)="$event.stopPropagation()">
          <div class="modal-head"><div><p class="eyebrow">NEW SPRINT</p><h3>Plan a delivery cycle</h3></div><button class="icon-btn" (click)="modal.set(false)">×</button></div>
          <label>Name<input [(ngModel)]="form.name" placeholder="e.g. Sprint 14"></label>
          <label>Goal<textarea [(ngModel)]="form.goal" placeholder="What outcome should this sprint achieve?"></textarea></label>
          <div class="form-grid">
            <label>Start<input [(ngModel)]="form.startDate" type="date"></label>
            <label>End<input [(ngModel)]="form.endDate" type="date"></label>
          </div>
          <button class="btn primary" (click)="create()">Create sprint</button>
        </section>
      </div>
    }
  `
})
export class PlanningComponent{
  private readonly api=inject(ApiService);
  readonly store=inject(WorkspaceStore);
  readonly planning=signal<PlanningBoard|null>(null);
  readonly modal=signal(false);
  form={name:'',goal:'',startDate:'',endDate:''};

  constructor(){
    effect(()=>{const workspace=this.store.current();if(workspace)this.load(workspace.id);});
  }

  canManage(){return ['admin','manager'].includes(this.store.current()?.role || 'member');}
  activeSprint(){return this.planning()?.sprints.find(s=>s.status==='Active') || null;}
  availableSprints(){return (this.planning()?.sprints || []).filter(s=>s.status!=='Completed');}
  progress(s:Sprint){return s.total_points ? Math.round((s.completed_points/s.total_points)*100) : (s.task_count ? Math.round((s.completed_count/s.task_count)*100) : 0);}

  create(){
    const workspace=this.store.current(); if(!workspace || this.form.name.trim().length<2)return;
    this.api.createSprint(workspace.id,{name:this.form.name.trim(),goal:this.form.goal.trim(),startDate:this.form.startDate||null,endDate:this.form.endDate||null}).subscribe(()=>{
      this.modal.set(false); this.form={name:'',goal:'',startDate:'',endDate:''}; this.load(workspace.id);
    });
  }

  setStatus(sprint:Sprint,status:Sprint['status']){
    this.api.setSprintStatus(sprint.id,status).subscribe(()=>{const workspace=this.store.current();if(workspace)this.load(workspace.id);});
  }

  assign(task:Task,sprintId:string){
    if(!sprintId)return;
    this.api.assignTaskToSprint(task.id,sprintId).subscribe(()=>{const workspace=this.store.current();if(workspace)this.load(workspace.id);});
  }

  private load(workspaceId:string){this.api.planning(workspaceId).subscribe(v=>this.planning.set(v));}
}

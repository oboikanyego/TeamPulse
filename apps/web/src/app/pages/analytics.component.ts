import { Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { WorkspaceStore } from '../core/workspace.store';
import type { DeliveryAnalytics } from '../models';

@Component({
  standalone:true,
  imports:[FormsModule],
  template:`
    <div class="page-head">
      <div>
        <p class="eyebrow">DELIVERY ANALYTICS</p>
        <h1>Performance & capacity</h1>
        <p class="muted">Track time, velocity, capacity and sprint execution trends.</p>
      </div>
    </div>

    @if(data(); as analytics){
      <section class="stats-grid analytics-stats">
        <article><span>Logged time</span><strong>{{hours(analytics.summary.total_logged_minutes)}}h</strong><small>Across workspace delivery</small></article>
        <article><span>Completed tasks</span><strong>{{analytics.summary.completed_tasks}}</strong><small>Delivered work items</small></article>
        <article><span>Avg cycle time</span><strong>{{analytics.summary.average_cycle_hours}}h</strong><small>Completed task cycle</small></article>
        <article><span>Active sprint</span><strong>{{analytics.summary.active_sprint || '—'}}</strong><small>Current delivery cycle</small></article>
      </section>

      <section class="analytics-grid">
        <article class="card analytics-panel">
          <div class="panel-head"><div><p class="eyebrow">VELOCITY</p><h2>Planned vs delivered</h2></div></div>
          <div class="velocity-list">
            @for(item of analytics.velocity; track item.sprint){
              <div class="velocity-row">
                <div class="velocity-label"><strong>{{item.sprint}}</strong><span>{{item.delivered}} / {{item.planned}} pts</span></div>
                <div class="velocity-bars">
                  <span class="planned" [style.width.%]="bar(item.planned, maxVelocity())"></span>
                  <span class="delivered" [style.width.%]="bar(item.delivered, maxVelocity())"></span>
                </div>
              </div>
            } @empty { <p class="empty">No sprint history yet.</p> }
          </div>
        </article>

        <article class="card analytics-panel">
          <div class="panel-head"><div><p class="eyebrow">BURNDOWN</p><h2>Active sprint remaining work</h2></div></div>
          @if(activeSprint(); as sprint){
            <div class="burndown-card">
              <div><span>Ideal remaining</span><strong>{{sprint.ideal_remaining}} pts</strong></div>
              <div><span>Actual remaining</span><strong>{{sprint.actual_remaining}} pts</strong></div>
              <div><span>Logged</span><strong>{{hours(sprint.logged_minutes)}}h</strong></div>
            </div>
            <div class="burndown-track">
              <span class="ideal" [style.width.%]="remainingPercent(sprint.ideal_remaining,sprint.planned_points)"></span>
              <span class="actual" [style.width.%]="remainingPercent(sprint.actual_remaining,sprint.planned_points)"></span>
            </div>
          } @else { <p class="empty">No active sprint.</p> }
        </article>
      </section>

      <section class="card analytics-panel capacity-panel">
        <div class="panel-head"><div><p class="eyebrow">TEAM CAPACITY</p><h2>Workload & utilisation</h2></div></div>
        <div class="capacity-table">
          <div class="capacity-row header"><span>Member</span><span>Active</span><span>Points</span><span>Logged</span><span>Capacity</span><span>Utilisation</span></div>
          @for(member of analytics.capacity; track member.id){
            <div class="capacity-row">
              <span><strong>{{member.name}}</strong><small>{{member.role}}</small></span>
              <span>{{member.active_tasks}}</span>
              <span>{{member.planned_points}}</span>
              <span>{{hours(member.logged_minutes)}}h</span>
              <span>
                @if(canManage()){
                  <input class="capacity-input" type="number" min="1" [value]="hours(member.weekly_minutes)" #capacityHours (change)="saveCapacity(member.id,+capacityHours.value)">
                  <small>hrs/week</small>
                } @else { {{hours(member.weekly_minutes)}}h }
              </span>
              <span>
                <div class="util-wrap"><b>{{member.utilization}}%</b><div class="progress"><span [style.width.%]="member.utilization"></span></div></div>
              </span>
            </div>
          }
        </div>
      </section>
    }
  `
})
export class AnalyticsComponent{
  private readonly api=inject(ApiService);
  readonly store=inject(WorkspaceStore);
  readonly data=signal<DeliveryAnalytics|null>(null);

  constructor(){
    effect(()=>{const w=this.store.current();if(w)this.load(w.id);});
  }

  canManage(){return ['admin','manager'].includes(this.store.current()?.role || 'member');}
  hours(minutes:number){return Math.round((minutes/60)*10)/10;}
  maxVelocity(){return Math.max(1,...(this.data()?.velocity.map(v=>Math.max(v.planned,v.delivered))||[1]));}
  bar(value:number,max:number){return Math.round((value/max)*100);}
  activeSprint(){return this.data()?.sprints.find(s=>s.status==='Active')||null;}
  remainingPercent(value:number,total:number){return total?Math.min(100,Math.round((value/total)*100)):0;}

  saveCapacity(userId:string,hours:number){
    const w=this.store.current(); if(!w||!hours||hours<1)return;
    this.api.updateCapacity(w.id,userId,Math.round(hours*60)).subscribe(()=>this.load(w.id));
  }

  private load(workspaceId:string){this.api.analytics(workspaceId).subscribe(v=>this.data.set(v));}
}

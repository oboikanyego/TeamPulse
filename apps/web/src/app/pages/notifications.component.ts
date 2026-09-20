import { CommonModule, DatePipe } from '@angular/common';
import { Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { WorkspaceStore } from '../core/workspace.store';
import type { AutomationEvent, NotificationSettings, TeamPulseNotification } from '../models';

@Component({
  standalone:true,
  imports:[CommonModule,FormsModule,DatePipe],
  template:`
    <div class="page-head">
      <div>
        <p class="eyebrow">NOTIFICATIONS & AUTOMATION</p>
        <h1>Delivery alerts</h1>
        <p class="muted">Control in-app and Slack alerts, CI notifications, overdue checks and digest automation.</p>
      </div>
      @if(canManage()){<button class="btn primary" (click)="runAutomation(true)">Run checks + digest</button>}
    </div>

    @if(message()){<div class="automation-banner">{{message()}}</div>}

    <section class="notification-grid">
      <article class="card settings-card">
        <div class="panel-head"><div><p class="eyebrow">WORKSPACE PREFERENCES</p><h2>Alert rules</h2></div></div>
        @if(settings(); as config){
          <div class="toggle-list">
            <label><span><strong>Task assigned</strong><small>Notify the assignee when ownership changes.</small></span><input type="checkbox" [(ngModel)]="taskAssigned" [disabled]="!canManage()"></label>
            <label><span><strong>Blocked task</strong><small>Alert when work becomes blocked and during automated checks.</small></span><input type="checkbox" [(ngModel)]="taskBlocked" [disabled]="!canManage()"></label>
            <label><span><strong>Overdue task</strong><small>Hourly check for unfinished tasks past their due date.</small></span><input type="checkbox" [(ngModel)]="taskOverdue" [disabled]="!canManage()"></label>
            <label><span><strong>Sprint changes</strong><small>Notify when a sprint starts, completes or returns to planned.</small></span><input type="checkbox" [(ngModel)]="sprintChanged" [disabled]="!canManage()"></label>
            <label><span><strong>CI failures</strong><small>Check connected GitHub Actions runs and flag failures.</small></span><input type="checkbox" [(ngModel)]="ciFailed" [disabled]="!canManage()"></label>
            <label><span><strong>Daily digest</strong><small>Summarise total, done, blocked and overdue work once a day.</small></span><input type="checkbox" [(ngModel)]="dailyDigest" [disabled]="!canManage()"></label>
            <label><span><strong>Slack delivery</strong><small>Send enabled workspace alerts to the configured Slack webhook.</small></span><input type="checkbox" [(ngModel)]="slackEnabled" [disabled]="!canManage()"></label>
          </div>
          @if(canManage()){<button class="btn primary" (click)="savePreferences()">Save preferences</button>}
        }
      </article>

      <article class="card settings-card">
        <div class="panel-head"><div><p class="eyebrow">SLACK</p><h2>Workspace integration</h2></div><span class="pill">{{settings()?.slack?.configured ? 'Configured' : 'Not configured'}}</span></div>
        <p class="muted">The webhook URL is never returned to the browser after saving.</p>
        <label>Incoming webhook URL<input [(ngModel)]="webhookUrl" type="password" placeholder="https://hooks.slack.com/services/..."></label>
        <label>Channel label<input [(ngModel)]="channelName" placeholder="#engineering-delivery"></label>
        @if(canAdmin()){
          <div class="button-row">
            <button class="btn primary" (click)="saveSlack()">Save Slack</button>
            <button class="btn secondary" (click)="testSlack()" [disabled]="!settings()?.slack?.configured">Send test</button>
          </div>
        } @else {
          <p class="muted">Only workspace admins can change the Slack webhook.</p>
        }
      </article>
    </section>

    <section class="notification-grid">
      <article class="card settings-card">
        <div class="panel-head"><div><p class="eyebrow">IN-APP</p><h2>Your notifications</h2></div><span class="pill">{{unreadCount()}} unread</span></div>
        <div class="notification-list">
          @for(item of notifications(); track item.id){
            <button class="notification-row" [class.unread]="!item.read_at" (click)="markRead(item)">
              <div><strong>{{label(item.kind)}}</strong><p>{{item.message}}</p><small>{{item.created_at | date:'medium'}}</small></div>
              <span>{{item.read_at ? 'Read' : 'New'}}</span>
            </button>
          } @empty { <p class="empty">No notifications yet.</p> }
        </div>
      </article>

      <article class="card settings-card">
        <div class="panel-head"><div><p class="eyebrow">AUTOMATION HISTORY</p><h2>Recent checks</h2></div>@if(canManage()){<button class="btn secondary small" (click)="runAutomation(false)">Run checks</button>}</div>
        <div class="automation-list">
          @for(event of history(); track event.id){
            <div class="automation-row"><span class="automation-kind">{{label(event.kind)}}</span><div><strong>{{event.message}}</strong><small>{{event.created_at | date:'medium'}}</small></div></div>
          } @empty { <p class="empty">No automated alerts have fired yet.</p> }
        </div>
      </article>
    </section>
  `
})
export class NotificationsComponent{
  private readonly api=inject(ApiService);
  readonly store=inject(WorkspaceStore);
  readonly settings=signal<NotificationSettings|null>(null);
  readonly notifications=signal<TeamPulseNotification[]>([]);
  readonly history=signal<AutomationEvent[]>([]);
  readonly message=signal('');

  taskAssigned=true; taskBlocked=true; taskOverdue=true; sprintChanged=true;
  ciFailed=true; dailyDigest=true; slackEnabled=false;
  webhookUrl=''; channelName='';

  constructor(){
    effect(()=>{const workspace=this.store.current();if(workspace)this.load(workspace.id);});
  }

  canManage(){return ['admin','manager'].includes(this.store.current()?.role || 'member');}
  canAdmin(){return this.store.current()?.role==='admin';}
  unreadCount(){return this.notifications().filter(n=>!n.read_at).length;}

  savePreferences(){
    const workspace=this.store.current(); if(!workspace)return;
    this.api.updateNotificationPreferences(workspace.id,{
      taskAssigned:this.taskAssigned,taskBlocked:this.taskBlocked,taskOverdue:this.taskOverdue,
      sprintChanged:this.sprintChanged,ciFailed:this.ciFailed,dailyDigest:this.dailyDigest,slackEnabled:this.slackEnabled
    }).subscribe(()=>{this.message.set('Notification preferences saved.');this.load(workspace.id);});
  }

  saveSlack(){
    const workspace=this.store.current(); if(!workspace)return;
    this.api.configureSlack(workspace.id,{
      ...(this.webhookUrl.trim()?{webhookUrl:this.webhookUrl.trim()}:{}),
      channelName:this.channelName.trim()||null,enabled:this.slackEnabled
    }).subscribe(()=>{this.webhookUrl='';this.message.set('Slack integration saved.');this.load(workspace.id);});
  }

  testSlack(){
    const workspace=this.store.current(); if(!workspace)return;
    this.api.testSlack(workspace.id).subscribe({
      next:()=>this.message.set('Slack test message sent.'),
      error:()=>this.message.set('Slack test could not be sent. Check the webhook and enable Slack delivery.')
    });
  }

  runAutomation(includeDigest:boolean){
    const workspace=this.store.current(); if(!workspace)return;
    this.api.runAutomations(workspace.id,includeDigest).subscribe(result=>{
      this.message.set(`Automation finished: ${result.alerts} alert(s)${result.digest?' and digest sent':''}.`);
      this.load(workspace.id);
    });
  }

  markRead(item:TeamPulseNotification){
    if(item.read_at)return;
    this.api.markNotificationRead(item.id).subscribe(updated=>this.notifications.update(items=>items.map(n=>n.id===updated.id?updated:n)));
  }

  label(kind?:string){
    return (kind||'notification').replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());
  }

  private load(workspaceId:string){
    this.api.notificationSettings(workspaceId).subscribe(config=>{
      this.settings.set(config);
      const p=config.preferences;
      this.taskAssigned=p.task_assigned;this.taskBlocked=p.task_blocked;this.taskOverdue=p.task_overdue;
      this.sprintChanged=p.sprint_changed;this.ciFailed=p.ci_failed;this.dailyDigest=p.daily_digest;this.slackEnabled=p.slack_enabled;
      this.channelName=config.slack.channel_name||'';
    });
    this.api.notifications().subscribe(items=>this.notifications.set(items.filter(n=>!n.workspace_id||n.workspace_id===workspaceId)));
    this.api.automationHistory(workspaceId).subscribe(items=>this.history.set(items));
  }
}

import { CommonModule, DatePipe } from '@angular/common';
import { Component, effect, inject, signal } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ApiService } from '../core/api.service';
import { WorkspaceStore } from '../core/workspace.store';
import type { ExecutiveReport } from '../models';

@Component({
  standalone:true,
  imports:[CommonModule,DatePipe],
  template:`
    <div class="page-head">
      <div><p class="eyebrow">PHASE 9 · EXECUTIVE REPORTING</p><h1>Executive reporting</h1><p class="muted">Delivery health, risk and BI reporting for the current workspace.</p></div>
      <div class="button-row"><button class="btn secondary" (click)="downloadCsv()">Export CSV</button><button class="btn primary" (click)="load()">Refresh</button></div>
    </div>
    @if(report(); as r){
      <section class="metric-grid report-metrics">
        <article class="card metric"><span>Total tasks</span><strong>{{r.summary.total_tasks}}</strong></article>
        <article class="card metric"><span>Delivery rate</span><strong>{{r.summary.delivery_rate}}%</strong></article>
        <article class="card metric"><span>Blocked</span><strong>{{r.summary.blocked_tasks}}</strong></article>
        <article class="card metric"><span>Overdue</span><strong>{{r.summary.overdue_tasks}}</strong></article>
        <article class="card metric"><span>Logged hours</span><strong>{{r.summary.logged_hours}}</strong></article>
      </section>
      <section class="notification-grid">
        <article class="card settings-card"><p class="eyebrow">FLOW</p><h2>Status distribution</h2>
          @for(item of r.by_status; track item.status){<div class="report-bar"><span>{{item.status}}</span><meter [max]="r.summary.total_tasks || 1" [value]="item.count"></meter><strong>{{item.count}}</strong></div>}
        </article>
        <article class="card settings-card"><p class="eyebrow">RISK</p><h2>Priority profile</h2>
          @for(item of r.by_priority; track item.priority){<div class="report-bar"><span>{{item.priority}}</span><meter [max]="r.summary.total_tasks || 1" [value]="item.count"></meter><strong>{{item.count}}</strong></div>}
        </article>
      </section>
      <article class="card settings-card"><p class="eyebrow">RISKS TO WATCH</p><h2>Current delivery risks</h2>
        <div class="table-wrap"><table><thead><tr><th>Work item</th><th>Status</th><th>Priority</th><th>Due</th></tr></thead><tbody>
          @for(item of r.risks; track item.id){<tr><td>{{item.title}}</td><td>{{item.status}}</td><td>{{item.priority}}</td><td>{{item.due_date || '—'}}</td></tr>}
        </tbody></table></div>
      </article>
    }
    <article class="card settings-card metabase-card">
      <div class="panel-head"><div><p class="eyebrow">METABASE BI</p><h2>Embedded executive dashboard</h2></div><span class="pill">{{metabaseConfigured() ? 'Connected' : 'Native fallback'}}</span></div>
      @if(metabaseConfigured() && metabaseUrl()){
        <iframe class="metabase-frame" [src]="metabaseUrl()" title="TeamPulse Metabase dashboard"></iframe>
      } @else {
        <p class="muted">Metabase embedding is ready but not configured in this environment. Native TeamPulse reporting above remains fully usable. Configure METABASE_URL, METABASE_SECRET_KEY and METABASE_DASHBOARD_ID to activate the workspace-scoped BI embed.</p>
      }
    </article>
  `
})
export class ReportsComponent{
  private readonly api=inject(ApiService); readonly store=inject(WorkspaceStore); private readonly sanitizer=inject(DomSanitizer);
  readonly report=signal<ExecutiveReport|null>(null); readonly metabaseConfigured=signal(false); readonly metabaseUrl=signal<SafeResourceUrl|null>(null);
  constructor(){effect(()=>{if(this.store.current())this.load();});}
  load(){const w=this.store.current();if(!w)return;this.api.executiveReport(w.id).subscribe(v=>this.report.set(v));this.api.metabaseEmbed(w.id).subscribe(v=>{this.metabaseConfigured.set(v.configured);this.metabaseUrl.set(v.url?this.sanitizer.bypassSecurityTrustResourceUrl(v.url):null);});}
  downloadCsv(){const w=this.store.current();if(!w)return;this.api.downloadReport(w.id).subscribe(blob=>{const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='teampulse-report.csv';a.click();URL.revokeObjectURL(url);});}
}
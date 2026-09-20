import { Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { WorkspaceStore } from '../core/workspace.store';
import type { GitHubInsights, GitHubRepository } from '../models';

@Component({
  standalone:true,
  imports:[FormsModule],
  template:`
    <div class="page-head">
      <div>
        <p class="eyebrow">ENGINEERING INSIGHTS</p>
        <h1>GitHub delivery</h1>
        <p class="muted">Connect repositories and monitor pull requests, CI health and delivery flow.</p>
      </div>
      @if(canManage()){<button class="btn primary" (click)="modal.set(true)">+ Connect repo</button>}
    </div>

    @if(insights(); as data){
      <section class="stats-grid analytics-stats">
        <article><span>Repositories</span><strong>{{data.summary.repositories}}</strong><small>Connected to workspace</small></article>
        <article><span>Open PRs</span><strong>{{data.summary.open_pull_requests}}</strong><small>Across connected repos</small></article>
        <article><span>CI success</span><strong>{{data.summary.ci_success_rate}}%</strong><small>Recent workflow runs</small></article>
        <article><span>Median PR lead</span><strong>{{data.summary.median_pr_lead_hours}}h</strong><small>Create → merge</small></article>
      </section>

      <section class="github-grid">
        @for(repo of data.repositories; track repo.repository_id){
          <article class="card github-repo">
            <div class="repo-head">
              <div><p class="eyebrow">REPOSITORY</p><h2>{{repo.full_name}}</h2></div>
              @if(repo.latest_ci){<span class="pill">{{repo.latest_ci.conclusion || repo.latest_ci.status}}</span>}
            </div>

            @if(repo.error){
              <p class="error-text">{{repo.error}}</p>
            } @else {
              <div class="mini-stats">
                <span><b>{{repo.open_pull_requests || 0}}</b> open PRs</span>
                <span><b>{{repo.merged_pull_requests || 0}}</b> merged</span>
                <span><b>{{repo.ci_success_rate || 0}}%</b> CI success</span>
                <span><b>{{repo.median_pr_lead_hours || 0}}h</b> PR lead</span>
              </div>

              @if(repo.latest_commit){
                <div class="latest-commit">
                  <span>Latest commit</span>
                  <strong>{{repo.latest_commit.message}}</strong>
                  <small>{{repo.latest_commit.author}} · {{repo.latest_commit.sha.slice(0,7)}}</small>
                </div>
              }

              <div class="repo-split">
                <div>
                  <div class="panel-head"><div><p class="eyebrow">PULL REQUESTS</p><h3>Recent work</h3></div></div>
                  <div class="github-list">
                    @for(pr of repo.pull_requests || []; track pr.number){
                      <a class="github-row" [href]="pr.url" target="_blank" rel="noopener">
                        <div><strong>#{{pr.number}} {{pr.title}}</strong><small>{{pr.user}}</small></div>
                        <span>{{pr.merged_at ? 'Merged' : pr.state}}</span>
                      </a>
                    }
                  </div>
                </div>
                <div>
                  <div class="panel-head"><div><p class="eyebrow">CI / CD</p><h3>Recent runs</h3></div></div>
                  <div class="github-list">
                    @for(run of repo.recent_runs || []; track run.id){
                      <a class="github-row" [href]="run.url" target="_blank" rel="noopener">
                        <div><strong>{{run.name}}</strong><small>{{run.branch}}</small></div>
                        <span>{{run.conclusion || run.status}}</span>
                      </a>
                    }
                  </div>
                </div>
              </div>
            }
          </article>
        } @empty {
          <div class="card empty">No GitHub repositories connected yet.</div>
        }
      </section>
    }

    @if(modal()){
      <div class="modal-backdrop" (click)="modal.set(false)">
        <section class="modal card" (click)="$event.stopPropagation()">
          <div class="modal-head"><div><p class="eyebrow">GITHUB</p><h3>Connect repository</h3></div><button class="icon-btn" (click)="modal.set(false)">×</button></div>
          <label>Owner<input [(ngModel)]="owner" placeholder="e.g. oboikanyego"></label>
          <label>Repository<input [(ngModel)]="repo" placeholder="e.g. TeamPulse"></label>
          <button class="btn primary" (click)="connect()">Connect repository</button>
        </section>
      </div>
    }
  `
})
export class EngineeringComponent{
  private readonly api=inject(ApiService);
  readonly store=inject(WorkspaceStore);
  readonly insights=signal<GitHubInsights|null>(null);
  readonly repositories=signal<GitHubRepository[]>([]);
  readonly modal=signal(false);
  owner=''; repo='';

  constructor(){
    effect(()=>{const w=this.store.current();if(w)this.load(w.id);});
  }

  canManage(){return ['admin','manager'].includes(this.store.current()?.role || 'member');}

  connect(){
    const w=this.store.current();
    if(!w||!this.owner.trim()||!this.repo.trim()) return;
    this.api.connectGitHubRepository(w.id,this.owner.trim(),this.repo.trim()).subscribe(()=>{
      this.modal.set(false); this.owner=''; this.repo=''; this.load(w.id);
    });
  }

  private load(workspaceId:string){
    this.api.githubRepositories(workspaceId).subscribe(v=>this.repositories.set(v));
    this.api.githubInsights(workspaceId).subscribe(v=>this.insights.set(v));
  }
}

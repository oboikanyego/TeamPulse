import type { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';
import { ShellComponent } from './layout/shell.component';
import { BoardComponent } from './pages/board.component';
import { DashboardComponent } from './pages/dashboard.component';
import { LoginComponent } from './pages/login.component';
import { PlanningComponent } from './pages/planning.component';
import { AnalyticsComponent } from './pages/analytics.component';
import { EngineeringComponent } from './pages/engineering.component';
import { NotificationsComponent } from './pages/notifications.component';
import { GovernanceComponent } from './pages/governance.component';
import { ReportsComponent } from './pages/reports.component';
import { AssistantComponent } from './pages/assistant.component';
import { SettingsComponent } from './pages/settings.component';
import { RegisterComponent } from './pages/register.component';
import { TeamComponent } from './pages/team.component';

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: 'register', component: RegisterComponent },
  {
    path: '',
    canActivate: [authGuard],
    component: ShellComponent,
    children: [
      { path: 'dashboard', component: DashboardComponent },
      { path: 'project/:projectId', component: BoardComponent },
      { path: 'team', component: TeamComponent },
      { path: 'planning', component: PlanningComponent },
      { path: 'analytics', component: AnalyticsComponent },
      { path: 'engineering', component: EngineeringComponent },
      { path: 'notifications', component: NotificationsComponent },
      { path: 'governance', component: GovernanceComponent },
      { path: 'reports', component: ReportsComponent },
      { path: 'assistant', component: AssistantComponent },
      { path: 'settings', component: SettingsComponent },
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' }
    ]
  },
  { path: '**', redirectTo: '' }
];

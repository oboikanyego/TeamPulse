import type { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';
import { ShellComponent } from './layout/shell.component';
import { BoardComponent } from './pages/board.component';
import { DashboardComponent } from './pages/dashboard.component';
import { LoginComponent } from './pages/login.component';
import { PlanningComponent } from './pages/planning.component';
import { AnalyticsComponent } from './pages/analytics.component';
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
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' }
    ]
  },
  { path: '**', redirectTo: '' }
];

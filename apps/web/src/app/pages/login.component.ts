import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthService } from '../core/auth.service';

@Component({
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <main class="auth-page">
      <section class="auth-brand">
        <div class="brand-mark">TP</div>
        <p class="eyebrow">TEAM OPERATIONS, IN FOCUS</p>
        <h1>Know what is moving, blocked, and ready to ship.</h1>
        <p class="auth-copy">TeamPulse brings projects, ownership, workload and live delivery signals into one calm workspace.</p>
        <div class="auth-proof">
          <span>● Live updates</span><span>● Delivery health</span><span>● Role-aware workflows</span>
        </div>
      </section>

      <section class="auth-card card">
        <div>
          <p class="eyebrow">WELCOME BACK</p>
          <h2>Sign in to TeamPulse</h2>
          <p class="muted">Use your account or enter the seeded demo workspace.</p>
        </div>

        <form [formGroup]="form" (ngSubmit)="submit()" class="stack">
          <label>Email<input formControlName="email" type="email" autocomplete="email" placeholder="you@company.com"></label>
          <label>Password<input formControlName="password" type="password" autocomplete="current-password" placeholder="••••••••"></label>
          @if (error()) { <p class="form-error">{{ error() }}</p> }
          <button class="btn primary" type="submit" [disabled]="loading() || form.invalid">{{ loading() ? 'Signing in…' : 'Sign in' }}</button>
        </form>

        <div class="demo-box">
          <span class="eyebrow">DEMO ACCESS</span>
          <button class="btn soft full" (click)="demo('admin@teampulse.demo')">Admin workspace</button>
          <div class="demo-row">
            <button class="btn ghost" (click)="demo('manager@teampulse.demo')">Manager</button>
            <button class="btn ghost" (click)="demo('developer@teampulse.demo')">Developer</button>
          </div>
        </div>

        <p class="muted center">New here? <a routerLink="/register">Create an account</a></p>
      </section>
    </main>
  `
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly loading = signal(false);
  readonly error = signal('');
  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]]
  });

  submit(): void {
    if (this.form.invalid) return;
    this.signIn(this.form.getRawValue().email, this.form.getRawValue().password);
  }

  demo(email: string): void {
    this.form.setValue({ email, password: 'Demo123!' });
    this.signIn(email, 'Demo123!');
  }

  private signIn(email: string, password: string): void {
    this.loading.set(true);
    this.error.set('');
    this.auth.login(email, password)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: () => void this.router.navigateByUrl('/dashboard'),
        error: (err) => this.error.set(err.error?.message || 'Unable to sign in')
      });
  }
}

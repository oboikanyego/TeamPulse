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
        <p class="eyebrow">CREATE YOUR WORKSPACE</p>
        <h1>A clearer operating rhythm starts with one board.</h1>
        <p class="auth-copy">Your account starts with a private workspace. Add projects and members when you are ready.</p>
      </section>

      <section class="auth-card card">
        <div><p class="eyebrow">GET STARTED</p><h2>Create your TeamPulse account</h2></div>
        <form [formGroup]="form" (ngSubmit)="submit()" class="stack">
          <label>Full name<input formControlName="name" placeholder="Your name"></label>
          <label>Email<input formControlName="email" type="email" placeholder="you@company.com"></label>
          <label>Password<input formControlName="password" type="password" placeholder="At least 8 characters"></label>
          @if (error()) { <p class="form-error">{{ error() }}</p> }
          <button class="btn primary" type="submit" [disabled]="form.invalid || loading()">{{ loading() ? 'Creating…' : 'Create account' }}</button>
        </form>
        <p class="muted center">Already have an account? <a routerLink="/login">Sign in</a></p>
      </section>
    </main>
  `
})
export class RegisterComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]]
  });

  submit(): void {
    if (this.form.invalid) return;
    this.loading.set(true);
    const value = this.form.getRawValue();
    this.auth.register(value.name, value.email, value.password)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: () => void this.router.navigateByUrl('/dashboard'),
        error: (err) => this.error.set(err.error?.message || 'Unable to create account')
      });
  }
}

import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { tap } from 'rxjs';
import { environment } from '../../environments/environment';
import type { User } from '../models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly userState = signal<User | null>(null);
  private readonly tokenState = signal<string | null>(localStorage.getItem('teampulse_token'));

  readonly user = this.userState.asReadonly();
  readonly token = this.tokenState.asReadonly();

  login(email: string, password: string) {
    return this.http.post<{ token: string; user: User }>(`${environment.apiUrl}/auth/login`, { email, password }).pipe(
      tap((result) => this.store(result.token, result.user))
    );
  }

  register(name: string, email: string, password: string) {
    return this.http.post<{ token: string; user: User }>(`${environment.apiUrl}/auth/register`, { name, email, password }).pipe(
      tap((result) => this.store(result.token, result.user))
    );
  }

  restore(): void {
    if (!this.tokenState() || this.userState()) return;
    this.http.get<User>(`${environment.apiUrl}/me`).subscribe({
      next: (user) => this.userState.set(user),
      error: () => this.clear()
    });
  }

  logout(): void {
    this.clear();
    void this.router.navigateByUrl('/login');
  }

  private store(token: string, user: User): void {
    localStorage.setItem('teampulse_token', token);
    this.tokenState.set(token);
    this.userState.set(user);
  }

  private clear(): void {
    localStorage.removeItem('teampulse_token');
    this.tokenState.set(null);
    this.userState.set(null);
  }
}

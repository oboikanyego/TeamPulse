import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { io, type Socket } from 'socket.io-client';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class SocketService {
  private readonly auth = inject(AuthService);
  private socket: Socket | null = null;
  private joined: string | null = null;

  connect(workspaceId: string): void {
    const socket = this.ensureSocket();
    if (this.joined && this.joined !== workspaceId) {
      socket.emit('workspace:leave', this.joined);
    }
    this.joined = workspaceId;
    socket.emit('workspace:join', workspaceId);
  }

  on<T>(eventName: string): Observable<T> {
    return new Observable<T>((subscriber) => {
      const socket = this.ensureSocket();
      const handler = (value: T) => subscriber.next(value);
      socket.on(eventName, handler);
      return () => socket.off(eventName, handler);
    });
  }

  private ensureSocket(): Socket {
    if (!this.socket) {
      this.socket = io(environment.socketUrl, {
        transports: ['websocket', 'polling'],
        auth: { token: this.auth.token() }
      });
    }
    return this.socket;
  }
}

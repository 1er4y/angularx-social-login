import { Inject, Injectable } from '@angular/core';
import { AsyncSubject, Observable, ReplaySubject } from 'rxjs';
import { LoginProvider } from './entities/login-provider';
import { SocialUser } from './entities/social-user';

export interface SocialAuthServiceConfig {
  autoLogin?: boolean;
  providers: { id: string; provider: LoginProvider }[];
  onError?: (error: any) => any;
}

/** @dynamic */
@Injectable()
export class SocialAuthService {
  private static readonly ERR_LOGIN_PROVIDER_NOT_FOUND =
    'Login provider not found';
  private static readonly ERR_NOT_LOGGED_IN = 'Not logged in';
  private static readonly ERR_NOT_INITIALIZED =
    'Login providers not ready yet. Are there errors on your console?';

  private providers: Map<string, LoginProvider> = new Map();
  private autoLogin = false;

  private _user: SocialUser = null;
  private _authState: ReplaySubject<SocialUser> = new ReplaySubject(1);

  get authState(): Observable<SocialUser> {
    return this._authState.asObservable();
  }

  private _initState: AsyncSubject<boolean> = new AsyncSubject();
  /** @deprecated */
  get initState(): Observable<boolean> {
    return this._initState.asObservable();
  }

  constructor(
    @Inject('SocialAuthServiceConfig')
    config: SocialAuthServiceConfig | Promise<SocialAuthServiceConfig>
  ) {
    if (config instanceof Promise) {
      config.then((config) => {
        this.initialize(config);
      });
    } else {
      this.initialize(config);
    }
  }

  private initialize(config: SocialAuthServiceConfig) {
    this.autoLogin = config.autoLogin !== undefined ? config.autoLogin : true;

    config.providers.forEach((item) => {
      this.providers.set(item.id, item.provider);
    });

    /* Doesn't do anything, to be removed in next major release */
    this._initState.next(true);
    this._initState.complete();

    if (this.autoLogin) {
      const loginStatusPromises = [];
      let loggedIn = false;

      this.providers.forEach((provider: LoginProvider, key: string) => {
        let promise = provider.getLoginStatus();
        loginStatusPromises.push(promise);
        promise
          .then((user: SocialUser) => {
            user.provider = key;

            this._user = user;
            this._authState.next(user);
            loggedIn = true;
          })
          .catch(console.debug);
      });
      Promise.all(loginStatusPromises).catch(() => {
        if (!loggedIn) {
          this._user = null;
          this._authState.next(null);
        }
      });
    }
  }

  signIn(providerId: string, signInOptions?: any): Promise<SocialUser> {
    return new Promise((resolve, reject) => {
      let providerObject = this.providers.get(providerId);
      if (providerObject) {
        providerObject
          .signIn(signInOptions)
          .then((user: SocialUser) => {
            user.provider = providerId;
            resolve(user);

            this._user = user;
            this._authState.next(user);
          })
          .catch((err) => {
            reject(err);
          });
      } else {
        reject(SocialAuthService.ERR_LOGIN_PROVIDER_NOT_FOUND);
      }
    });
  }

  signOut(revoke: boolean = false): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this._user) {
        reject(SocialAuthService.ERR_NOT_LOGGED_IN);
      } else {
        let providerId = this._user.provider;
        let providerObject = this.providers.get(providerId);
        if (providerObject) {
          providerObject
            .signOut(revoke)
            .then(() => {
              resolve();

              this._user = null;
              this._authState.next(null);
            })
            .catch((err) => {
              reject(err);
            });
        } else {
          reject(SocialAuthService.ERR_LOGIN_PROVIDER_NOT_FOUND);
        }
      }
    });
  }
}

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export class CookieHeaders extends Headers {
  constructor(init?: HeadersInit) {
    super(init);
  }

  setCookie(
    name: string,
    value: string,
    options: {
      path?: string;
      domain?: string;
      maxAge?: number;
      expires?: Date;
      httpOnly?: boolean;
      secure?: boolean;
      sameSite?: 'Strict' | 'Lax' | 'None';
    } = {},
  ): void {
    let cookieString = `${name}=${encodeURIComponent(value)}`;

    if (options.maxAge !== undefined) cookieString += `; Max-Age=${options.maxAge}`;
    if (options.expires) cookieString += `; Expires=${options.expires.toUTCString()}`;
    if (options.domain) cookieString += `; Domain=${options.domain}`;
    if (options.path) cookieString += `; Path=${options.path}`;
    if (options.httpOnly) cookieString += `; HttpOnly`;
    if (options.secure) cookieString += `; Secure`;
    if (options.sameSite) cookieString += `; SameSite=${options.sameSite}`;

    this.append('Set-Cookie', cookieString);
  }

  deleteCookie(
    name: string,
    options: {
      path?: string;
      domain?: string;
    } = {},
  ): void {
    this.setCookie(name, '', {
      ...options,
      expires: new Date(0),
      maxAge: 0,
    });
  }
}

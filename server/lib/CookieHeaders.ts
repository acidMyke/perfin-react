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

export function parseCookie(req: Request) {
  const cookieHeader = req.headers.get('Cookie');

  return (
    cookieHeader?.split(';')?.reduce(
      (acc, cookie) => {
        const [name, ...rest] = cookie.split('=');
        const value = rest.join('=');
        if (name && value) {
          acc[name.trim()] = decodeURIComponent(value.trim());
        }
        return acc;
      },
      {} as Record<string, string>,
    ) ?? {}
  );
}

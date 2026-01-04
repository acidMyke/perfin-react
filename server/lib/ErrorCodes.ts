export class ErrorCodes {
  static readonly CSRF_FAILED = 'csrf_failed';
  static readonly ELEVATION_REQUIRED = 'elevation_required';
  static readonly SQLITE_ERROR = 'sqlite_error';
  static readonly UNHANDLED_EXCEPTION = 'unhandled_exception';
}

export type ErrorCodesValues =
  | typeof ErrorCodes.CSRF_FAILED
  | typeof ErrorCodes.ELEVATION_REQUIRED
  | typeof ErrorCodes.SQLITE_ERROR
  | typeof ErrorCodes.UNHANDLED_EXCEPTION;

export default ErrorCodes;

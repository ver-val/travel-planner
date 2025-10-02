import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const { status, body } = this.normalizeException(exception);

    const message = typeof body?.error === 'string' ? body.error : 'Unexpected error';
    if (status >= 500) {
      this.logger.error(message, exception instanceof Error ? exception.stack : undefined);
    } else {
      this.logger.warn(message);
    }

    response
      .status(status)
      .header('Content-Type', 'application/json')
      .json(body);
  }

  private normalizeException(exception: unknown): { status: number; body: Record<string, unknown> } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      const payload = typeof response === 'string' ? { message: response } : (response as Record<string, unknown>);

      if (status === HttpStatus.BAD_REQUEST && payload?.error === 'Validation error') {
        return { status, body: { error: payload.error, details: payload.details } };
      }

      const messageRaw = payload?.message;
      const message = Array.isArray(messageRaw)
        ? messageRaw.join('; ')
        : typeof messageRaw === 'string'
          ? messageRaw
          : typeof payload?.error === 'string'
            ? (payload.error as string)
            : exception.message;

      const { details, current_version, ...rest } = payload ?? {};

      const body: Record<string, unknown> = {
        error: message || 'Unexpected error',
      };

      if (details) body.details = details;
      if (current_version !== undefined) body.current_version = current_version;

      for (const [key, value] of Object.entries(rest)) {
        if (['statusCode', 'message', 'error'].includes(key)) continue;
        if (value !== undefined) {
          body[key] = value;
        }
      }

      return { status, body };
    }

    if (exception instanceof SyntaxError) {
      return {
        status: HttpStatus.BAD_REQUEST,
        body: { error: 'Invalid JSON' },
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: { error: 'Internal server error' },
    };
  }
}

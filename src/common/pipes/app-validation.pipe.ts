import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ValidationError } from 'class-validator';

function flattenValidationErrors(errors: ValidationError[]): string[] {
  const messages: string[] = [];

  const traverse = (items: ValidationError[]) => {
    for (const error of items) {
      if (error.constraints) {
        messages.push(...Object.values(error.constraints));
      }
      if (error.children && error.children.length) {
        traverse(error.children);
      }
    }
  };

  traverse(errors);
  return messages.length ? messages : ['Invalid payload'];
}

export const createAppValidationPipe = () =>
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors: ValidationError[]) => {
      const details = flattenValidationErrors(errors).join('; ');
      return new BadRequestException({ error: 'Validation error', details });
    },
  });

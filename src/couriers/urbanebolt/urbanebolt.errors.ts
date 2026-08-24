import { HttpStatus } from '@nestjs/common';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-code';
export const urbaneboltContractUnavailable = (
  message = 'UrbaneBolt API contract is not configured',
) => new AppError(ErrorCode.COURIER_CONFIGURATION_ERROR, message, HttpStatus.INTERNAL_SERVER_ERROR);

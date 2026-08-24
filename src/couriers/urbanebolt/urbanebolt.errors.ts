import { HttpStatus } from '@nestjs/common';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-code';
export const urbaneboltContractUnavailable = () =>
  new AppError(
    ErrorCode.COURIER_CONFIGURATION_ERROR,
    'UrbaneBolt API contract is not configured',
    HttpStatus.INTERNAL_SERVER_ERROR,
  );

import { Injectable } from '@nestjs/common';
import { NormalizedOrder } from '../courier.types';
import { urbaneboltContractUnavailable } from './urbanebolt.errors';
import { UrbaneBoltCreateRequest } from './urbanebolt.types';
@Injectable()
export class UrbaneBoltMapper {
  toCreateRequest(_order: NormalizedOrder): UrbaneBoltCreateRequest {
    throw urbaneboltContractUnavailable();
  }
}

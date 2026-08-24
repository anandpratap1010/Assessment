export interface UrbaneBoltAuthResponse {
  access_token: string;
  expires_in?: number;
  expires?: string;
  token_type?: string;
  status?: string;
}

export interface UrbaneBoltManifestItem {
  customerCode: string;
  orderNumber: string;
  declaredValue: number;
  itemDescription: string;
  collectableValue: number;
  height: number;
  length: number;
  pieces: number;
  weight: number;
  breadth: number;
  serviceType: string;
  payMode: 'COD' | 'PPD';
  rtnCity: string;
  rtnName: string;
  rtnEmail: string;
  rtnState: string;
  rtnMobile: number;
  rtnAddress: string;
  rtnAddressType: string;
  rtnCountry: string;
  rtnPincode: number;
  shprCity: string;
  shprName: string;
  shprEmail: string;
  shprState: string;
  shprMobile: number;
  shprAddress: string;
  shprAddressType: string;
  shprCountry: string;
  shprPincode: number;
  consCity: string;
  consName: string;
  consEmail: string;
  consState: string;
  consMobile: number;
  consAddress: string;
  consAddressType: string;
  consCountry: string;
  consPincode: number;
  invoiceNumber: string;
  invoiceDate: string;
  invoiceValue: number;
  itemQuantity: number;
}

export type UrbaneBoltCreateRequest = UrbaneBoltManifestItem[];

export interface UrbaneBoltManifestSuccess {
  status: string;
  orderNumber: string;
  awbNumber: number | string;
  routeCode?: string;
  shippingLabel?: string;
  customerCode?: string;
}

export interface UrbaneBoltManifestError {
  orderNumber?: string;
  customerCode?: string;
  status?: string;
  message: string;
}

export interface UrbaneBoltCreateResponse {
  status: string;
  successResponse: UrbaneBoltManifestSuccess[];
  errorResponse: UrbaneBoltManifestError[];
}

export interface UrbaneBoltTrackingScan {
  statusDateTime: string;
  statusCode: string;
  statusCodeDescription: string;
  reasonCode?: string;
  reasonCodeDescription?: string;
  currentLocation?: string;
}

export interface UrbaneBoltTrackingData {
  awbNumber: number | string;
  orderNumber: string;
  currentStatusDateTime: string;
  currentStatusCode: string;
  currentStatusCodeDescription: string;
  scans?: UrbaneBoltTrackingScan[];
}

export interface UrbaneBoltTrackingResponse {
  status: string;
  message?: string;
  data: UrbaneBoltTrackingData;
}

export interface UrbaneBoltCancellationItem {
  orderNumber?: string;
  awb: string;
  message: string;
}

export interface UrbaneBoltCancelResponse {
  status: string;
  message?: string;
  successResponse: UrbaneBoltCancellationItem[];
  failureResponse: UrbaneBoltCancellationItem[];
}

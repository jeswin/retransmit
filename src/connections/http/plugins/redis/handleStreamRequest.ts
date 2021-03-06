import {
  HttpProxyAppConfig,
} from "../../../../types/config";

import {
  InvokeHttpServiceResult,
  HttpServiceEndPointConfig,
  HttpRouteConfig,
} from "../../../../types/config/httpProxy";
import { IRouterContext } from "koa-router";
import { HttpRequest, HttpMethods } from "../../../../types/http";

// Handle streaming http request/response
export default function handleStreamRequest(
  ctx: IRouterContext,
  requestId: string,
  request: HttpRequest,
  route: string,
  method: HttpMethods,
  serviceConfig: HttpServiceEndPointConfig,
  routeConfig: HttpRouteConfig,
  config: HttpProxyAppConfig
): Promise<void> {
  // Not implemented.
  return {} as any;
}

import {
  HttpMethods,
  RouteConfig,
  IAppConfig,
  FetchedResponse,
  ActiveRedisRequest,
  ServiceHandlerConfig,
  RedisServiceRequest,
  HttpRequest,
} from "../../types";

import * as activeRequests from "./activeRequests";
import * as configModule from "../../config";
import { publish } from "./publish";
/*
  Make Promises for Redis Services
*/
export default function invokeServices(
  requestId: string,
  httpRequest: HttpRequest
): Promise<FetchedResponse>[] {
  const config = configModule.get();
  const routeConfig = config.routes[httpRequest.path][
    httpRequest.method
  ] as RouteConfig;

  const redisServiceRequest: RedisServiceRequest = {
    id: requestId,
    type: "request" as "request",
    data: httpRequest,
  };

  publish(redisServiceRequest, httpRequest.path, httpRequest.method);

  const promises: Promise<FetchedResponse>[] = [];

  for (const service of Object.keys(routeConfig.services)) {
    const serviceConfig = routeConfig.services[service];
    if (
      serviceConfig.type === "redis" &&
      serviceConfig.awaitResponse !== false
    ) {
      promises.push(
        new Promise<FetchedResponse>((success, error) => {
          activeRequests.set(`${requestId}+${service}`, {
            id: requestId,
            responseChannel: serviceConfig.config.responseChannel,
            path: httpRequest.path,
            method: httpRequest.method,
            service,
            timeoutTicks:
              Date.now() + (serviceConfig.timeoutMS || 30000),
            startTime: Date.now(),
            onResponse: success
          });
        })
      );
    }
  }

  return promises;
}
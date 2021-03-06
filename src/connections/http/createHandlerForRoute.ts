import { IRouterContext } from "koa-router";
import { HttpProxyAppConfig } from "../../types/config";
import randomId from "../../utils/random";

import {
  HttpRouteConfig,
  InvokeHttpServiceResult,
} from "../../types/config/httpProxy";
import applyRateLimiting from "../modules/rateLimiting";
import { sendResponse } from "./sendResponse";
import { getFromCache } from "./modules/caching";
import authenticate from "./modules/authentication";
import { isTripped } from "./modules/circuitBreaker";
import mergeResponses from "./mergeResponses";
import responseIsError from "../../utils/http/responseIsError";
import plugins from "./plugins";
import sortIntoStages from "./sortIntoStages";
import makeHttpRequestFromContext from "./makeHttpRequestFromContext";
import addTrackingInfo from "../modules/clientTracking";
import { HttpMethods, FetchedHttpResponse } from "../../types/http";

export type CreateHttpRequestHandler = (
  method: HttpMethods
) => (ctx: IRouterContext) => void;

export default function createHandlerForRoute(
  route: string,
  routeConfig: HttpRouteConfig,
  config: HttpProxyAppConfig
) {
  return async function httpRequestHandler(ctx: IRouterContext) {
    return await handler(ctx, route, routeConfig, config);
  };
}

async function handler(
  ctx: IRouterContext,
  route: string,
  routeConfig: HttpRouteConfig,
  config: HttpProxyAppConfig
) {
  const startTime = Date.now();

  const request = makeHttpRequestFromContext(ctx, routeConfig);

  const requestId = randomId(32);

  const authResponse = await authenticate(route, request, config);

  const requestMethod = ctx.method as HttpMethods;

  if (authResponse) {
    sendResponse(
      ctx,
      route,
      requestMethod,
      startTime,
      request,
      authResponse,
      routeConfig,
      config
    );
    return;
  }

  const entryFromCache = await getFromCache(route, request, config);

  if (entryFromCache) {
    sendResponse(
      ctx,
      route,
      requestMethod,
      startTime,
      request,
      entryFromCache,
      routeConfig,
      config,
      true
    );
    return;
  }

  // Add client tracking info
  addTrackingInfo(
    ctx.path,
    requestMethod,
    ctx.ip,
    routeConfig,
    config.http,
    config
  );

  const rateLimitedResponse = await applyRateLimiting(
    "http",
    route,
    requestMethod,
    ctx.ip,
    config
  );

  if (rateLimitedResponse !== undefined) {
    const response = {
      status: rateLimitedResponse.status,
      body: rateLimitedResponse.body,
    };
    sendResponse(
      ctx,
      route,
      requestMethod,
      startTime,
      request,
      response,
      routeConfig,
      config
    );
    return;
  }

  const circuitBreakerResponse = await isTripped(route, request, config);

  if (circuitBreakerResponse !== undefined) {
    const response = {
      status: circuitBreakerResponse.status,
      body: circuitBreakerResponse.body,
    };
    sendResponse(
      ctx,
      route,
      requestMethod,
      startTime,
      request,
      response,
      routeConfig,
      config
    );
    return;
  }

  // Are there custom handlers for the request?
  const onRequest = routeConfig.onRequest || config.http.onRequest;

  const modResult = (onRequest && (await onRequest(request))) || {
    handled: false as false,
    request: request,
  };

  if (modResult.handled) {
    sendResponse(
      ctx,
      route,
      requestMethod,
      startTime,
      request,
      modResult.response,
      routeConfig,
      config
    );
  } else {
    if (routeConfig) {
      if (!routeConfig.useStream) {
        const stages = sortIntoStages(routeConfig);

        const allResponses: FetchedHttpResponse[] = [];

        for (const stage of stages) {
          let promises: Promise<InvokeHttpServiceResult>[] = [];

          for (const pluginName of Object.keys(plugins)) {
            promises = promises.concat(
              plugins[pluginName].handleRequest(
                requestId,
                request,
                route,
                requestMethod,
                stage.stage,
                allResponses,
                stage.services,
                routeConfig,
                config
              )
            );
          }

          const allResponsesInStage = await Promise.all(promises);

          const validResponses = allResponsesInStage
            .filter(responseIsNotSkipped)
            .map((x) => x.response);

          for (const response of validResponses) {
            allResponses.push(response);
          }
        }

        const fetchedResponses =
          (routeConfig.mergeResponses &&
            (await routeConfig.mergeResponses(allResponses, request))) ||
          allResponses;

        let response = mergeResponses(fetchedResponses, config);

        if (responseIsError(response)) {
          const onError = routeConfig.onError || config.http.onError;
          if (onError) {
            onError(fetchedResponses, request);
          }
          for (const pluginName of Object.keys(plugins)) {
            plugins[pluginName].rollback(
              requestId,
              modResult.request,
              route,
              requestMethod,
              config
            );
          }
        }

        // Are there custom handlers for the response?
        const onResponse = routeConfig.onResponse || config.http.onResponse;
        const responseToSend =
          (onResponse && (await onResponse(response, request))) || response;

        sendResponse(
          ctx,
          route,
          requestMethod,
          startTime,
          request,
          responseToSend,
          routeConfig,
          config
        );
      } else {
        const services = Object.keys(routeConfig.services);
        if (services.length === 1) {
          const serviceConfig = routeConfig.services[services[0]];
          for (const pluginName of Object.keys(plugins)) {
            const promise = plugins[pluginName].handleStreamRequest(
              ctx,
              requestId,
              request,
              route,
              requestMethod,
              serviceConfig,
              routeConfig,
              config
            );
          }
        }
      }
    }
  }
}

function responseIsNotSkipped(
  x: InvokeHttpServiceResult
): x is { skip: false; response: FetchedHttpResponse } {
  return !x.skip;
}

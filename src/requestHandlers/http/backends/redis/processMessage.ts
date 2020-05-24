import * as configModule from "../../../../config";
import activeRequests from "./activeRequests";
import responseIsError from "../../../../lib/http/responseIsError";
import { RedisServiceHttpResponse, RouteConfig, FetchedHttpResponse } from "../../../../types/HttpRequests";

export default async function processMessage(
  channel: string,
  messageString: string
) {
  const config = configModule.get();

  const redisResponse = JSON.parse(messageString) as RedisServiceHttpResponse;

  const activeRequestId = `${redisResponse.id}+${redisResponse.service}`;
  const activeRequest = activeRequests.get(activeRequestId);

  if (activeRequest) {
    // We're going to process it. So remove it.
    activeRequests.delete(activeRequestId);

    const routeConfig = config.http.routes[activeRequest.request.path][
      activeRequest.request.method
    ] as RouteConfig;

    const serviceConfig = routeConfig.services[activeRequest.service];
    if (serviceConfig.type === "redis") {
      const channelInRequest = serviceConfig.config.responseChannel;

      // Make sure the service responded in the configured channel
      // Otherwise ignore the message.
      if (channel === channelInRequest) {
        if (responseIsError(redisResponse.response)) {
          if (serviceConfig.onError) {
            serviceConfig.onError(
              redisResponse.response,
              activeRequest.request
            );
          }
        }

        const onServiceResponse = serviceConfig.onResponse;

        const response = onServiceResponse
          ? await onServiceResponse(redisResponse.response)
          : redisResponse.response;

        const processingTime = Date.now() - activeRequest.startTime;

        const fetchedResponse: FetchedHttpResponse = {
          type: "redis",
          id: redisResponse.id,
          time: processingTime,
          path: activeRequest.request.path,
          method: activeRequest.request.method,
          service: activeRequest.service,
          response,
        };

        activeRequest.onResponse({
          skip: false,
          response: fetchedResponse,
        });
      }
    }
  }
}
import { WebSocketProxyAppConfig } from "../../../../types/config";
import respondToWebSocketClient from "../../respond";
import { makeGotOptions } from "../../../../utils/http/gotUtil";
import got, { Response } from "got";
import selectRandomUrl from "../../../../utils/http/selectRandomUrl";
import { HttpRequest } from "../../../../types/http";
import {
  ActiveWebSocketConnection,
  WebSocketClientRequest,
  WebSocketServiceRequest,
  WebSocketServiceResponse,
} from "../../../../types/webSocket";

export default async function handleRequest(
  request: WebSocketServiceRequest,
  conn: ActiveWebSocketConnection,
  config: WebSocketProxyAppConfig
) {
  const routeConfig = config.webSocket.routes[conn.route];

  for (const service of Object.keys(routeConfig.services)) {
    const cfg = routeConfig.services[service];
    if (cfg.type === "http") {
      const serviceConfig = cfg;

      const serviceUrl = selectRandomUrl(cfg.url, cfg.getUrl);

      const httpRequest: HttpRequest = {
        path: await selectRandomUrl(cfg.url, cfg.getUrl),
        method: "POST",
        body: request,
        remoteAddress: conn.remoteAddress,
        remotePort: conn.remotePort,
      };

      const onRequestResult = (serviceConfig.onRequest &&
        (await serviceConfig.onRequest(httpRequest))) || {
        handled: false as false,
        request: httpRequest,
      };

      if (onRequestResult.handled) {
        if (onRequestResult.response) {
          respondToWebSocketClient(onRequestResult.response, conn, config);
        }
      } else {
        const options = makeGotOptions(httpRequest, undefined, undefined);
        got(
          await selectRandomUrl(serviceConfig.url, serviceConfig.getUrl),
          options
        )
          .then(async (serverResponse) => {
            const webSocketResponse: WebSocketServiceResponse = JSON.parse(
              (serverResponse as Response<any>).body
            );
            respondToWebSocketClient(webSocketResponse, conn, config);
          })
          .catch(async (error) => {
            const webSocketResponse: WebSocketServiceResponse = error.response
              ? JSON.parse((error.response as any).body)
              : {
                  id: request.id,
                  type: "message",
                  response: error.message,
                  service,
                };
            respondToWebSocketClient(webSocketResponse, conn, config);
          });
      }
    }
  }
}

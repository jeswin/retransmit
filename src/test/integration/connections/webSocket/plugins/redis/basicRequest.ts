import WebSocket from "ws";
import { TestAppInstance } from "../../..";
import { createClient } from "redis";
import { UserAppConfig } from "../../../../../../types/config";
import startRetransmitTestInstance from "../../../../../utils/startRetransmitTestInstance";
import { TestEnv } from "../../../..";
import {
  WebSocketServiceConnectRequest,
  RedisWebSocketServiceRequestProps,
} from "../../../../../../types/webSocket";

export default async function (app: TestAppInstance, testEnv: TestEnv) {
  it(`gets websocket responses from redis backends`, async () => {
    const config: UserAppConfig = {
      webSocket: {
        routes: {
          "/quotes": {
            services: {
              quoteservice: {
                type: "redis" as "redis",
                requestChannel: "input",
              },
            },
          },
        },
        redis: {
          responseChannel: "output",
        },
      },
    };

    const appControl = await startRetransmitTestInstance({ config });

    app.appControl = appControl;
    const { port } = appControl;

    type ServiceConnectRequest = WebSocketServiceConnectRequest &
      RedisWebSocketServiceRequestProps;

    const promisedConnectRequest = new Promise<ServiceConnectRequest>(
      (success) => {
        const subscriber = createClient();
        subscriber.subscribe("input");
        subscriber.on("message", (channel, messageString) => {
          const message = JSON.parse(messageString);
          if (message.type === "connect") {
            success(message);
          }
        });
      }
    );

    const ws = new WebSocket(`ws://localhost:${port}/quotes`);

    ws.on("open", () => {
      ws.send("HELO");
    });

    const connectRequest: ServiceConnectRequest = await promisedConnectRequest;

    const publisher = createClient();

    publisher.publish(
      connectRequest.responseChannel,
      JSON.stringify({
        id: connectRequest.id,
        service: "quoteservice",
        route: "/quotes",
        message: "GOOG: 1425.1",
      })
    );

    publisher.publish(
      connectRequest.responseChannel,
      JSON.stringify({
        id: connectRequest.id,
        service: "quoteservice",
        route: "/quotes",
        message: "AAPL: 331.8",
      })
    );

    const promisedWSResponses = new Promise<string[]>((success) => {
      const responses: string[] = [];
      ws.on("message", (message: string) => {
        responses.push(message);
        if (responses.length === 2) {
          success(responses);
        }
      });
    });

    const responses = await promisedWSResponses;
    responses.should.deepEqual(["GOOG: 1425.1", "AAPL: 331.8"]);
  });
}

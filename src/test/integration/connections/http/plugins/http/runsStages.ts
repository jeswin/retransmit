import { startBackends, getResponse } from "../../../../../utils/http";
import { TestAppInstance } from "../../..";
import got from "got";
import { UserAppConfig } from "../../../../../../types/config";
import { NativeHttpServiceEndPointConfig } from "../../../../../../types/config/httpProxy";
import startRetransmitTestInstance from "../../../../../utils/startRetransmitTestInstance";
import { TestEnv } from "../../../..";
import { HttpRequestBodyObject } from "../../../../../../types/http";

export default async function (app: TestAppInstance, testEnv: TestEnv) {
  it(`runs stages`, async () => {
    const config: UserAppConfig = {
      http: {
        routes: {
          "/users": {
            POST: {
              services: {
                userservice: {
                  type: "http" as "http",
                  url: "http://localhost:6666/users",
                  stage: 1,
                },
                messageservice: {
                  type: "http" as "http",
                  url: "http://localhost:6667/users",
                  stage: 2,
                  onRequest: async (request, responses) => {
                    return {
                      handled: false,
                      request: {
                        ...request,
                        body: {
                          ...(request.body as HttpRequestBodyObject),
                          userid: (responses[0].response.body as HttpRequestBodyObject)
                            .userid,
                        },
                      },
                    };
                  },
                } as NativeHttpServiceEndPointConfig,
              },
            },
          },
        },
      },
    };

    const appControl = await startRetransmitTestInstance({ config });

    // Start mock servers.
    const backendApps = startBackends([
      {
        port: 6666,
        routes: [
          {
            path: "/users",
            method: "POST",
            handleResponse: async (ctx) => {
              ctx.body = {
                userid: 103,
              };
            },
          },
        ],
      },
      {
        port: 6667,
        routes: [
          {
            path: "/users",
            method: "POST",
            handleResponse: async (ctx) => {
              ctx.body = {
                messages: `There are 10 messages for userid ${ctx.request.body.userid}.`,
              };
            },
          },
        ],
      },
    ]);

    app.appControl = appControl;
    app.mockHttpServers = backendApps;

    const { port } = appControl;

    const promisedResponse = got(`http://localhost:${port}/users`, {
      method: "POST",
      json: { username: "jeswin" },
      retry: 0,
    });

    const serverResponse = await getResponse(promisedResponse);
    serverResponse.statusCode.should.equal(200);
    JSON.parse(serverResponse.body).should.deepEqual({
      userid: 103,
      messages: "There are 10 messages for userid 103.",
    });
  });
}

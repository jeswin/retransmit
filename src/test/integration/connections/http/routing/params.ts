import { startBackends } from "../../../../utils/http";
import { TestAppInstance } from "../..";
import got from "got";
import { UserAppConfig } from "../../../../../types/config";
import startRetransmitTestInstance from "../../../../utils/startRetransmitTestInstance";
import { TestEnv } from "../../..";

export default async function (app: TestAppInstance, testEnv: TestEnv) {
  it(`handles params`, async () => {
    const config: UserAppConfig = {
      http: {
        routes: {
          "/users/:id": {
            GET: {
              services: {
                userservice: {
                  type: "http" as "http",
                  url: "http://localhost:6666/users/:id",
                },
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
            path: "/users/100",
            method: "GET",
            handleResponse: async (ctx) => {
              ctx.body = "hello, world";
            },
          },
        ],
      },
    ]);

    app.appControl = appControl;
    app.mockHttpServers = backendApps;

    const { port } = appControl;

    const serverResponse = await got(`http://localhost:${port}/users/100`, {
      method: "GET",
      retry: 0,
    });

    serverResponse.statusCode.should.equal(200);
    serverResponse.body.should.equal("hello, world");
  });
}

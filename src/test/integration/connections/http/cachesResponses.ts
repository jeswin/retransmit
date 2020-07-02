import { startWithConfiguration } from "../../../..";
import { startBackends, getResponse } from "../../../utils/http";
import { TestAppInstance } from "../../../test";
import random from "../../../../lib/random";
import got from "got";
import {
  IAppConfig,
  RedisStateConfig,
  InMemoryStateConfig,
} from "../../../../types";
import { Response } from "got/dist/source/core";
import { createClient } from "redis";
import { promisify } from "util";

const client = createClient();
const redisFlushAll = promisify(client.flushdb);

function sleep(ms: number): Promise<void> {
  return new Promise((success) => {
    setTimeout(success, ms);
  });
}

export default async function (app: TestAppInstance) {
  function makeConfig(modification: (config: IAppConfig) => IAppConfig) {
    const baseConfig: IAppConfig = {
      instanceId: random(),
      http: {
        routes: {
          "/users": {
            GET: {
              caching: {
                expiry: 200,
              },
              services: {
                userservice: {
                  type: "http" as "http",
                  url: "http://localhost:6666/users",
                },
              },
            },
          },
        },
      },
    };

    return modification(baseConfig);
  }

  const tests: [string, boolean, IAppConfig][] = [
    [
      "caches in memory",
      false,
      makeConfig((cfg) => {
        cfg.state = {
          type: "memory",
        } as InMemoryStateConfig;
        return cfg;
      }),
    ],
    // [
    //   "trips the circuit with redis state",
    //   true,
    //   makeConfig((cfg) => {
    //     cfg.state = {
    //       type: "redis",
    //     } as RedisStateConfig;
    //     return cfg;
    //   }),
    // ],
  ];

  for (const [name, isRedis, config] of tests) {
    it(name, async () => {
      if (isRedis) {
        const client = createClient();
        await redisFlushAll.call(client);
        await sleep(100);
      }

      const servers = await startWithConfiguration(
        undefined,
        "testinstance",
        config
      );

      let userServiceCallCount = 0;

      // Start mock servers.
      const backendApps = startBackends([
        {
          port: 6666,
          routes: [
            {
              path: "/users",
              method: "GET",
              handleResponse: async (ctx) => {
                userServiceCallCount++;
                ctx.body = {
                  user: userServiceCallCount * 100,
                };
              },
            },
          ],
        },
      ]);

      app.servers = {
        ...servers,
        mockHttpServers: backendApps,
      };

      const { port } = app.servers.httpServer.address() as any;

      const promisedResponses: Promise<Response<string>>[] = [];

      for (let i = 0; i <= 5; i++) {
        const promisedResponse = got(`http://localhost:${port}/users`, {
          method: "GET",
          retry: 0,
        });
        promisedResponses.push(getResponse(promisedResponse));

        if (i === 0) {
          await sleep(100);
        }

        if (i === 4) {
          await sleep(200);
        }
      }

      const responses = await Promise.all(promisedResponses);

      userServiceCallCount.should.equal(2);

      responses[0].statusCode.should.equal(500);
      responses[0].body.should.equal("Something happened.");
      responses[2].statusCode.should.equal(500);
      responses[2].body.should.equal("Something happened.");
      responses[3].statusCode.should.equal(503);
      responses[3].body.should.equal("Busy.");
      responses[5].statusCode.should.equal(200);
      JSON.parse(responses[5].body).should.deepEqual({ user: 1, messages: 10 });
    }).timeout(5000);
  }
}
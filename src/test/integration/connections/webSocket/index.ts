import "mocha";
import "should";

import onConnect from "./plugins/onConnect";
import { TestAppInstance } from "../";
import redisBasicRequest from "./plugins/redis/basicRequest";
import { TestEnv } from "../../../test";

export default function run(app: TestAppInstance, testEnv: TestEnv) {
  describe("websocket connections", () => {
    describe("http", () => {
      onConnect(app, testEnv);
    });

    describe("redis", () => {
      redisBasicRequest(app, testEnv);
    });
  });
}

import { AppConfig } from "../../../types";
import { init as periodicJobInit } from "./interval";

export async function init(config: AppConfig) {
  if (config.webJobs) {
    for (const name of Object.keys(config.webJobs)) {
      const job = config.webJobs[name];
      if (job.type === "periodic") {
        await periodicJobInit(name, job, config);
      }
    }
  }
}

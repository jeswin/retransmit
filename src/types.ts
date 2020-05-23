import { IRouterContext } from "koa-router";
import { ClientOpts } from "redis";
import { IncomingHttpHeaders } from "http2";
import HttpRequestContext from "./clients/HttpRequestContext";

export type HttpMethods = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

/*
  Application Config
*/
export interface IAppConfig {
  http: {
    routes: {
      [key: string]: {
        [key in HttpMethods]?: RouteConfig;
      };
    };
    onRequest?: (ctx: HttpRequestContext) => Promise<{ handled: boolean }>;
    onResponse?: (
      ctx: HttpRequestContext,
      response: any
    ) => Promise<{ handled: boolean }>;
    genericErrors?: boolean;
    onError?: (
      responses: FetchedResponse[],
      request: HttpRequest
    ) => Promise<void>;
  };
  websockets?: {
    routes: {
      [key: string]: {
        services: {
          onRequest?: (ctx: HttpRequest) => Promise<{ handled: boolean }>;
        };
      };
    };
    onRequest?: (ctx: HttpRequest) => Promise<{ handled: boolean }>;
  };
  redis?: {
    options?: ClientOpts;
    cleanupInterval?: number;
  };
}

/*
  RouteHandler Config
*/
export type RouteConfig = {
  services: {
    [key: string]: ServiceHandlerConfig;
  };
  onRequest?: (ctx: HttpRequestContext) => Promise<{ handled: boolean }>;
  onResponse?: (
    ctx: HttpRequestContext,
    response: any
  ) => Promise<{ handled: boolean }>;
  mergeResponses?: (responses: FetchedResponse[]) => Promise<FetchedResponse[]>;
  genericErrors?: boolean;
  onError?: (
    responses: FetchedResponse[],
    request: HttpRequest
  ) => Promise<void>;
};

/*
  Service Configuration
*/
export type ServiceHandlerConfigBase = {
  awaitResponse?: boolean;
  merge?: boolean;
  timeout?: number;
  mergeField?: string;
  onServiceResponse?: (
    response: HttpResponse | undefined
  ) => Promise<HttpResponse>;
  onError?: (
    response: HttpResponse | undefined,
    request: HttpRequest
  ) => Promise<void>;
};

export type RedisServiceHandlerConfig = {
  type: "redis";
  config: {
    requestChannel: string;
    responseChannel: string;
    numRequestChannels?: number;
    onServiceRequest?: (request: RedisServiceRequest) => Promise<any>;
    onRollbackRequest?: (request: RedisServiceRequest) => Promise<any>;
  };
} & ServiceHandlerConfigBase;

export type HttpServiceHandlerConfig = {
  type: "http";
  config: {
    url: string;
    rollbackUrl?: string;
    onServiceRequest?: (request: HttpRequest) => Promise<HttpRequest>;
    onRollbackRequest?: (request: HttpRequest) => Promise<HttpRequest>;
  };
} & ServiceHandlerConfigBase;

export type ServiceHandlerConfig =
  | RedisServiceHandlerConfig
  | HttpServiceHandlerConfig;

/*
  Currently active requests
*/
export type ActiveRedisRequest = {
  responseChannel: string;
  id: string;
  timeoutTicks: number;
  service: string;
  startTime: number;
  request: HttpRequest;
  onResponse: (response: FetchedResponse) => void;
};

/*
  Output of processMessages()
*/
export type FetchedResponse = {
  type: "http" | "redis";
  id: string;
  service: string;
  time: number;
  path: string;
  method: HttpMethods;
  response?: HttpResponse;
};

/*
  Requests and Responses for Redis-based Services
*/
export type RedisServiceRequest = {
  id: string;
  type: "request" | "rollback";
  responseChannel: string;
  request: HttpRequest;
};

export type RedisServiceResponse = {
  id: string;
  service: string;
  response: HttpResponse;
};

/*
  Http Request
*/
export type HttpRequest = {
  path: string;
  method: HttpMethods;
  params: {
    [key: string]: string;
  };
  query: {
    [key: string]: string;
  };
  body: any;
  headers: {
    [key: string]: string;
  };
};

/*
  Can be used to form an HttpResponse
*/
export type HttpResponse = {
  status?: number;
  redirect?: string;
  cookies?: HttpCookie[];
  headers?: IncomingHttpHeaders;
  content?: any;
  contentType?: string;
};

export type HttpCookie = {
  name: string;
  value: string;
  path?: string;
  domain?: string;
  secure?: boolean;
  httpOnly?: boolean;
  maxAge?: number;
  overwrite?: boolean;
};

/*
  Web Socket Route Config
*/
export type WebSocketRouteConfig = {
  services: {
    [key: string]: ServiceHandlerConfig;
  };
  onRequest?: (ctx: HttpRequestContext) => Promise<{ handled: boolean }>;
  onResponse?: (
    ctx: HttpRequestContext,
    response: any
  ) => Promise<{ handled: boolean }>;
  mergeResponses?: (responses: FetchedResponse[]) => Promise<FetchedResponse[]>;
  genericErrors?: boolean;
  onError?: (
    responses: FetchedResponse[],
    request: HttpRequest
  ) => Promise<void>;
}
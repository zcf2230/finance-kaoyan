import { onRequestPost as __api_login_js_onRequestPost } from "C:\\Users\\34264\\.zcode\\workspace\\default\\jinrong-kaoyan\\dist-web\\functions\\api\\login.js"
import { onRequestGet as __api_logout_js_onRequestGet } from "C:\\Users\\34264\\.zcode\\workspace\\default\\jinrong-kaoyan\\dist-web\\functions\\api\\logout.js"
import { onRequestPost as __api_logout_js_onRequestPost } from "C:\\Users\\34264\\.zcode\\workspace\\default\\jinrong-kaoyan\\dist-web\\functions\\api\\logout.js"
import { onRequest as __api_login_js_onRequest } from "C:\\Users\\34264\\.zcode\\workspace\\default\\jinrong-kaoyan\\dist-web\\functions\\api\\login.js"
import { onRequest as ___middleware_js_onRequest } from "C:\\Users\\34264\\.zcode\\workspace\\default\\jinrong-kaoyan\\dist-web\\functions\\_middleware.js"

export const routes = [
    {
      routePath: "/api/login",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_login_js_onRequestPost],
    },
  {
      routePath: "/api/logout",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_logout_js_onRequestGet],
    },
  {
      routePath: "/api/logout",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_logout_js_onRequestPost],
    },
  {
      routePath: "/api/login",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api_login_js_onRequest],
    },
  {
      routePath: "/",
      mountPath: "/",
      method: "",
      middlewares: [___middleware_js_onRequest],
      modules: [],
    },
  ]
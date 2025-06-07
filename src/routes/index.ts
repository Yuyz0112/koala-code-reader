import { Hono } from "hono";
import { github } from "./github";
import { flows } from "./flows";

const routes = new Hono();

// Mount GitHub API routes
routes.route("/github", github);

// Mount Flow management routes
routes.route("/flows", flows);

export { routes };

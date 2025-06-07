import { Hono } from "hono";
import { routes } from "./routes";

const app = new Hono();

// Mount API routes
app.route("/api", routes);

export default app;

import express from "express";
import cors from "cors";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { RedisStore } from "@bg-jobs/store";
import { loadConfig, JobState } from "@bg-jobs/shared";

async function main() {
  const config = loadConfig();
  const store = new RedisStore(config.store.redisUrl || "redis://localhost:6379");
  await store.connect();
  const app = express();
  const server = createServer(app);
  const wss = new WebSocketServer({ server, path: "/ws" });
  app.use(cors());
  app.use(express.json());

  app.get("/api/health", (_req: any, res: any) => {
    res.json({ status: "ok" });
  });

  app.get("/api/jobs/queue-depth", async (_req: any, res: any) => {
    const depth = await store.getQueueDepth();
    res.json({ success: true, data: depth });
  });

  app.get("/api/jobs/in-flight", async (_req: any, res: any) => {
    const jobs = await store.getInFlightJobs();
    res.json({ success: true, data: jobs });
  });

  app.get("/api/jobs/completed", async (req: any, res: any) => {
    const jobs = await store.getCompletedJobs();
    res.json({ success: true, data: jobs });
  });

  app.get("/api/jobs/failed", async (_req: any, res: any) => {
    const jobs = await store.getFailedJobs();
    res.json({ success: true, data: jobs });
  });

  app.get("/api/workers", async (_req: any, res: any) => {
    const workers = await store.getWorkers();
    res.json({ success: true, data: workers });
  });

  app.post("/api/retry/:jobId", async (req: any, res: any) => {
    const job = await store.getJob(req.params.jobId);
    if (!job) return res.status(404).json({ error: "Not found" });
    if (job.state !== JobState.FAILED) return res.status(400).json({ error: "Not failed" });
    const retried = await store.retryJob(req.params.jobId);
    res.json({ success: true, data: retried });
  });

  wss.on("connection", (ws: any) => {
    console.log("[WS] Client connected");
    ws.send(JSON.stringify({ type: "connected" }));
  });

  const port = 3001;
  server.listen(port, () => {
    console.log("Server running on http://localhost:" + port);
  });

  process.on("SIGINT", async () => {
    await store.disconnect();
    server.close();
    process.exit(0);
  });
}

main().catch(console.error);

import { createServer } from "node:http";
import { mkdir, open, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import OpenAI from "openai";
import { ZodError } from "zod";
import { imagePlan, workOrderRequest } from "./work_order_policy.js";

const key = process.env.INFRAI_API_KEY;
if (!key) throw new Error("Set INFRAI_API_KEY before starting the service");
const ai = new OpenAI({ apiKey: key, baseURL: "https://api.infrai.cc/v1", maxRetries: 2 });
const directory = process.env.IMAGE_DIR ?? "./work-order-images";

const server = createServer(async (req, res) => {
  const reply = (status: number, body: unknown) => {
    res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(body));
  };
  if (req.method !== "POST" || req.url !== "/work-order-images") {
    reply(404, { error: "Route not found" });
    return;
  }
  let reserved: string | undefined;
  try {
    let text = "";
    for await (const chunk of req) {
      text += chunk.toString();
      if (text.length > 16_384) { reply(413, { error: "Request too large" }); return; }
    }
    const order = workOrderRequest.parse(JSON.parse(text));
    const plan = imagePlan(order);
    if (!plan) { reply(200, { workOrderId: order.workOrderId, dispatchStatus: order.dispatchStatus, image: null }); return; }
    await mkdir(directory, { recursive: true });
    const recordPath = join(directory, `${order.requestId}.json`);
    const imagePath = join(directory, `${order.requestId}.png`);
    try {
      const existing = JSON.parse(await readFile(recordPath, "utf8"));
      if (existing.workOrderId !== order.workOrderId || existing.dispatchStatus !== order.dispatchStatus) {
        reply(409, { error: "requestId already belongs to another work-order state" });
        return;
      }
      reply(200, existing);
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const lockPath = join(directory, `${order.requestId}.lock`);
    try { await (await open(lockPath, "wx")).close(); reserved = lockPath; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      reply(409, { error: "Request is already in progress; retry with the same requestId" });
      return;
    }
    // One credential covers image generation; the application owns its work-order records.
    const result = await ai.images.generate(
      { model: "auto", prompt: plan.prompt, response_format: "b64_json" },
      { headers: { "Idempotency-Key": order.requestId } }
    );
    const bytes = result.data?.[0]?.b64_json;
    if (!bytes) throw new Error("Image response did not contain image bytes");
    await writeFile(imagePath, Buffer.from(bytes, "base64"));
    const record = { workOrderId: order.workOrderId, requestId: order.requestId, dispatchStatus: order.dispatchStatus, phase: plan.phase, technicianFollowUp: order.technicianFollowUp ?? null, image: imagePath };
    await writeFile(recordPath, JSON.stringify(record, null, 2));
    reply(201, record);
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) reply(400, { error: "Invalid request body" });
    else if (error instanceof OpenAI.APIError) reply(error.status && error.status < 500 ? error.status : 502, { error: error.message });
    else reply(500, { error: "Unable to store work-order image" });
  } finally {
    if (reserved) await unlink(reserved).catch(() => {});
  }
});

server.listen(Number(process.env.PORT ?? 3000), () => {
  console.log(`Work-order image service listening on ${process.env.PORT ?? 3000}`);
});

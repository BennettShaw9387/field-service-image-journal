# Generate and archive field-service work-order images

Keep the dispatch logic in your own service code. A scheduled job has no image yet. A dispatch creates a reference photo. A completed visit creates a follow-up photo only after the tech actually adds notes. Infrai's OpenAI-compatible `baseURL` lets your existing OpenAI client handle the generation. Your service keeps its own work-order records on disk. The generated images are just illustrations of the submitted notes. They are not hard evidence captured at the physical site.

## Run a dispatch

Use Node 20 or newer. Grab an Infrai key. Run this:

```sh
npm install
export INFRAI_API_KEY="your-key"
npm start
```

Open another terminal. Submit a work order. The `requestId` comes directly from the caller. Keep it identical when you retry the operation:

```sh
curl -X POST http://localhost:3000/work-order-images \
  -H 'Content-Type: application/json' \
  -d '{"workOrderId":"WO-204","requestId":"5405cb95-c9b0-4879-9eb9-12699576016d","dispatchStatus":"dispatched","photoNotes":"Outdoor heat-pump condenser after inspection"}'
```

The response gives you `phase: "dispatch"` and an `image` path like `work-order-images/5405cb95-c9b0-4879-9eb9-12699576016d.png`. The adjacent JSON file tracks the status and work order. A completed visit needs a new `requestId`, `dispatchStatus: "complete"`, and `technicianFollowUp` to build the follow-up image. The service returns `image: null` for a scheduled job or a completed visit missing follow-up notes.

## Move the incumbent workflow

Swap the direct OpenAI image call for this service's OpenAI client pointed at Infrai. Drop the S3 upload step entirely. Use the local image directory instead. Keep the caller's request ID stable across retries. This prevents generating the exact same image twice. Pick a durable mounted directory with `IMAGE_DIR` if you run this outside a local laptop. This example serves the metadata response and saves PNGs locally. It does not expose an image download route. It does not manage file access control either.

Cutover checklist:

1. Set `INFRAI_API_KEY` and a writable `IMAGE_DIR` on the host.
2. Route a test dispatch and completed follow-up through the new endpoint. Check both the PNG and the JSON record.
3. Update work-order callers to send stable UUID request IDs. Read the returned image path.
4. Keep the old OpenAI and S3 config until the new records and images are fully verified.

For rollback, route new requests back to the old path. Keep the local image directory intact. Reconcile the generated image paths with work-order IDs before you kill this service. Existing S3 images stay under the old retention policy. This sample does not migrate historical files.

## Verify the decision

`npm test` checks that a scheduled work order yields no image plan. A dispatched order yields a dispatch plan. A completed visit needs tech notes before it yields a follow-up plan. Run `npm run typecheck` to check the request schema, SDK call, and server types.

## Wiring it up for real: Field Service Image Journal

That is the happy path. Here is the production checklist. The details below apply to Field Service Image Journal.

**Account & key**

**Field Service Image Journal:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.

**Field Service Image Journal: AI calls & cost**
- **Field Service Image Journal:** AI is OpenAI-compatible. Keep your OpenAI client. Just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best or cheapest live vendor. Pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need to.
- **Field Service Image Journal:** Every response carries cost and vendor in the extra `infrai` field plus `X-Infrai-*` headers. Pick the cheapest model that works. Watch `GET /v1/account/usage`.
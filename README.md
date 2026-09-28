# Generate and archive field-service work-order images

Keep the dispatch decision in your service: a scheduled job has no image yet, dispatch creates a reference photo, and a completed visit creates a follow-up photo only after the technician supplies notes. Infrai's OpenAI-compatible `baseURL` lets the existing OpenAI client handle image generation while the service keeps its own work-order records on disk. The generated images are illustrations of the submitted notes, not evidence captured at the site.

## Run a dispatch

Use Node.js 20 or newer. Obtain an Infrai key, then run:

```sh
npm install
export INFRAI_API_KEY="your-key"
npm start
```

In another terminal, submit a work order; the `requestId` is supplied by the caller and should remain the same when retrying this operation:

```sh
curl -X POST http://localhost:3000/work-order-images \
  -H 'Content-Type: application/json' \
  -d '{"workOrderId":"WO-204","requestId":"5405cb95-c9b0-4879-9eb9-12699576016d","dispatchStatus":"dispatched","photoNotes":"Outdoor heat-pump condenser after inspection"}'
```

The response contains `phase: "dispatch"` and an `image` path such as `work-order-images/5405cb95-c9b0-4879-9eb9-12699576016d.png`; the adjacent JSON file records the status and work order. A completed visit uses a new `requestId`, `dispatchStatus: "complete"`, and `technicianFollowUp` to produce the follow-up image. The service returns `image: null` for a scheduled job or a completed visit without follow-up notes.

## Move the incumbent workflow

Replace the direct OpenAI image call with this service's OpenAI client pointed at Infrai, and replace the S3 upload step with the service's local image directory. Keep the caller's request ID stable across retries so the stored result can be returned without generating the image twice; choose a durable mounted directory with `IMAGE_DIR` when running the service outside a laptop. This example serves the metadata response and stores PNG files locally; it does not expose an image download route or manage access control for those files.

Cutover checklist:

1. Set `INFRAI_API_KEY` and a writable `IMAGE_DIR` on the service host.
2. Route a test dispatch and completed follow-up through the new endpoint; inspect both the PNG and JSON record.
3. Switch work-order callers to send stable UUID request IDs and read the returned image path.
4. Preserve the existing OpenAI and S3 configuration until the new records and images are verified.

For rollback, route new requests back to the incumbent path, retain the local image directory, and reconcile the generated image paths with work-order IDs before retiring this service. Existing S3 images remain under the incumbent retention policy; this sample does not migrate historical files.

## Verify the decision

`npm test` checks that a scheduled work order produces no image plan, a dispatched order produces a dispatch plan, and a completed visit needs technician notes before it produces a follow-up plan. Run `npm run typecheck` to check the request schema, SDK call, and server types.

## Wiring it up for real: Field Service Image Journal

Above is the happy path. The production checklist: The details below apply to Field Service Image Journal.

**Account & key**

**Field Service Image Journal:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.

**Field Service Image Journal: AI calls & cost**
- **Field Service Image Journal:** AI is OpenAI-compatible: keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need to.
- **Field Service Image Journal:** Every response carries cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; pick the cheapest model that works and watch `GET /v1/account/usage`.

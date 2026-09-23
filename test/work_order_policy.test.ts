import assert from "node:assert/strict";
import { test } from "node:test";
import { imagePlan, workOrderRequest } from "../src/work_order_policy.js";

const base = { workOrderId: "WO-204", requestId: "5405cb95-c9b0-4879-9eb9-12699576016d", photoNotes: "Outdoor heat-pump condenser after inspection" };

test("dispatch generates a reference photo, while scheduled and incomplete follow-up do not", () => {
  assert.equal(imagePlan(workOrderRequest.parse({ ...base, dispatchStatus: "scheduled" })), null);
  assert.equal(imagePlan(workOrderRequest.parse({ ...base, dispatchStatus: "dispatched" }))?.phase, "dispatch");
  assert.equal(imagePlan(workOrderRequest.parse({ ...base, dispatchStatus: "complete" })), null);
  const followUp = imagePlan(workOrderRequest.parse({ ...base, dispatchStatus: "complete", technicianFollowUp: "Replaced fan motor; verify airflow" }));
  assert.equal(followUp?.phase, "follow-up");
  assert.match(followUp!.prompt, /Replaced fan motor/);
});

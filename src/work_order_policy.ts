import { z } from "zod";

export const workOrderRequest = z.object({
  workOrderId: z.string().min(1).max(80),
  requestId: z.string().uuid(),
  dispatchStatus: z.enum(["scheduled", "dispatched", "complete"]),
  photoNotes: z.string().min(1).max(1000),
  technicianFollowUp: z.string().min(1).max(1000).optional()
}).strict();

export type WorkOrderRequest = z.infer<typeof workOrderRequest>;

export function imagePlan(order: WorkOrderRequest) {
  if (order.dispatchStatus === "scheduled") return null;
  if (order.dispatchStatus === "complete" && !order.technicianFollowUp) return null;
  const phase = order.dispatchStatus === "complete" ? "follow-up" : "dispatch";
  return {
    phase,
    prompt: `Create a realistic field-service work-order reference photo. Work order: ${order.workOrderId}. Phase: ${phase}. Scene: ${order.photoNotes}. Technician follow-up: ${order.technicianFollowUp ?? "pending"}. Do not include readable text or personal information in the image.`
  };
}

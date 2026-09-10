import { handleApprovalWorkflowGet, handleApprovalWorkflowPost } from "../../../../lib/approval-workflow-api.ts";

export const runtime = "nodejs";
export const GET = handleApprovalWorkflowGet;
export const POST = handleApprovalWorkflowPost;

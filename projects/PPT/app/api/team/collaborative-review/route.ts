import { handleCollaborativeReviewGet, handleCollaborativeReviewPost } from "../../../../lib/collaborative-review-api.ts";

export const runtime = "nodejs";
export const GET = handleCollaborativeReviewGet;
export const POST = handleCollaborativeReviewPost;

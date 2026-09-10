import { handleBrandGovernanceGet, handleBrandGovernancePost } from "../../../../lib/brand-governance-api.ts";

export const runtime = "nodejs";
export const GET = handleBrandGovernanceGet;
export const POST = handleBrandGovernancePost;

import { Router, type IRouter } from "express";
import { ListProvidersResponse } from "@workspace/api-zod";
import { listProviderInfo } from "../lib/providers";
import { requireAuth } from "../lib/rbac";

const router: IRouter = Router();

// The data-source provider catalog is global (not tenant-scoped): it tells the
// UI which sources exist so a tenant can pick one. Auth-only — any signed-in
// user may read it.
router.get("/providers", requireAuth, (_req, res): void => {
  res.json(ListProvidersResponse.parse({ providers: listProviderInfo() }));
});

export default router;

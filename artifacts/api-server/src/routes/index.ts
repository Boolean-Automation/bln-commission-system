import { Router, type IRouter } from "express";
import authRouter from "./auth";
import accessRouter from "./access";
import healthRouter from "./health";
import tenantsRouter from "./tenants";
import peopleRouter from "./people";
import schemaRouter from "./schema";
import positionsRouter from "./positions";
import rulesRouter from "./rules";
import commissionsRouter from "./commissions";
import insightsRouter from "./insights";
import manualInputsRouter from "./manualInputs";
import reportsRouter from "./reports";
import repDashboardRouter from "./repDashboard";
import airtableRouter from "./airtable";
import providersRouter from "./providers";
import { requireAuth } from "../lib/rbac";

const router: IRouter = Router();

// Public: authentication flow + health.
router.use(authRouter);
router.use(healthRouter);

// Everything below requires an authenticated session; requireAuth attaches the
// resolved RBAC context (req.authContext) used by the per-route guards.
router.use(requireAuth);

router.use(accessRouter);
router.use(tenantsRouter);
router.use(peopleRouter);
router.use(schemaRouter);
router.use(positionsRouter);
router.use(rulesRouter);
router.use(commissionsRouter);
router.use(insightsRouter);
router.use(manualInputsRouter);
router.use(reportsRouter);
router.use(repDashboardRouter);
router.use(airtableRouter);
router.use(providersRouter);

export default router;

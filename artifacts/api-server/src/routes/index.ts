import { Router, type IRouter } from "express";
import healthRouter from "./health";
import tenantsRouter from "./tenants";
import peopleRouter from "./people";
import schemaRouter from "./schema";
import positionsRouter from "./positions";
import rulesRouter from "./rules";
import commissionsRouter from "./commissions";
import insightsRouter from "./insights";
import airtableRouter from "./airtable";

const router: IRouter = Router();

router.use(healthRouter);
router.use(tenantsRouter);
router.use(peopleRouter);
router.use(schemaRouter);
router.use(positionsRouter);
router.use(rulesRouter);
router.use(commissionsRouter);
router.use(insightsRouter);
router.use(airtableRouter);

export default router;

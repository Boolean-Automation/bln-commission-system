import { Router, type IRouter } from "express";
import healthRouter from "./health";
import tenantsRouter from "./tenants";
import peopleRouter from "./people";
import schemaRouter from "./schema";
import rulesRouter from "./rules";
import commissionsRouter from "./commissions";
import insightsRouter from "./insights";

const router: IRouter = Router();

router.use(healthRouter);
router.use(tenantsRouter);
router.use(peopleRouter);
router.use(schemaRouter);
router.use(rulesRouter);
router.use(commissionsRouter);
router.use(insightsRouter);

export default router;

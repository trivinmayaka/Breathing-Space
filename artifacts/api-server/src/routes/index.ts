import { Router, type IRouter } from "express";
import healthRouter from "./health";
import forexRouter from "./forex";
import adminRouter from "./admin";
import realRouter from "./real";
import depositsRouter from "./deposits";

const router: IRouter = Router();

router.use(healthRouter);
router.use(forexRouter);
router.use(adminRouter);
router.use(realRouter);
router.use(depositsRouter);

export default router;

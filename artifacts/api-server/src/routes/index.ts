import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import accountRouter from "./accounts";
import storageRouter from "./storage";
import marketplaceRouter from "./marketplace";
import locationRouter from "./location";
import aiRouter from "./ai";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(accountRouter);
router.use(storageRouter);
router.use(marketplaceRouter);
router.use(locationRouter);
router.use(aiRouter);

export default router;

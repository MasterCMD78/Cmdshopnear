import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import accountRouter from "./accounts";
import storageRouter from "./storage";
import marketplaceRouter from "./marketplace";
import locationRouter from "./location";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(accountRouter);
router.use(storageRouter);
router.use(marketplaceRouter);
router.use(locationRouter);

export default router;

import { Router } from "@webtools/expressapi";

import healthRouter from "@/routes/health.ts";
import lecturesRouter from "@/routes/lectures/index.ts";
import subjectsRouter from "@/routes/subjects.ts";
import tagsRouter from "@/routes/tags.ts";

export default new Router()
	.use(healthRouter)
	.use("/lectures", lecturesRouter)
	.use("/subjects", subjectsRouter)
	.use("/tags", tagsRouter);

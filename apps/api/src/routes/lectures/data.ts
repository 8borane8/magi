import { Router } from "@webtools/expressapi";

import type { Lecture } from "@/models/lecture.ts";
import * as storage from "@/services/storage.ts";
import { sendFile } from "@/utils/files.ts";

export default new Router<{ lecture: Lecture }>()
	.get("/:lectureId/data/resume", (req, res) => sendFile(req, res, storage.resumePath(req.data.lecture.id)))
	.get("/:lectureId/data/record", (req, res) => sendFile(req, res, storage.recordPath(req.data.lecture.id)));

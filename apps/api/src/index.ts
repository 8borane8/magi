import { SessionStatus } from "@magi/shared/types/session";
import { importModels, Sequelize } from "@sequelize/core";
import { SqliteDialect } from "@sequelize/sqlite3";
import { Lecture } from "@/models/lecture.ts";
import { config } from "@/config.ts";
import { join } from "@std/path";

await Deno.mkdir(config.lecturesDir, { recursive: true });

const sequelize = new Sequelize({
	dialect: SqliteDialect,
	storage: config.databasePath,
	models: await importModels(join(import.meta.dirname!, "models/*.ts").replaceAll("\\", "/")),
});

await sequelize.authenticate();
await sequelize.sync({ alter: true });

// No client owns a recording after a process restart.
await Lecture.update({ status: SessionStatus.PAUSED }, { where: { status: SessionStatus.RECORDING } });

import { HttpServer } from "@webtools/expressapi";
import mainRouter from "@/routes/index.ts";

const httpServer = new HttpServer()
	.onError((error) => {
		console.error(error);
	})
	.use(mainRouter);

export type AppRouter = typeof httpServer;
httpServer.listen(Number(Deno.env.get("API_PORT")!));

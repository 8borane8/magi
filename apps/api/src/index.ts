import { join } from "@std/path";
import { importModels, Sequelize } from "@sequelize/core";
import { SqliteDialect } from "@sequelize/sqlite3";
import { config } from "@/config.ts";

await Deno.mkdir(config.lecturesDir, { recursive: true });

const sequelize = new Sequelize({
	dialect: SqliteDialect,
	storage: config.databasePath,
	models: await importModels(join(import.meta.dirname!, "models/*.ts").replaceAll("\\", "/")),
});

await sequelize.authenticate();
await sequelize.sync({ alter: true });

import { HttpServer } from "@webtools/expressapi";
import mainRouter from "@/routes/index.ts";
import * as recording from "@/services/recording.ts";

await recording.pauseOrphanedRecordings();

const httpServer = new HttpServer()
	.onError((error) => {
		console.error(error);
	})
	.use(mainRouter);

export type AppRouter = typeof httpServer;
httpServer.listen(Number(Deno.env.get("API_PORT")!));

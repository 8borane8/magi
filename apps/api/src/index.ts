import { failStaleProcessing, startStaleWatch } from "@/services/recording.ts";
import { importModels, Sequelize } from "@sequelize/core";
import { SqliteDialect } from "@sequelize/sqlite3";
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

await failStaleProcessing();
startStaleWatch();

import { HttpServer } from "@webtools/expressapi";
import mainRouter from "@/routes/index.ts";

const httpServer = new HttpServer()
	.use(mainRouter);

export type AppRouter = typeof httpServer;
httpServer.listen(Number(Deno.env.get("API_PORT")));

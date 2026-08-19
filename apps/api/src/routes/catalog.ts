import { Router, z } from "@webtools/expressapi";

type CatalogItem = {
	id: string;
	name: string;
	color: string;
	toJSON: () => object;
	destroy: () => Promise<unknown>;
};

export type CatalogModel = {
	findAll: (options: { order: [string, string][] }) => Promise<CatalogItem[]>;
	upsert: (values: { id?: string; name: string; color: string }) => Promise<unknown>;
	findByPk: (id: string) => Promise<CatalogItem | null>;
};

export function catalogRouter(
	model: CatalogModel,
	options: {
		param: string;
		nameMax: number;
		counts: () => Promise<Map<string, number>>;
	},
) {
	const { param, nameMax, counts } = options;

	return new Router()
		.get("/", async (_req, res) => {
			const [items, lectureCounts] = await Promise.all([
				model.findAll({ order: [["name", "ASC"]] }),
				counts(),
			]);

			return res.json({
				success: true as const,
				data: items.map((item) => ({
					...item.toJSON(),
					lectureCount: lectureCounts.get(item.id) || 0,
				})),
			});
		})
		.put(
			"/",
			async (req, res) => {
				await model.upsert(req.body);
				return res.json({ success: true });
			},
			[],
			{
				body: z.object({
					id: z.optional(z.string().uuid()),
					name: z.string().min(1).max(nameMax),
					color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
				}),
			},
		)
		.delete(`/:${param}`, async (req, res) => {
			const item = await model.findByPk(String(req.params[param]));
			if (!item) {
				return res.status(404).json({
					success: false,
					error: "404 Not Found.",
				});
			}

			await item.destroy();
			return res.json({ success: true });
		});
}

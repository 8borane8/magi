import {
	type CreationOptional,
	DataTypes,
	type InferAttributes,
	type InferCreationAttributes,
	Model,
	type NonAttribute,
} from "@sequelize/core";
import { Attribute, BelongsToMany, Default, NotNull, PrimaryKey, Unique } from "@sequelize/core/decorators-legacy";

import { LectureTag } from "./lecture-tag.ts";
import { Lecture } from "./lecture.ts";

export class Tag extends Model<InferAttributes<Tag>, InferCreationAttributes<Tag>> {
	@Attribute(DataTypes.UUID)
	@Default(DataTypes.UUIDV4)
	@PrimaryKey
	declare id: CreationOptional<string>;

	@Attribute(DataTypes.STRING)
	@NotNull
	@Unique
	declare name: string;

	@Attribute(DataTypes.STRING)
	@NotNull
	declare color: string;

	@BelongsToMany(() => Lecture, {
		through: () => LectureTag,
		foreignKey: { name: "tagId", onDelete: "CASCADE" },
		otherKey: { name: "lectureId", onDelete: "CASCADE" },
		inverse: { as: "tags" },
	})
	declare lectures?: NonAttribute<Lecture[]>;

	declare createdAt: CreationOptional<Date>;
	declare updatedAt: CreationOptional<Date>;
}

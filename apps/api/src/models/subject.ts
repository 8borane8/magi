import {
	type CreationOptional,
	DataTypes,
	type InferAttributes,
	type InferCreationAttributes,
	Model,
	type NonAttribute,
} from "@sequelize/core";
import { Attribute, Default, HasMany, NotNull, PrimaryKey, Unique } from "@sequelize/core/decorators-legacy";

import { Lecture } from "./lecture.ts";

export class Subject extends Model<InferAttributes<Subject>, InferCreationAttributes<Subject>> {
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

	@Attribute(DataTypes.BOOLEAN)
	@Default(false)
	@NotNull
	declare archived: CreationOptional<boolean>;

	@HasMany(() => Lecture, "subjectId")
	declare lectures?: NonAttribute<Lecture[]>;

	declare createdAt: CreationOptional<Date>;
	declare updatedAt: CreationOptional<Date>;
}

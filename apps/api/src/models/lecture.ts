import {
	type CreationOptional,
	DataTypes,
	type InferAttributes,
	type InferCreationAttributes,
	Model,
	type NonAttribute,
} from "@sequelize/core";
import {
	Attribute,
	BelongsTo,
	BelongsToMany,
	Default,
	Index,
	NotNull,
	PrimaryKey,
} from "@sequelize/core/decorators-legacy";

import { SessionStatus } from "@magi/shared/types/session";
import { LectureTag } from "./lecture-tag.ts";
import { Subject } from "./subject.ts";
import { Tag } from "./tag.ts";

export class Lecture extends Model<InferAttributes<Lecture>, InferCreationAttributes<Lecture>> {
	@Attribute(DataTypes.UUID)
	@Default(DataTypes.UUIDV4)
	@PrimaryKey
	declare id: CreationOptional<string>;

	@Attribute(DataTypes.STRING)
	declare title: string | null;

	@Attribute(DataTypes.TEXT)
	declare notes: string | null;

	@Attribute(DataTypes.UUID)
	@Index
	declare subjectId: string | null;

	@BelongsTo(() => Subject, {
		foreignKey: { name: "subjectId", onDelete: "SET NULL" },
		inverse: { type: "hasMany", as: "lectures" },
	})
	declare subject?: NonAttribute<Subject>;

	@BelongsToMany(() => Tag, {
		through: () => LectureTag,
		foreignKey: { name: "lectureId", onDelete: "CASCADE" },
		otherKey: { name: "tagId", onDelete: "CASCADE" },
		inverse: { as: "lectures" },
	})
	declare tags?: NonAttribute<Tag[]>;

	@Attribute(DataTypes.ENUM(...Object.values(SessionStatus)))
	@Default(SessionStatus.RECORDING)
	@NotNull
	@Index
	declare status: CreationOptional<SessionStatus>;

	@Attribute(DataTypes.INTEGER)
	@Default(0)
	@NotNull
	declare audioMs: CreationOptional<number>;

	@Attribute(DataTypes.INTEGER)
	@Default(0)
	@NotNull
	declare audioBytes: CreationOptional<number>;

	@Attribute(DataTypes.INTEGER)
	declare lastSeq: number | null;

	@Attribute(DataTypes.DATE)
	declare lastChunkAt: Date | null;

	declare createdAt: CreationOptional<Date>;
	declare updatedAt: CreationOptional<Date>;
}

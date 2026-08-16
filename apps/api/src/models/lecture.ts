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
	HasMany,
	NotNull,
	PrimaryKey,
} from "@sequelize/core/decorators-legacy";

import { SessionStatus } from "@magi/shared/types/session";
import { ChatMessage } from "./chat-message.ts";
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
	declare subjectId: string | null;

	@BelongsTo(() => Subject, "subjectId")
	declare subject?: NonAttribute<Subject>;

	@BelongsToMany(() => Tag, {
		through: () => LectureTag,
		foreignKey: { name: "lectureId" },
		otherKey: { name: "tagId" },
	})
	declare tags?: NonAttribute<Tag[]>;

	@Attribute(DataTypes.ENUM(...Object.values(SessionStatus)))
	@Default(SessionStatus.RECORDING)
	@NotNull
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

	@HasMany(() => ChatMessage, "lectureId")
	declare chatMessages?: NonAttribute<ChatMessage[]>;

	declare createdAt: CreationOptional<Date>;
	declare updatedAt: CreationOptional<Date>;
}

import { mkdir, unlink, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import type { AvatarUpload, DistanceUnit, HouseholdMember, Me, UserSummary } from "@placard/domain"
import { MediaNotFound, MediaRejected } from "@placard/domain"
import { Context, DateTime, Effect, Layer, Option } from "effect"
import { SqlClient } from "effect/sql"
import sharp from "sharp"
import { AppConfig } from "../config.ts"
import type { UserRole } from "../db/schema.ts"

const AVATAR_EDGE = 256
const AVATAR_MAX_BYTES = 5 * 1024 * 1024
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"])

interface UserRow {
  readonly id: string
  readonly name: string
  readonly email: string
  readonly role: UserRole
  readonly distance_unit: DistanceUnit
  readonly image: string | null
  readonly created_at: Date
}

/** Session/user row without instance flags (those are attached by Auth / Me API). */
export type MeBase = Omit<Me, "householdEnabled">

const avatarPublicUrl = (userId: string) => `/api/avatars/${userId}`

const avatarRelativePath = (userId: string) => `avatars/${userId}.webp`

const toMeBase = (row: UserRow): MeBase => ({
  id: row.id,
  name: row.name,
  email: row.email,
  role: row.role,
  distanceUnit: row.distance_unit,
  image: row.image,
})

const toSummary = (row: UserRow): UserSummary => ({
  id: row.id,
  name: row.name,
  email: row.email,
  role: row.role,
  image: row.image,
  createdAt: DateTime.fromDateUnsafe(row.created_at),
})

const sniffMime = (bytes: Uint8Array): string | null => {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg"
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png"
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp"
  }
  return null
}

export class Users extends Context.Service<
  Users,
  {
    readonly get: (id: string) => Effect.Effect<Option.Option<MeBase>>
    readonly list: Effect.Effect<ReadonlyArray<UserSummary>>
    readonly householdMembers: Effect.Effect<ReadonlyArray<HouseholdMember>>
    readonly emailExists: (email: string) => Effect.Effect<boolean>
    readonly setDistanceUnit: (id: string, unit: DistanceUnit) => Effect.Effect<MeBase>
    readonly updateProfile: (id: string, name: string) => Effect.Effect<MeBase>
    readonly setAvatar: (id: string, upload: AvatarUpload) => Effect.Effect<MeBase, MediaRejected>
    readonly clearAvatar: (id: string) => Effect.Effect<MeBase>
    readonly resolveAvatarFile: (
      id: string,
    ) => Effect.Effect<{ readonly absolutePath: string; readonly mimeType: string }, MediaNotFound>
  }
>()("placard/Users") {
  static readonly layer = Layer.effect(
    Users,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const config = yield* AppConfig
      const root = config.mediaDir
      const columns = sql`id, name, email, role, distance_unit, image, created_at`

      const requireRow = (id: string, rows: ReadonlyArray<UserRow>) =>
        rows[0] ? Effect.succeed(toMeBase(rows[0])) : Effect.die(`user ${id} not found`)

      const unlinkAvatar = (id: string) =>
        Effect.promise(() =>
          unlink(join(root, avatarRelativePath(id))).catch(() => undefined),
        ).pipe(Effect.asVoid)

      return {
        get: (id) =>
          sql<UserRow>`select ${columns} from users where id = ${id}`.pipe(
            Effect.map((rows) => Option.fromNullishOr(rows[0]).pipe(Option.map(toMeBase))),
            Effect.orDie,
          ),
        list: sql<UserRow>`select ${columns} from users order by created_at`.pipe(
          Effect.map((rows) => rows.map(toSummary)),
          Effect.orDie,
        ),
        householdMembers: sql<{ id: string; name: string; image: string | null }>`
          select id, name, image from users order by lower(name), created_at`.pipe(
          Effect.map((rows) =>
            rows.map((row) => ({ id: row.id, name: row.name, image: row.image })),
          ),
          Effect.orDie,
        ),
        emailExists: (email) =>
          sql`select 1 from users where lower(email) = lower(${email})`.pipe(
            Effect.map((rows) => rows.length > 0),
            Effect.orDie,
          ),
        setDistanceUnit: (id, unit) =>
          sql<UserRow>`
            update users set distance_unit = ${unit}, updated_at = now()
            where id = ${id} returning ${columns}`.pipe(
            Effect.flatMap((rows) => requireRow(id, rows)),
            Effect.orDie,
          ),
        updateProfile: (id, name) =>
          sql<UserRow>`
            update users set name = ${name}, updated_at = now()
            where id = ${id} returning ${columns}`.pipe(
            Effect.flatMap((rows) => requireRow(id, rows)),
            Effect.orDie,
          ),
        setAvatar: (id, upload) =>
          Effect.gen(function* () {
            let bytes: Buffer
            try {
              bytes = Buffer.from(upload.contentBase64, "base64")
            } catch {
              return yield* new MediaRejected({ message: "Could not decode the image." })
            }
            if (bytes.byteLength === 0 || bytes.byteLength > AVATAR_MAX_BYTES) {
              return yield* new MediaRejected({
                message: "Avatar must be an image under 5 MB.",
              })
            }
            const sniffed = sniffMime(bytes)
            if (!sniffed || !ALLOWED_MIME.has(sniffed)) {
              return yield* new MediaRejected({
                message: "Avatar must be a JPEG, PNG, or WebP image.",
              })
            }
            const relative = avatarRelativePath(id)
            const absolute = join(root, relative)
            const webp = yield* Effect.tryPromise({
              try: () =>
                sharp(bytes, { failOn: "truncated" })
                  .rotate()
                  .resize(AVATAR_EDGE, AVATAR_EDGE, { fit: "cover", position: "centre" })
                  .webp({ quality: 82 })
                  .toBuffer(),
              catch: (cause) =>
                new MediaRejected({
                  message: cause instanceof Error ? cause.message : "Could not process image.",
                }),
            })
            yield* Effect.tryPromise({
              try: async () => {
                await mkdir(dirname(absolute), { recursive: true })
                await writeFile(absolute, webp)
              },
              catch: () => new MediaRejected({ message: "Could not save the avatar." }),
            })
            const image = avatarPublicUrl(id)
            return yield* sql<UserRow>`
              update users set image = ${image}, updated_at = now()
              where id = ${id} returning ${columns}`.pipe(
              Effect.flatMap((rows) => requireRow(id, rows)),
              Effect.orDie,
            )
          }),
        clearAvatar: (id) =>
          Effect.gen(function* () {
            yield* unlinkAvatar(id)
            return yield* sql<UserRow>`
              update users set image = null, updated_at = now()
              where id = ${id} returning ${columns}`.pipe(
              Effect.flatMap((rows) => requireRow(id, rows)),
              Effect.orDie,
            )
          }),
        resolveAvatarFile: (id) =>
          Effect.gen(function* () {
            const rows = yield* sql<{ image: string | null }>`
              select image from users where id = ${id}`.pipe(Effect.orDie)
            if (!rows[0]?.image) return yield* new MediaNotFound()
            return {
              absolutePath: join(root, avatarRelativePath(id)),
              mimeType: "image/webp",
            }
          }),
      }
    }),
  )
}
